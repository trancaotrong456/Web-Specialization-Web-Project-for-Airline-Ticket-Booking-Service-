'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const authorizedCiDatabase = process.env.RUN_MYSQL_BUSINESS_TESTS === '1'
  && process.env.NODE_ENV === 'test'
  && process.env.DB_NAME === 'airline_booking_ci_test';

test('real MySQL business and concurrency integration', { skip: !authorizedCiDatabase }, async (t) => {
  if (!authorizedCiDatabase) throw new Error('Refusing MySQL business tests outside the isolated GitHub Actions database.');

  const db = require('../models');
  const { Op } = require('sequelize');
  const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');
  const BookingService = require('../modules/booking/booking.service');
  const { SeatSelectionService } = require('../modules/seat-selection/seatSelection.service');
  const SequelizeSeatSelectionRepository = require('../modules/seat-selection/seatSelection.repository');
  const { AncillariesService } = require('../modules/ancillaries/ancillaries.service');
  const { SequelizeAncillariesRepository } = require('../modules/ancillaries/ancillaries.repository');
  const PaymentService = require('../modules/payment/payment.service');
  const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
  const { signPayosDemoPayload } = require('../utils/checksum.util');
  const FlightService = require('../modules/flight/flight.service');
  const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
  const { createFlightStatusNotificationAdapter } = require('../modules/notification/flightStatusNotificationAdapter');
  const { NotificationEventPublisher } = require('../modules/notification/notificationEventPublisher');
  const { SequelizeNotificationOutboxRepository } = require('../modules/notification/notificationOutbox.repository');

  await db.sequelize.authenticate();
  const [identityRows] = await db.sequelize.query(
    'SELECT DATABASE() AS database_name, @@port AS server_port, @@global.read_only AS read_only',
  );
  assert.equal(identityRows[0].database_name, 'airline_booking_ci_test');
  assert.equal(Number(identityRows[0].read_only), 0);

  const prefix = `ci${process.pid}${Date.now().toString(36)}`.slice(-18);
  const fixtures = [];
  const noopSocket = () => ({ to: () => ({ emit() {} }), emit() {} });
  const transactionManager = { transaction: (work) => db.sequelize.transaction(work) };
  const publisher = new NotificationEventPublisher({
    NotificationOutbox: db.NotificationOutbox,
    Notification: db.Notification,
    User: db.User,
  });

  async function createFixture() {
    const fixture = { flightIds: [], fareClassIds: [], bookingIds: [], outboxIds: [], serviceIds: [], roleId: null, userId: null, airlineId: null, airportIds: [], templateIds: [] };
    fixtures.push(fixture);
    const token = `${prefix}${fixtures.length}`;
    const role = await db.Role.create({ name: `ci_${token}`, description: 'Disposable integration fixture' });
    fixture.roleId = role.id;
    const user = await db.User.create({ role_id: role.id, full_name: 'CI Customer', email: `${token}@example.test`, password_hash: 'ci-only-not-a-real-password-hash' });
    fixture.userId = user.id;
    const codeToken = fixtures.length.toString(36).toUpperCase().padStart(2, '0').slice(-2);
    const airline = await db.Airline.create({ name: `CI Airline ${token}`, iata_code: `A${codeToken}`, logo_url: null });
    fixture.airlineId = airline.id;
    const airports = await Promise.all(['A', 'B', 'C'].map((suffix, index) => db.Airport.create({
      iata_code: `${codeToken}${suffix}`,
      name: `CI Airport ${token} ${suffix}`, city: `CI City ${index}`, country: 'Test',
    })));
    fixture.airportIds = airports.map((airport) => airport.id);
    const now = Date.now() + 10 * 24 * 60 * 60 * 1000;
    const makeFlight = async ({ from = 0, to = 1, hourOffset = 0, status = 'scheduled', seats = 10, quota = 10, className = 'Economy' } = {}) => {
      const departure = new Date(now + hourOffset * 60 * 60 * 1000);
      const arrival = new Date(departure.getTime() + 2 * 60 * 60 * 1000);
      const flight = await db.Flight.create({ airline_id: airline.id, departure_airport_id: airports[from].id, arrival_airport_id: airports[to].id, departure_time: departure, arrival_time: arrival, total_seats: seats, available_seats: seats, status });
      fixture.flightIds.push(flight.id);
      const fareClass = await db.FareClass.create({ flight_id: flight.id, class_name: className, price: '1250000.00', seat_quota: quota });
      fixture.fareClassIds.push(fareClass.id);
      return { flight, fareClass };
    };

    const bookingRepository = new SequelizeBookingRepository(db);
    const seatRepository = new SequelizeSeatSelectionRepository({ SeatMapTemplate: db.SeatMapTemplate, FlightSeatMap: db.FlightSeatMap, FlightSeat: db.FlightSeat, Flight: db.Flight, FareClass: db.FareClass });
    const seatService = new SeatSelectionService({ repository: seatRepository, transactionManager });
    const ancillaryRepository = new SequelizeAncillariesRepository(db);
    const ancillaryService = new AncillariesService({ repository: ancillaryRepository, transactionManager });
    const bookingService = new BookingService({
      repository: bookingRepository, transactionManager, socket: noopSocket,
      flightSeatService: { checkAndEmitSeatWarning: async () => {} },
      seatSelectionService: seatService, ancillaryService, notificationPublisher: publisher,
    });
    const flightRepository = new SequelizeFlightRepository({ sequelize: db.sequelize, Flight: db.Flight, Airline: db.Airline, Airport: db.Airport, FareClass: db.FareClass, Booking: db.Booking, BookingSegment: db.BookingSegment, FlightStatusHistory: db.FlightStatusHistory, User: db.User, Op });
    const flightService = new FlightService({ repository: flightRepository, getIO: noopSocket });
    const paymentRepository = new SequelizePaymentRepository(db);
    const paymentService = new PaymentService({
      repository: paymentRepository, transactionManager, socket: noopSocket,
      flightSeatService: { checkAndEmitSeatWarning: async () => {} },
      seatSelectionService: seatService, ancillaryService, notificationPublisher: publisher,
      emailProvider: { sendBookingConfirmation: async () => {} },
    });
    return { fixture, makeFlight, airline, airports, user, bookingService, seatService, seatRepository, ancillaryService, flightService, paymentService, bookingRepository };
  }

  function requestFor(fixture, flight, fareClass, overrides = {}) {
    return {
      flight_id: flight.id,
      fare_class_id: fareClass.id,
      user_id: fixture.userId,
      currentUser: { id: fixture.userId, role: { name: 'customer' } },
      passengers: [{ passenger_name: 'CI Passenger' }],
      ...overrides,
    };
  }

  async function cleanupFixture(fixture) {
    const { flightIds, bookingIds, outboxIds, roleId, userId, airlineId, airportIds, serviceIds, templateIds } = fixture;
    const outboxWhere = [];
    if (bookingIds.length) outboxWhere.push({ aggregate_id: bookingIds });
    if (outboxIds.length) outboxWhere.push({ id: outboxIds });
    if (outboxWhere.length) {
      await db.Notification.destroy({ where: { [Op.or]: outboxIds.length ? [{ outbox_id: outboxIds }, { user_id: userId, outbox_id: null }] : [{ user_id: userId, outbox_id: null }] } });
      await db.NotificationOutbox.destroy({ where: { [Op.or]: outboxWhere } });
    }
    if (bookingIds.length) {
      await db.BookingAncillary.destroy({ where: { booking_id: bookingIds } });
      await db.BookingStatusHistory.destroy({ where: { booking_id: bookingIds } });
      await db.Payment.destroy({ where: { booking_id: bookingIds } });
      await db.Booking.destroy({ where: { id: bookingIds } });
    }
    if (flightIds.length) {
      await db.FlightSeat.destroy({ where: { flight_id: flightIds } });
      await db.FlightSeatMap.destroy({ where: { flight_id: flightIds } });
      await db.FlightStatusHistory.destroy({ where: { flight_id: flightIds } });
      await db.AncillaryOffer.destroy({ where: { flight_id: flightIds } });
      await db.FareClass.destroy({ where: { flight_id: flightIds } });
      await db.Flight.destroy({ where: { id: flightIds } });
    }
    if (templateIds.length) await db.SeatMapTemplate.destroy({ where: { id: templateIds } });
    if (serviceIds.length) await db.AncillaryService.destroy({ where: { id: serviceIds } });
    if (airportIds.length) await db.Airport.destroy({ where: { id: airportIds } });
    if (airlineId) await db.Airline.destroy({ where: { id: airlineId } });
    if (userId) await db.User.destroy({ where: { id: userId } });
    if (roleId) await db.Role.destroy({ where: { id: roleId } });
  }

  try {
    await t.test('real concurrent booking holds cannot oversell fare quota', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 4, quota: 1 });
      const results = await Promise.allSettled([
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass)),
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass)),
      ]);
      const successes = results.filter((result) => result.status === 'fulfilled');
      for (const result of successes) f.fixture.bookingIds.push(result.value.id);
      assert.equal(successes.length, 1, 'exactly one independent booking transaction may consume the last fare seat');
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(await db.BookingPassenger.count({ where: { booking_id: f.fixture.bookingIds } }), 1);
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 3);
      assert.equal(await f.bookingRepository.countReservedFareSeats(fareClass.id), 1);
    });

    await t.test('SQL search excludes a held-out fare quota and restores it after cancellation', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 3, quota: 1 });
      const search = () => f.flightService.searchFlights({ departure_airport_id: flight.departure_airport_id,
        arrival_airport_id: flight.arrival_airport_id, min_seats: 1, page: 1, limit: 5 });
      assert.equal((await search()).data.some((row) => Number(row.id) === Number(flight.id)), true);
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass));
      f.fixture.bookingIds.push(booking.id);
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2);
      assert.equal((await search()).data.some((row) => Number(row.id) === Number(flight.id)), false);
      await f.bookingService.cancelHoldingBooking(booking.id, { id: f.user.id, role: { name: 'customer' } });
      assert.equal((await search()).data.some((row) => Number(row.id) === Number(flight.id)), true);
    });

    await t.test('fractional VND is rejected before booking inventory or payment intent changes', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 3, quota: 3 });
      await fareClass.update({ price: '1250000.50' });
      await assert.rejects(f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass)),
        (error) => error.statusCode === 400 && /VND/.test(error.message));
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 3);
      await fareClass.update({ price: '1250000.00' });
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass));
      f.fixture.bookingIds.push(booking.id);
      await db.Booking.update({ total_amount: '1250000.49' }, { where: { id: booking.id } });
      await assert.rejects(f.paymentService.initiatePayment({ booking_id: booking.id, payment_method: 'payos',
        idempotency_key: `ci:${prefix}:fractional`, currentUser: { id: f.user.id, role: { name: 'customer' } } }),
      (error) => error.statusCode === 400 && /VND/.test(error.message));
      assert.equal(await db.Payment.count({ where: { booking_id: booking.id } }), 0);
      assert.equal((await db.Booking.findByPk(booking.id)).status, 'holding');
    });

    await t.test('seat conflict on a later itinerary segment rolls back earlier inventory and seat holds', async () => {
      const f = await createFixture();
      const first = await f.makeFlight({ from: 0, to: 1, hourOffset: 0, seats: 5, quota: 5 });
      const second = await f.makeFlight({ from: 1, to: 2, hourOffset: 5, seats: 5, quota: 5 });
      const layout = { row_count: 1, column_count: 1, aisle_after: [], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', blocked: false, special_properties: [] }] };
      for (const leg of [first, second]) {
        const template = await db.SeatMapTemplate.create({ name: `CI rollback ${prefix} ${leg.flight.id}`, aircraft_type: 'CI-only', version: 1, layout, is_current: true });
        f.fixture.templateIds.push(template.id);
        const map = await db.FlightSeatMap.create({ flight_id: leg.flight.id, template_id: template.id, template_version: 1, snapshot: layout });
        if (leg === first) await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: leg.flight.id, seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: [], fare_class_id: leg.fareClass.id, status: 'available' });
      }
      const beforeBookings = await db.Booking.count();
      await assert.rejects(f.bookingService.createHoldingBooking(requestFor(f.fixture, first.flight, first.fareClass, {
        trip_type: 'multi_city', itinerary_legs: [
          { flight_id: first.flight.id, fare_class_id: first.fareClass.id },
          { flight_id: second.flight.id, fare_class_id: second.fareClass.id },
        ],
        seat_selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }, { leg_order: 2, passenger_index: 0, seat_no: '1A' }],
      })), /Seat 1A is not available/i);
      assert.equal(Number((await db.Flight.findByPk(first.flight.id)).available_seats), 5);
      assert.equal((await db.FlightSeat.findOne({ where: { flight_id: first.flight.id, seat_no: '1A' } })).status, 'available');
      assert.equal(await db.Booking.count(), beforeBookings);
    });

    await t.test('real concurrent seat selection has one winner and cancel releases seat and inventory once', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 2, quota: 2 });
      const template = await db.SeatMapTemplate.create({ name: `CI map ${prefix}`, aircraft_type: 'CI-only', version: 1, layout: { row_count: 1, column_count: 1, aisle_after: [], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', blocked: false, special_properties: [] }] }, is_current: true });
      f.fixture.templateIds.push(template.id);
      const map = await db.FlightSeatMap.create({ flight_id: flight.id, template_id: template.id, template_version: 1, snapshot: template.layout });
      await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: flight.id, seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: [], fare_class_id: fareClass.id, status: 'available' });
      const selections = [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }];
      const results = await Promise.allSettled([
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { seat_selections: selections })),
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { seat_selections: selections })),
      ]);
      const winners = results.filter((result) => result.status === 'fulfilled');
      for (const result of winners) f.fixture.bookingIds.push(result.value.id);
      assert.equal(winners.length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(await db.FlightSeat.count({ where: { flight_id: flight.id, seat_no: '1A', status: 'held' } }), 1);
      await f.bookingService.cancelHoldingBooking(winners[0].value.id, { id: f.user.id, role: { name: 'customer' } });
      assert.equal((await db.FlightSeat.findOne({ where: { flight_id: flight.id, seat_no: '1A' } })).status, 'available');
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2);
      await assert.rejects(f.bookingService.cancelHoldingBooking(winners[0].value.id, { id: f.user.id, role: { name: 'customer' } }), /Only holding bookings can be cancelled/i);
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2);
    });

    await t.test('expired holding booking releases inventory and selected seat exactly once', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 2, quota: 2 });
      const layout = { row_count: 1, column_count: 1, aisle_after: [], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', blocked: false, special_properties: [] }] };
      const template = await db.SeatMapTemplate.create({ name: `CI expiry map ${prefix}`, aircraft_type: 'CI-only', version: 1, layout, is_current: true });
      f.fixture.templateIds.push(template.id);
      const map = await db.FlightSeatMap.create({ flight_id: flight.id, template_id: template.id, template_version: 1, snapshot: layout });
      await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: flight.id, seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: [], fare_class_id: fareClass.id, status: 'available' });
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { seat_selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }] }));
      f.fixture.bookingIds.push(booking.id);
      await db.Booking.update({ hold_expires_at: new Date(Date.now() - 60_000) }, { where: { id: booking.id } });
      const firstRun = await f.bookingService.expireHoldingBookings();
      const secondRun = await f.bookingService.expireHoldingBookings();
      assert.equal(firstRun.expiredCount, 1);
      assert.equal(secondRun.expiredCount, 0);
      assert.equal((await db.Booking.findByPk(booking.id)).status, 'expired');
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2);
      assert.equal((await db.FlightSeat.findOne({ where: { flight_id: flight.id, seat_no: '1A' } })).status, 'available');
    });

    await t.test('ancillary snapshot pricing and concurrent capacity reservation are persisted atomically', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 3, quota: 3 });
      const service = await db.AncillaryService.create({ service_type: 'baggage', name: `CI baggage ${prefix}`, is_active: true });
      f.fixture.serviceIds.push(service.id);
      const offer = await db.AncillaryOffer.create({ ancillary_service_id: service.id, offer_name: 'CI 10kg', flight_id: flight.id, fare_class_id: fareClass.id, unit_price: '12500.00', currency: 'VND', capacity: 1, reserved_quantity: 0, refund_policy: 'refundable', is_active: true });
      const ancillarySelections = [{ offer_id: offer.id, passenger_index: 0, leg_order: 1, quantity: 1 }];
      const results = await Promise.allSettled([
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { ancillary_selections: ancillarySelections })),
        f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { ancillary_selections: ancillarySelections })),
      ]);
      const winners = results.filter((result) => result.status === 'fulfilled');
      for (const result of winners) f.fixture.bookingIds.push(result.value.id);
      assert.equal(winners.length, 1, `one slot of ancillary capacity must not be oversold; outcomes: ${results.map((result) => result.status === 'rejected' ? String(result.reason?.stack || result.reason) : 'fulfilled').join(' | ')}`);
      const snapshot = await db.BookingAncillary.findOne({ where: { booking_id: winners[0].value.id } });
      assert.equal(snapshot.unit_price_snapshot, '12500.00');
      assert.equal(snapshot.line_total_snapshot, '12500.00');
      assert.equal(snapshot.status, 'held');
      assert.equal(Number((await db.Booking.findByPk(winners[0].value.id)).total_amount), 1262500);
      assert.equal(Number((await db.AncillaryOffer.findByPk(offer.id)).reserved_quantity), 1);
      await f.bookingService.cancelHoldingBooking(winners[0].value.id, { id: f.user.id, role: { name: 'customer' } });
      assert.equal(Number((await db.AncillaryOffer.findByPk(offer.id)).reserved_quantity), 0);
    });

    await t.test('concurrent payment requests and duplicate signed callbacks confirm booking and seat only once', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 2, quota: 2 });
      const template = await db.SeatMapTemplate.create({ name: `CI payment map ${prefix}`, aircraft_type: 'CI-only', version: 1, layout: { row_count: 1, column_count: 1, aisle_after: [], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', blocked: false, special_properties: [] }] }, is_current: true });
      f.fixture.templateIds.push(template.id);
      const map = await db.FlightSeatMap.create({ flight_id: flight.id, template_id: template.id, template_version: 1, snapshot: template.layout });
      await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: flight.id, seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: [], fare_class_id: fareClass.id, status: 'available' });
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { seat_selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }] }));
      f.fixture.bookingIds.push(booking.id);
      const paymentRequests = await Promise.all([
        f.paymentService.initiatePayment({ booking_id: booking.id, payment_method: 'payos', idempotency_key: `ci:${prefix}:payment`, currentUser: { id: f.user.id, role: { name: 'customer' } } }),
        f.paymentService.initiatePayment({ booking_id: booking.id, payment_method: 'payos', idempotency_key: `ci:${prefix}:payment`, currentUser: { id: f.user.id, role: { name: 'customer' } } }),
      ]);
      assert.equal(paymentRequests[0].transaction_ref, paymentRequests[1].transaction_ref);
      assert.equal(await db.Payment.count({ where: { booking_id: booking.id } }), 1, 'same idempotency key must create only one payment intent');
      const payment = await db.Payment.findOne({ where: { booking_id: booking.id } });
      const payload = paymentRequests[0].demo_webhook.body;
      const body = { ...payload, signature: signPayosDemoPayload(payload, f.paymentService._getPayOSDemoSecret()) };
      const callbacks = await Promise.all([
        f.paymentService.handlePayosDemoWebhook(body),
        f.paymentService.handlePayosDemoWebhook(body),
      ]);
      assert.equal(callbacks.length, 2);
      assert.equal((await db.Payment.findByPk(payment.id)).status, 'success');
      assert.equal((await db.Booking.findByPk(booking.id)).status, 'confirmed');
      assert.equal(await db.BookingStatusHistory.count({ where: { booking_id: booking.id, to_status: 'confirmed' } }), 1);
      assert.equal(await db.FlightSeat.count({ where: { flight_id: flight.id, booking_id: booking.id, status: 'booked' } }), 1);
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 1);
      assert.equal(await db.NotificationOutbox.count({ where: { aggregate_id: booking.id, event_type: 'PAYMENT_SUCCEEDED' } }), 1);
      const refunds = await Promise.allSettled([
        f.paymentService.processRefund(booking.id, 'CI duplicate refund race', { id: f.user.id, email: 'ci-admin@example.test' }),
        f.paymentService.processRefund(booking.id, 'CI duplicate refund race', { id: f.user.id, email: 'ci-admin@example.test' }),
      ]);
      assert.equal(refunds.filter((result) => result.status === 'fulfilled').length, 1, 'concurrent whole-booking refunds must have one winner');
      assert.equal((await db.Payment.findByPk(payment.id)).status, 'refunded');
      assert.equal((await db.Booking.findByPk(booking.id)).status, 'cancelled');
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2, 'refund must release flight inventory once');
      assert.equal((await db.FlightSeat.findOne({ where: { flight_id: flight.id, seat_no: '1A' } })).status, 'available');
    });

    await t.test('late successful callback cannot revive an expired booking or re-hold released inventory', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 2, quota: 2 });
      const layout = { row_count: 1, column_count: 1, aisle_after: [], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', blocked: false, special_properties: [] }] };
      const template = await db.SeatMapTemplate.create({ name: `CI late callback ${prefix}`, aircraft_type: 'CI-only', version: 1, layout, is_current: true });
      f.fixture.templateIds.push(template.id);
      const map = await db.FlightSeatMap.create({ flight_id: flight.id, template_id: template.id, template_version: 1, snapshot: layout });
      await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: flight.id, seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: [], fare_class_id: fareClass.id, status: 'available' });
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass, { seat_selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }] }));
      f.fixture.bookingIds.push(booking.id);
      const paymentResponse = await f.paymentService.initiatePayment({ booking_id: booking.id, payment_method: 'payos', idempotency_key: `ci:${prefix}:late-callback`, currentUser: { id: f.user.id, role: { name: 'customer' } } });
      await db.Booking.update({ hold_expires_at: new Date(Date.now() - 20 * 60 * 1000) }, { where: { id: booking.id } });
      assert.deepEqual(await f.bookingService.reconcileStalePendingPayments(), { reconciledCount: 1 });
      const lateCallback = await f.paymentService.handlePayosDemoWebhook(paymentResponse.demo_webhook.body);
      assert.match(lateCallback.message, /invalid state/i);
      assert.equal((await db.Booking.findByPk(booking.id)).status, 'expired');
      assert.equal((await db.Payment.findOne({ where: { booking_id: booking.id } })).status, 'failed');
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 2);
      assert.equal((await db.FlightSeat.findOne({ where: { flight_id: flight.id, seat_no: '1A' } })).status, 'available');
    });

    await t.test('booking owner checks, cancellation, flight status history, and SQL search are enforced', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 4, quota: 4 });
      const booking = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass));
      f.fixture.bookingIds.push(booking.id);
      await assert.rejects(f.bookingService.getBookingById(booking.id, { id: -1, role: { name: 'customer' } }), (error) => error.statusCode === 403);
      assert.equal((await f.bookingService.getBookingById(booking.id, { id: f.user.id, role: { name: 'customer' } })).id, booking.id);
      const statusResult = await f.flightService.updateFlightStatus(flight.id, { status: 'delayed', reason: 'CI test delay', actorUserId: f.user.id, departure_time: new Date(new Date(flight.departure_time).getTime() + 60 * 60 * 1000) });
      assert.equal(statusResult.status, 'delayed');
      assert.equal(await db.FlightStatusHistory.count({ where: { flight_id: flight.id, to_status: 'delayed', reason: 'CI test delay' } }), 1);
      await f.flightService.updateFlightStatus(flight.id, { status: 'cancelled', reason: 'CI test cancellation', actorUserId: f.user.id });
      await assert.rejects(f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass)), /not available for booking/i);
      const results = await f.flightService.searchFlights({ departure_airport_id: flight.departure_airport_id, arrival_airport_id: flight.arrival_airport_id, min_price: '1000000', sort_by: 'price_low', page: 1, limit: 5 });
      assert.equal(results.data.some((row) => Number(row.id) === Number(flight.id)), false, 'cancelled flights must not appear in bookable search results');
      assert.equal(Number((await db.Flight.findByPk(flight.id)).available_seats), 3);
    });

    await t.test('flight delay queues one registered inbox and one guest email without guest realtime disclosure', async () => {
      const f = await createFixture();
      const { flight, fareClass } = await f.makeFlight({ seats: 4, quota: 4 });
      const registered = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass));
      f.fixture.bookingIds.push(registered.id);
      const guestEmail = `${prefix}@example.test`;
      const guest = await f.bookingService.createHoldingBooking(requestFor(f.fixture, flight, fareClass,
        { user_id: null, currentUser: null, guest_email: guestEmail }));
      f.fixture.bookingIds.push(guest.id);
      const service = new FlightService({ repository: f.flightService.repository, getIO: noopSocket,
        flightStatusNotifier: createFlightStatusNotificationAdapter({ publisher }) });
      const change = { status: 'delayed', reason: 'CI weather delay', actorUserId: f.user.id };
      await service.updateFlightStatus(flight.id, change);
      await service.updateFlightStatus(flight.id, change);
      const events = await db.NotificationOutbox.findAll({ where: { aggregate_type: 'flight', aggregate_id: flight.id, event_type: 'FLIGHT_DELAYED' } });
      f.fixture.outboxIds.push(...events.map((event) => event.id));
      assert.equal(events.length, 2);
      const guestEvent = events.find((event) => Number(event.recipient_user_id || 0) === 0);
      assert.equal(guestEvent.recipient_email, guestEmail);
      assert.equal(guestEvent.email_status, 'pending');
      assert.equal(guestEvent.realtime_status, 'skipped');
      assert.equal(await db.Notification.count({ where: { outbox_id: guestEvent.id } }), 0);
      const registeredEvent = events.find((event) => Number(event.recipient_user_id) === Number(f.user.id));
      assert.equal(await db.Notification.count({ where: { outbox_id: registeredEvent.id, user_id: f.user.id } }), 1);
      assert.equal(await db.FlightStatusHistory.count({ where: { flight_id: flight.id, to_status: 'delayed' } }), 1);
    });

    await t.test('notification outbox rolls back with domain transaction, deduplicates and claims one event once', async () => {
      const f = await createFixture();
      const eventKey = `ci:${prefix}:rollback`;
      await assert.rejects(db.sequelize.transaction(async (transaction) => {
        await publisher.publish({ eventKey, eventType: 'BOOKING_CREATED', aggregateType: 'booking', aggregateId: 999999999, recipientUserId: f.user.id, variables: { code: 'ROLLBACK' } }, { transaction });
        throw new Error('intentional-business-rollback');
      }), /intentional-business-rollback/);
      assert.equal(await db.NotificationOutbox.count({ where: { event_key: eventKey } }), 0);
      await db.NotificationOutbox.update({ status: 'processed', lease_token: null, lease_expires_at: null }, {
        where: { status: { [Op.in]: ['pending', 'processing'] } },
      });
      const event = await publisher.publish({ eventKey: `ci:${prefix}:claim`, eventType: 'BOOKING_CREATED', aggregateType: 'booking', aggregateId: 999999998, recipientUserId: f.user.id, variables: { code: 'CLAIM' } });
      f.fixture.outboxIds.push(event.outbox.id);
      const [first, second] = await Promise.all([
        new SequelizeNotificationOutboxRepository({ NotificationOutbox: db.NotificationOutbox, sequelize: db.sequelize, Op }).claimNext(),
        new SequelizeNotificationOutboxRepository({ NotificationOutbox: db.NotificationOutbox, sequelize: db.sequelize, Op }).claimNext(),
      ]);
      assert.equal([first, second].filter(Boolean).length, 1, 'concurrent workers must claim a row at most once');
      const duplicate = await publisher.publish({ eventKey: `ci:${prefix}:claim`, eventType: 'BOOKING_CREATED', aggregateType: 'booking', aggregateId: 999999998, recipientUserId: f.user.id, variables: { code: 'CLAIM' } });
      assert.equal(Number(duplicate.outbox.id), Number(event.outbox.id));
      assert.equal(await db.Notification.count({ where: { outbox_id: event.outbox.id } }), 1);
    });
  } finally {
    for (const fixture of fixtures.reverse()) await cleanupFixture(fixture);
    await db.sequelize.close();
  }
});
