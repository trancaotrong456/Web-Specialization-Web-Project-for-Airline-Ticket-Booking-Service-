'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');

function assertIsolatedCiDatabase() {
  if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'airline_booking_ci_test') {
    throw new Error('Browser fixture setup is allowed only on airline_booking_ci_test with NODE_ENV=test.');
  }
}

async function main() {
  assertIsolatedCiDatabase();
  const db = require('../../models');
  await db.sequelize.authenticate();
  const [rows] = await db.sequelize.query('SELECT DATABASE() AS database_name, @@global.read_only AS read_only');
  if (rows[0]?.database_name !== 'airline_booking_ci_test' || Number(rows[0]?.read_only) !== 0) {
    throw new Error('Refusing browser fixtures: connected MySQL identity is not the writable CI test database.');
  }

  const fixture = { roleIds: [], userIds: [], airlineIds: [], airportIds: [], flightIds: [], fareClassIds: [], templateIds: [], offerIds: [], serviceIds: [] };
  const output = path.resolve('artifacts/e2e/fixture.json');
  try {
    const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
    const [adminRole, customerRole] = await Promise.all([
      db.Role.findOrCreate({ where: { name: 'admin' }, defaults: { name: 'admin', description: 'CI browser administrator' } }),
      db.Role.findOrCreate({ where: { name: 'customer' }, defaults: { name: 'customer', description: 'CI browser customer' } }),
    ]);
    for (const [role, created] of [adminRole, customerRole]) if (created) fixture.roleIds.push(role.id);
    const passwordHash = await bcrypt.hash('CiOnly!Pass123', 4);
    const admin = await db.User.create({ role_id: adminRole[0].id, full_name: 'CI Admin', email: 'ci-admin@example.test', password_hash: passwordHash, status: 'active' });
    fixture.userIds.push(admin.id);
    const customer = await db.User.create({ role_id: customerRole[0].id, full_name: 'CI Customer', email: 'ci-customer@example.test', password_hash: passwordHash, status: 'active' });
    fixture.userIds.push(customer.id);

    const airline = await db.Airline.create({ name: `CI Airways ${suffix}`, iata_code: `C${suffix}`, logo_url: null });
    fixture.airlineIds.push(airline.id);
    const airports = [];
    for (const label of ['A', 'B', 'C', 'D']) {
      const airport = await db.Airport.create({
        iata_code: `${label}${suffix}`, name: `CI Airport ${label} ${suffix}`, city: `CI City ${label}`, country: 'CI',
      });
      airports.push(airport);
      fixture.airportIds.push(airport.id);
    }

    const midnight = new Date(); midnight.setUTCHours(12, 0, 0, 0); midnight.setUTCDate(midnight.getUTCDate() + 3);
    const createFlight = async ({ from, to, dayOffset, hourOffset = 0, status = 'scheduled', configureAncillaries = false }) => {
      const departure = new Date(midnight.getTime() + (dayOffset * 24 + hourOffset) * 60 * 60 * 1000);
      const arrival = new Date(departure.getTime() + 2 * 60 * 60 * 1000);
      const flight = await db.Flight.create({ airline_id: airline.id, departure_airport_id: airports[from].id, arrival_airport_id: airports[to].id, departure_time: departure, arrival_time: arrival, total_seats: 20, available_seats: 20, status });
      fixture.flightIds.push(flight.id);
      const fare = await db.FareClass.create({ flight_id: flight.id, class_name: 'Economy', price: '1250000.00', seat_quota: 20 });
      fixture.fareClassIds.push(fare.id);
      if (configureAncillaries) {
        const layout = { row_count: 2, column_count: 1, aisle_after: [], seats: [1, 2].map((row) => ({ seat_no: `${row}A`, row_number: row, column_number: 1, zone: 'economy', blocked: false, special_properties: [] })) };
        const template = await db.SeatMapTemplate.create({ name: `CI Seat Map ${suffix}`, aircraft_type: 'CI-only', version: 1, layout, is_current: true });
        fixture.templateIds.push(template.id);
        const snapshot = { ...layout, seats: layout.seats.map((seat) => ({ ...seat, fare_class_id: fare.id })) };
        const map = await db.FlightSeatMap.create({ flight_id: flight.id, template_id: template.id, template_version: 1, snapshot });
        for (const seat of snapshot.seats) await db.FlightSeat.create({ flight_seat_map_id: map.id, flight_id: flight.id, ...seat, status: 'available' });
        const service = await db.AncillaryService.create({ service_type: 'baggage', name: `CI Baggage ${suffix}`, is_active: true });
        fixture.serviceIds.push(service.id);
        const offer = await db.AncillaryOffer.create({ ancillary_service_id: service.id, offer_name: 'CI 10 kg baggage', flight_id: flight.id, fare_class_id: fare.id, unit_price: '12500.00', currency: 'VND', capacity: 20, reserved_quantity: 0, max_quantity_per_passenger: 2, refund_policy: 'non_refundable', is_active: true });
        fixture.offerIds.push(offer.id);
      }
      return { id: flight.id, fareClassId: fare.id, departureDate: departure.toISOString().slice(0, 10), departureAirportId: airports[from].id, arrivalAirportId: airports[to].id };
    };

    const oneWay = await createFlight({ from: 0, to: 1, dayOffset: 0, configureAncillaries: true });
    const outbound = await createFlight({ from: 0, to: 1, dayOffset: 1 });
    const inbound = await createFlight({ from: 1, to: 0, dayOffset: 2 });
    const multi1 = await createFlight({ from: 0, to: 1, dayOffset: 3 });
    const multi2 = await createFlight({ from: 1, to: 2, dayOffset: 3, hourOffset: 5 });
    const multi3 = await createFlight({ from: 2, to: 3, dayOffset: 3, hourOffset: 10 });
    const cancelled = await createFlight({ from: 0, to: 2, dayOffset: 4, status: 'cancelled' });
    const adminFlight = await createFlight({ from: 2, to: 3, dayOffset: 5 });

    const publicFixture = {
      ids: fixture,
      adminFlightId: adminFlight.id,
      oneWay,
      roundTrip: [outbound, inbound],
      multiCity: [multi1, multi2, multi3],
      cancelled,
      adminEmail: 'ci-admin@example.test',
      customerEmail: 'ci-customer@example.test',
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(publicFixture, null, 2), { flag: 'wx' });
    console.log('Created isolated browser fixtures in airline_booking_ci_test. Fixture IDs are recorded for exact cleanup.');
  } catch (error) {
    await cleanup(db, fixture).catch(() => {});
    throw error;
  } finally {
    await db.sequelize.close();
  }
}

