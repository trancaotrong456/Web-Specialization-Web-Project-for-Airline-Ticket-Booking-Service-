'use strict';

const { Op } = require('sequelize');

class SequelizeAncillariesRepository {
  constructor(models = {}) {
    const required = ['AncillaryService', 'AncillaryOffer', 'BookingAncillary', 'Booking', 'BookingPassenger', 'BookingSegment', 'Flight', 'FareClass', 'Payment'];
    if (!required.every((name) => models[name])) throw new TypeError('Ancillaries repository requires its catalog and booking association models');
    Object.assign(this, models);
  }

  listServices({ includeInactive = false } = {}) {
    return this.AncillaryService.findAll({ where: includeInactive ? {} : { is_active: true }, order: [['service_type', 'ASC'], ['name', 'ASC']] });
  }
  findService(id, transaction) { return this.AncillaryService.findByPk(id, { transaction }); }
  createService(values, transaction) { return this.AncillaryService.create(values, { transaction }); }
  updateService(instance, values, transaction) { return instance.update(values, { transaction }); }
  listOffers({ flightId, fareClassId, includeInactive = false, transaction } = {}) {
    const where = {};
    if (flightId !== undefined) where.flight_id = flightId;
    if (fareClassId !== undefined) where.fare_class_id = fareClassId;
    if (!includeInactive) where.is_active = true;
    return this.AncillaryOffer.findAll({ where, include: [{ model: this.AncillaryService, as: 'service', required: !includeInactive, ...(includeInactive ? {} : { where: { is_active: true } }) }], order: [['id', 'ASC']], transaction });
  }
  findOffer(id, transaction) {
    return this.AncillaryOffer.findByPk(id, { include: [{ model: this.AncillaryService, as: 'service' }], transaction });
  }
  findOfferForUpdate(id, transaction) {
    return this.AncillaryOffer.findByPk(id, {
      include: [{ model: this.AncillaryService, as: 'service' }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  }
  findOfferForUpdateByIds(ids, transaction) {
    return this.AncillaryOffer.findAll({ where: { id: { [Op.in]: ids } }, order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction });
  }
  async adjustReservedQuantity(id, delta, transaction) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new TypeError('Capacity adjustment must be a non-zero integer');
    const quantity = Math.abs(delta);
    const increment = delta > 0;
    const predicate = increment
      ? { is_active: true, reserved_quantity: { [Op.lte]: this.sequelize.literal(`capacity - ${quantity}`) } }
      : { reserved_quantity: { [Op.gte]: quantity } };
    const [updated] = await this.AncillaryOffer.update({
      reserved_quantity: this.sequelize.literal(`reserved_quantity ${increment ? '+' : '-'} ${quantity}`),
    }, { where: { id, ...predicate }, transaction });
    return updated === 1;
  }
  createOffer(values, transaction) { return this.AncillaryOffer.create(values, { transaction }); }
  updateOffer(instance, values, transaction) { return instance.update(values, { transaction }); }
  findFlight(id, transaction) { return this.Flight.findByPk(id, { transaction }); }
  findFareClassForFlight(id, flightId, transaction) { return this.FareClass.findOne({ where: { id, flight_id: flightId }, transaction }); }
  findBookingForAncillaryUpdate(id, transaction) {
    return this.Booking.findByPk(id, {
      include: [
        { model: this.BookingPassenger, as: 'passengers' },
        { model: this.BookingSegment, as: 'itinerarySegments' },
        { model: this.Payment, as: 'payments' },
        { model: this.BookingAncillary, as: 'ancillaries' },
      ], lock: transaction.LOCK.UPDATE, transaction,
    });
  }
  hasAnyPaymentIntent(bookingId, transaction) { return this.Payment.count({ where: { booking_id: bookingId }, transaction }).then((count) => count > 0); }
  hasProcessingPayment(bookingId, transaction) { return this.Payment.count({ where: { booking_id: bookingId, status: 'pending' }, transaction }).then((count) => count > 0); }
  findBookingAncillariesForUpdate(bookingId, transaction) {
    return this.BookingAncillary.findAll({ where: { booking_id: bookingId }, order: [['offer_id', 'ASC'], ['id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction });
  }
  createBookingAncillaries(values, transaction) { return this.BookingAncillary.bulkCreate(values, { transaction }); }
  async transitionBookingAncillary(id, expectedStatus, nextStatus, transaction) {
    const [updated] = await this.BookingAncillary.update({ status: nextStatus }, { where: { id, status: expectedStatus }, transaction });
    return updated === 1;
  }
  deleteBookingAncillaries(bookingId, transaction) { return this.BookingAncillary.destroy({ where: { booking_id: bookingId }, transaction }); }
  save(instance, transaction) { return instance.save({ transaction }); }
}

module.exports = { SequelizeAncillariesRepository };
