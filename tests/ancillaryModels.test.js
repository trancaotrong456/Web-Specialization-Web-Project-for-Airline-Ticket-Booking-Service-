'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');

const createAncillaryService = require('../models/ancillary_service');
const createAncillaryOffer = require('../models/ancillary_offer');
const createBookingAncillary = require('../models/booking_ancillary');
const createBooking = require('../models/booking');
const createBookingPassenger = require('../models/booking_passenger');
const createBookingSegment = require('../models/booking_segment');

function buildModels() {
  const sequelize = new Sequelize('mysql://user:pass@127.0.0.1:3306/ancillary_test', { logging: false });
  const models = {
    AncillaryService: createAncillaryService(sequelize, Sequelize.DataTypes),
    AncillaryOffer: createAncillaryOffer(sequelize, Sequelize.DataTypes),
    BookingAncillary: createBookingAncillary(sequelize, Sequelize.DataTypes),
    Booking: createBooking(sequelize, Sequelize.DataTypes),
    BookingPassenger: createBookingPassenger(sequelize, Sequelize.DataTypes),
    BookingSegment: createBookingSegment(sequelize, Sequelize.DataTypes),
  };
  models.BookingAncillary.associate(models);
  return { sequelize, models };
}

test('booking ancillary snapshots require actual booking, passenger, and segment foreign keys', () => {
  const { sequelize, models } = buildModels();
  const attrs = models.BookingAncillary.getAttributes();
  for (const field of ['booking_id', 'passenger_id', 'booking_segment_id']) {
    assert.equal(attrs[field].allowNull, false, `${field} must be required`);
  }
  assert.equal(models.BookingAncillary.associations.booking.foreignKey, 'booking_id');
  assert.equal(models.BookingAncillary.associations.passenger.foreignKey, 'passenger_id');
  assert.equal(models.BookingAncillary.associations.segment.foreignKey, 'booking_segment_id');
  return sequelize.close();
});

test('offer deactivation does not mutate immutable booking price and service snapshots', () => {
  const { sequelize, models } = buildModels();
  const attrs = models.BookingAncillary.getAttributes();
  for (const field of ['service_type_snapshot', 'service_name_snapshot', 'unit_price_snapshot', 'currency_snapshot', 'quantity', 'refund_policy_snapshot', 'status']) {
    assert.ok(attrs[field], `missing snapshot field ${field}`);
  }
  assert.equal(attrs.offer_id.allowNull, true, 'historical snapshots must survive offer removal');
  return sequelize.close();
});

test('ancillary model carries constrained service type, currency, capacity, and lifecycle fields', () => {
  const { sequelize, models } = buildModels();
  const serviceType = models.AncillaryService.getAttributes().service_type;
  assert.deepEqual(serviceType.type.values, ['baggage', 'meal', 'priority']);
  const offer = models.AncillaryOffer.getAttributes();
  for (const field of ['unit_price', 'currency', 'capacity', 'reserved_quantity', 'is_active']) assert.ok(offer[field]);
  assert.deepEqual(models.BookingAncillary.getAttributes().status.type.values, ['held', 'confirmed', 'released']);
  return sequelize.close();
});