async function cleanup(db, fixture) {
  const { userIds = [], flightIds = [], fareClassIds = [], airportIds = [], airlineIds = [], templateIds = [], offerIds = [], serviceIds = [], roleIds = [] } = fixture;
  if (userIds.length) {
    const bookingIds = (await db.Booking.findAll({ where: { user_id: userIds }, attributes: ['id'] })).map(({ id }) => id);
    const outboxIds = (await db.NotificationOutbox.findAll({ where: { recipient_user_id: userIds }, attributes: ['id'] })).map(({ id }) => id);
    if (outboxIds.length) await db.Notification.destroy({ where: { outbox_id: outboxIds } });
    if (bookingIds.length) {
      await db.FlightSeat.update({ booking_id: null, booking_passenger_id: null, leg_order: null, hold_expires_at: null, status: 'available' }, { where: { booking_id: bookingIds } });
      await db.BookingAncillary.destroy({ where: { booking_id: bookingIds } });
      await db.BookingStatusHistory.destroy({ where: { booking_id: bookingIds } });
      await db.Payment.destroy({ where: { booking_id: bookingIds } });
      if (db.Ticket) await db.Ticket.destroy({ where: { booking_id: bookingIds } });
      await db.BookingSegment.destroy({ where: { booking_id: bookingIds } });
      await db.BookingPassenger.destroy({ where: { booking_id: bookingIds } });
      await db.Booking.destroy({ where: { id: bookingIds } });
    }
    if (outboxIds.length) await db.NotificationOutbox.destroy({ where: { id: outboxIds } });
    await db.Notification.destroy({ where: { user_id: userIds } });
    await db.User.destroy({ where: { id: userIds } });
  }
  if (flightIds.length) {
    await db.FlightSeat.destroy({ where: { flight_id: flightIds } });
    await db.FlightSeatMap.destroy({ where: { flight_id: flightIds } });
    await db.FlightStatusHistory.destroy({ where: { flight_id: flightIds } });
    await db.AncillaryOffer.destroy({ where: { id: offerIds.length ? offerIds : [-1] } });
    await db.FareClass.destroy({ where: { id: fareClassIds } });
    await db.Flight.destroy({ where: { id: flightIds } });
  }
  if (templateIds.length) await db.SeatMapTemplate.destroy({ where: { id: templateIds } });
  if (serviceIds.length) await db.AncillaryService.destroy({ where: { id: serviceIds } });
  if (airportIds.length) await db.Airport.destroy({ where: { id: airportIds } });
  if (airlineIds.length) await db.Airline.destroy({ where: { id: airlineIds } });
  if (roleIds.length) await db.Role.destroy({ where: { id: roleIds } });
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { assertIsolatedCiDatabase, cleanup };
