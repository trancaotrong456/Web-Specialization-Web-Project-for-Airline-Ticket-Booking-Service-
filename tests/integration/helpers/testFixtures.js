'use strict';

const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { models } = require('./mysqlTestDatabase');

const created = {
  airlineIds: new Set(),
  airportIds: new Set(),
  flightIds: new Set(),
  fareClassIds: new Set(),
  promotionIds: new Set(),
  bookingIds: new Set(),
  paymentIds: new Set(),
  userIds: new Set(),
};

function randomLetters(length) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => String.fromCharCode(65 + (byte % 26))).join('');
}

async function createFlightFixture({ availableSeats = 1, totalSeats = availableSeats } = {}) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const airline = await models.Airline.create({
    name: `IT Airline ${suffix}`,
    iata_code: randomLetters(3),
  });
  created.airlineIds.add(airline.id);

  let departure;
  let arrival;
  while (!departure) {
    try {
      departure = await models.Airport.create({
        iata_code: randomLetters(3),
        name: `IT Departure ${suffix}`,
        city: 'Integration City A',
        country: 'Vietnam',
      });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }
  created.airportIds.add(departure.id);

  while (!arrival) {
    try {
      arrival = await models.Airport.create({
        iata_code: randomLetters(3),
        name: `IT Arrival ${suffix}`,
        city: 'Integration City B',
        country: 'Vietnam',
      });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }
  created.airportIds.add(arrival.id);

  const departureTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const flight = await models.Flight.create({
    airline_id: airline.id,
    departure_airport_id: departure.id,
    arrival_airport_id: arrival.id,
    departure_time: departureTime,
    arrival_time: new Date(departureTime.getTime() + 2 * 60 * 60 * 1000),
    total_seats: totalSeats,
    available_seats: availableSeats,
    status: 'scheduled',
  });
  created.flightIds.add(flight.id);

  const fareClass = await models.FareClass.create({
    flight_id: flight.id,
    class_name: `IT Economy ${suffix}`,
    price: 1000000,
    seat_quota: totalSeats,
  });
  created.fareClassIds.add(fareClass.id);

  return { airline, departure, arrival, flight, fareClass, suffix };
}

async function createPromotionFixture({ maxUses = 1 } = {}) {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const promotion = await models.Promotion.create({
    code: `IT${suffix}`,
    discount_type: 'percent',
    discount_value: 10,
    valid_from: new Date(Date.now() - 60 * 60 * 1000),
    valid_to: new Date(Date.now() + 24 * 60 * 60 * 1000),
    max_uses: maxUses,
    used_count: 0,
  });
  return trackPromotion(promotion);
}

function trackBooking(booking) {
  created.bookingIds.add(booking.id);
  return booking;
}

function trackPromotion(promotion) {
  created.promotionIds.add(promotion.id);
  return promotion;
}

function trackPayment(payment) {
  created.paymentIds.add(payment.id);
  return payment;
}

async function cleanupTrackedFixtures() {
  const ids = (set) => [...set];
  const flightIds = ids(created.flightIds);
  const fareClassIds = ids(created.fareClassIds);
  const bookingWhere = [];
  if (flightIds.length > 0) bookingWhere.push({ flight_id: flightIds });
  if (fareClassIds.length > 0) bookingWhere.push({ fare_class_id: fareClassIds });
  const discoveredBookings = bookingWhere.length > 0
    ? await models.Booking.findAll({
      where: { [Op.or]: bookingWhere },
      attributes: ['id'],
      raw: true,
    })
    : [];
  const bookingIds = [...new Set([
    ...ids(created.bookingIds),
    ...discoveredBookings.map(({ id }) => id),
  ])];
  if (bookingIds.length > 0) {
    if (models.PaymentGatewayOperation) {
      const paymentIds = await models.Payment.findAll({ where: { booking_id: bookingIds }, attributes: ['id'], raw: true });
      const operationPaymentIds = paymentIds.map(({ id }) => id);
      if (operationPaymentIds.length > 0) {
        await models.PaymentGatewayOperation.destroy({ where: { payment_id: operationPaymentIds }, force: true });
        if (models.PaymentReconciliationCase) {
          if (models.ReconciliationReviewAction) {
            const caseIds = await models.PaymentReconciliationCase.findAll({ where: { payment_id: operationPaymentIds }, attributes: ['id'], raw: true });
            if (caseIds.length > 0) await models.ReconciliationReviewAction.destroy({ where: { case_id: caseIds.map(({ id }) => id) }, force: true });
          }
          await models.PaymentReconciliationCase.destroy({ where: { payment_id: operationPaymentIds }, force: true });
        }
      }
    }
    await models.Payment.destroy({ where: { booking_id: bookingIds }, force: true });
    await models.BookingPassenger.destroy({ where: { booking_id: bookingIds }, force: true });
    if (models.BookingSegment) {
      await models.BookingSegment.destroy({ where: { booking_id: bookingIds }, force: true });
    }
    await models.Booking.destroy({ where: { id: bookingIds }, force: true });
  }
  if (models.BookingSegment && (flightIds.length > 0 || fareClassIds.length > 0)) {
    const segmentWhere = [];
    if (flightIds.length > 0) segmentWhere.push({ flight_id: flightIds });
    if (fareClassIds.length > 0) segmentWhere.push({ fare_class_id: fareClassIds });
    await models.BookingSegment.destroy({ where: { [Op.or]: segmentWhere }, force: true });
  }
  if (fareClassIds.length > 0) await models.FareClass.destroy({ where: { id: fareClassIds }, force: true });
  if (flightIds.length > 0) await models.Flight.destroy({ where: { id: flightIds }, force: true });
  const promotionIds = ids(created.promotionIds);
  if (promotionIds.length > 0) await models.Promotion.destroy({ where: { id: promotionIds }, force: true });
  const airlineIds = ids(created.airlineIds);
  if (airlineIds.length > 0) await models.Airline.destroy({ where: { id: airlineIds }, force: true });
  const airportIds = ids(created.airportIds);
  if (airportIds.length > 0) await models.Airport.destroy({ where: { id: airportIds }, force: true });
  const userIds = ids(created.userIds);
  if (userIds.length > 0) await models.User.destroy({ where: { id: userIds }, force: true });

  Object.values(created).forEach((set) => set.clear());
}

async function createOperatorFixture() {
  const [role] = await models.Role.findOrCreate({ where: { name: 'admin' }, defaults: { description: 'Integration admin' } });
  const user = await models.User.create({ role_id: role.id, full_name: `IT Operator ${Date.now()}`, email: `it-operator-${Date.now()}@example.test`, password_hash: 'integration-only-hash', status: 'active' });
  created.userIds.add(user.id);
  return user;
}

module.exports = {
  cleanupTrackedFixtures,
  createFlightFixture,
  createPromotionFixture,
  trackBooking,
  trackPayment,
  trackPromotion,
  createOperatorFixture,
};
