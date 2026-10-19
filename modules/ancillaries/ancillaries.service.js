'use strict';

const { toMinorUnits, fromMinorUnits, wholeVndAmount } = require('./money.util');

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

class AncillariesService {
  constructor({ repository, transactionManager } = {}) {
    if (!repository) throw new TypeError('Ancillaries repository is required');
    this.repository = repository;
    this.transactionManager = transactionManager;
  }

  async listOffers(filters = {}) {
    const { flight_id: flightId, fare_class_id: fareClassId } = filters;
    if (!Number.isSafeInteger(Number(flightId)) || Number(flightId) < 1
      || !Number.isSafeInteger(Number(fareClassId)) || Number(fareClassId) < 1) {
      throw httpError('flight_id and fare_class_id are required');
    }
    return this.repository.listOffers({ flightId: Number(flightId), fareClassId: Number(fareClassId) });
  }

  async listServices({ includeInactive = true } = {}) { return this.repository.listServices({ includeInactive }); }

  async saveService(id, input = {}) {
    const serviceType = input.service_type;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!['baggage', 'meal', 'priority'].includes(serviceType) || !name || name.length > 120) throw httpError('A valid service_type and name are required');
    const values = { service_type: serviceType, name, description: input.description == null ? null : String(input.description).trim(), is_active: input.is_active !== false };
    if (id == null) return this.repository.createService(values);
    const existing = await this.repository.findService(Number(id));
    if (!existing) throw httpError('Ancillary service not found', 404);
    return this.repository.updateService(existing, values);
  }

  async deactivateService(id) {
    const service = await this.repository.findService(Number(id));
    if (!service) throw httpError('Ancillary service not found', 404);
    return this.repository.updateService(service, { is_active: false });
  }

  async saveOffer(id, input = {}) {
    if (!this.transactionManager) throw new TypeError('A transaction manager is required to manage offers');
    return this.transactionManager.transaction(async (transaction) => {
    const serviceId = Number(input.ancillary_service_id);
    const flightId = Number(input.flight_id);
    const fareClassId = Number(input.fare_class_id);
    const capacity = Number(input.capacity);
    const maxQuantity = input.max_quantity_per_passenger == null || input.max_quantity_per_passenger === '' ? null : Number(input.max_quantity_per_passenger);
    const name = typeof input.offer_name === 'string' ? input.offer_name.trim() : '';
    const price = fromMinorUnits(wholeVndAmount(input.unit_price) * 100);
    if (![serviceId, flightId, fareClassId].every((value) => Number.isSafeInteger(value) && value > 0)
      || !Number.isSafeInteger(capacity) || capacity < 0
      || (maxQuantity !== null && (!Number.isSafeInteger(maxQuantity) || maxQuantity < 1))
      || !name || name.length > 120 || input.currency !== 'VND'
      || !['refundable', 'non_refundable'].includes(input.refund_policy)) throw httpError('Offer must have explicit service, flight, fare class, price, VND currency, capacity, and refund policy');
    const service = await this.repository.findService(serviceId, transaction);
    const flight = await this.repository.findFlight(flightId, transaction);
    const fareClass = await this.repository.findFareClassForFlight(fareClassId, flightId, transaction);
    if (!service || !flight || !fareClass) throw httpError('Offer service, flight, or fare class was not found or is not applicable', 404);
    const values = { ancillary_service_id: serviceId, flight_id: flightId, fare_class_id: fareClassId, offer_name: name, unit_price: price, currency: 'VND', capacity, max_quantity_per_passenger: maxQuantity, conditions: input.conditions ?? null, refund_policy: input.refund_policy, is_active: input.is_active !== false };
    if (id == null) return this.repository.createOffer({ ...values, reserved_quantity: 0 }, transaction);
    const existing = await this.repository.findOfferForUpdate(Number(id), transaction);
    if (!existing) throw httpError('Ancillary offer not found', 404);
    if (capacity < Number(existing.reserved_quantity || 0)) throw httpError('Capacity cannot be lower than already reserved quantity', 409);
    return this.repository.updateOffer(existing, values, transaction);
    });
  }

  async deactivateOffer(id) {
    if (!this.transactionManager) throw new TypeError('A transaction manager is required to manage offers');
    return this.transactionManager.transaction(async (transaction) => {
      const offer = await this.repository.findOfferForUpdate(Number(id), transaction);
      if (!offer) throw httpError('Ancillary offer not found', 404);
      return this.repository.updateOffer(offer, { is_active: false }, transaction);
    });
  }

  async reserveForBooking({ booking, passengers, segments, selections = [], transaction }) {
    if (!Array.isArray(selections) || selections.length === 0) return { snapshots: [], subtotal: '0.00' };
    if (!booking?.id || !Array.isArray(passengers) || !Array.isArray(segments) || !transaction) throw new TypeError('Booking, passengers, segments, and transaction are required');

    const normalized = selections.map((selection) => {
      const quantity = Number(selection.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw httpError('Ancillary quantity must be a positive integer');
      const passengerIndex = Number(selection.passenger_index);
      const legOrder = Number(selection.leg_order);
      const passenger = Number.isSafeInteger(passengerIndex) ? passengers[passengerIndex] : null;
      const segment = segments.find((item) => Number(item.leg_order) === legOrder);
      if (!passenger?.id) throw httpError('Ancillary passenger does not exist in this booking');
      if (!segment?.id) throw httpError('Ancillary itinerary segment does not exist in this booking');
      const offerId = Number(selection.offer_id);
      if (!Number.isSafeInteger(offerId) || offerId < 1) throw httpError('Ancillary offer ID is invalid');
      return { offerId, quantity, passenger, passengerIndex, segment, legOrder };
    });

    const duplicateKey = (item) => `${item.offerId}:${item.passenger.id}:${item.segment.id}`;
    if (new Set(normalized.map(duplicateKey)).size !== normalized.length) throw httpError('Duplicate ancillary selection for the same passenger and segment');
    const offerIds = [...new Set(normalized.map((item) => item.offerId))].sort((a, b) => a - b);
    const offers = new Map();
    for (const id of offerIds) {
      const offer = await this.repository.findOfferForUpdate(id, transaction);
      if (!offer) throw httpError('Ancillary offer not found', 404);
      if (!offer.is_active || !offer.service?.is_active) throw httpError('Ancillary offer is no longer available');
      if (String(offer.currency).toUpperCase() !== 'VND') throw httpError('Ancillary offer currency is not supported');
      const unitMinor = wholeVndAmount(offer.unit_price) * 100;
      if (!Number.isSafeInteger(Number(offer.capacity)) || Number(offer.capacity) < 0
        || !Number.isSafeInteger(Number(offer.reserved_quantity)) || Number(offer.reserved_quantity) < 0) {
        throw httpError('Ancillary offer capacity is invalid');
      }
      // Sequelize model getters live on the prototype; spread a plain snapshot
      // so eligibility fields remain available after leaving the query loop.
      const offerValues = typeof offer.get === 'function' ? offer.get({ plain: true }) : offer;
      offers.set(id, { ...offerValues, unitMinor });
    }

    const demand = new Map();
    for (const item of normalized) {
      const offer = offers.get(item.offerId);
      if (Number(offer.flight_id) !== Number(item.segment.flight_id)
        || Number(offer.fare_class_id) !== Number(item.segment.fare_class_id)) {
        throw httpError('Ancillary offer is not eligible for the selected flight and fare class');
      }
      const maxPerPassenger = offer.max_quantity_per_passenger;
      if (maxPerPassenger !== null && maxPerPassenger !== undefined && item.quantity > Number(maxPerPassenger)) {
        throw httpError('Ancillary quantity exceeds the configured per-passenger limit');
      }
      demand.set(item.offerId, (demand.get(item.offerId) || 0) + item.quantity);
    }
    for (const id of offerIds) {
      const offer = offers.get(id);
      const requested = demand.get(id);
      if (Number(offer.reserved_quantity) + requested > Number(offer.capacity)) throw httpError('Ancillary offer capacity is exhausted', 409);
      const updated = await this.repository.adjustReservedQuantity(id, requested, transaction);
      if (updated === false) throw httpError('Ancillary offer capacity is exhausted', 409);
    }

    const snapshots = normalized.map((item) => {
      const offer = offers.get(item.offerId);
      const lineMinor = offer.unitMinor * item.quantity;
      if (!Number.isSafeInteger(lineMinor)) throw new RangeError('Ancillary line total exceeds safe integer range');
      return {
        booking_id: booking.id,
        passenger_id: item.passenger.id,
        booking_segment_id: item.segment.id,
        offer_id: item.offerId,
        service_type_snapshot: offer.service.service_type,
        service_name_snapshot: offer.service.name,
        offer_name_snapshot: offer.offer_name,
        unit_price_snapshot: fromMinorUnits(offer.unitMinor),
        line_total_snapshot: fromMinorUnits(lineMinor),
        currency_snapshot: 'VND',
        quantity: item.quantity,
        refund_policy_snapshot: offer.refund_policy,
        status: 'held',
      };
    });
    const persisted = await this.repository.createBookingAncillaries(snapshots, transaction);
    const subtotalMinor = snapshots.reduce((sum, row) => sum + toMinorUnits(row.line_total_snapshot), 0);
    if (!Number.isSafeInteger(subtotalMinor)) throw new RangeError('Ancillary subtotal exceeds safe integer range');
    return { snapshots: persisted || snapshots, subtotal: fromMinorUnits(subtotalMinor) };
  }

  async confirmBooking(bookingId, transaction) {
    if (!transaction) throw new TypeError('A transaction is required to confirm ancillary capacity');
    const rows = await this.repository.findBookingAncillariesForUpdate(bookingId, transaction);
    let changed = 0;
    for (const row of rows) {
      if (row.status !== 'held') continue;
      if (await this.repository.transitionBookingAncillary(row.id, 'held', 'confirmed', transaction)) changed += 1;
    }
    return changed;
  }

  async releaseBooking(bookingId, { transaction, reason } = {}) {
    if (!transaction) throw new TypeError('A transaction is required to release ancillary capacity');
    if (!['cancelled', 'expired', 'refunded', 'payment_failed'].includes(reason)) throw new TypeError('A valid ancillary release reason is required');
    if (await this.repository.hasProcessingPayment(bookingId, transaction)) throw httpError('Ancillary capacity cannot be released while a payment is processing', 409);
    const rows = await this.repository.findBookingAncillariesForUpdate(bookingId, transaction);
    let released = 0;
    for (const row of rows) {
      if (!['held', 'confirmed'].includes(row.status)) continue;
      if (!row.offer_id) throw new Error('Cannot release ancillary capacity without its offer reference');
      const transitioned = await this.repository.transitionBookingAncillary(row.id, row.status, 'released', transaction);
      if (!transitioned) continue;
      const adjusted = await this.repository.adjustReservedQuantity(Number(row.offer_id), -Number(row.quantity), transaction);
      if (!adjusted) throw new Error('Ancillary capacity invariant violated during release');
      released += 1;
    }
    return released > 0;
  }

  async assertWholeBookingRefundAllowed(bookingId, transaction) {
    const rows = await this.repository.findBookingAncillariesForUpdate(bookingId, transaction);
    if (rows.some((row) => row.status === 'confirmed' && row.refund_policy_snapshot === 'non_refundable')) {
      throw httpError('Booking contains non-refundable ancillary services; whole-booking refund is not supported for this booking.', 409);
    }
  }

  async replaceForBooking({ bookingId, selections, currentUser, guestEmail }) {
    if (!this.transactionManager) throw new TypeError('A transaction manager is required to replace ancillary selections');
    const { verifyBookingAccess } = require('../../utils/bookingAccess.util');
    return this.transactionManager.transaction(async (transaction) => {
      const booking = await this.repository.findBookingForAncillaryUpdate(bookingId, transaction);
      if (!booking) throw httpError('Booking not found', 404);
      verifyBookingAccess(booking, currentUser, guestEmail);
      if (booking.status !== 'holding') throw httpError('Ancillary selections can only be changed while the booking is holding', 409);
      if (await this.repository.hasAnyPaymentIntent(bookingId, transaction)) throw httpError('Ancillary selections cannot be changed after a payment intent has been created', 409);
      const oldRows = await this.repository.findBookingAncillariesForUpdate(bookingId, transaction);
      if (oldRows.some((row) => row.status !== 'held')) throw httpError('Only held ancillary selections can be replaced', 409);
      const offerIds = [...new Set([
        ...oldRows.map((row) => Number(row.offer_id)),
        ...(Array.isArray(selections) ? selections.map((row) => Number(row.offer_id)) : []),
      ].filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
      if (offerIds.length) await this.repository.findOfferForUpdateByIds(offerIds, transaction);
      const oldSubtotal = oldRows.reduce((sum, row) => sum + toMinorUnits(row.line_total_snapshot), 0);
      for (const row of oldRows) {
        if (row.offer_id && !await this.repository.adjustReservedQuantity(Number(row.offer_id), -Number(row.quantity), transaction)) throw new Error('Ancillary capacity invariant violated during replacement');
      }
      await this.repository.deleteBookingAncillaries(bookingId, transaction);
      const newResult = await this.reserveForBooking({ booking, passengers: booking.passengers || [], segments: booking.itinerarySegments || [], selections: selections || [], transaction });
      const nextAmountMinor = toMinorUnits(booking.total_amount) - oldSubtotal + toMinorUnits(newResult.subtotal);
      if (nextAmountMinor < 0) throw new Error('Booking total invariant violated during ancillary replacement');
      wholeVndAmount(fromMinorUnits(nextAmountMinor));
      booking.total_amount = fromMinorUnits(nextAmountMinor);
      await this.repository.save(booking, transaction);
      return { booking, subtotal: newResult.subtotal, ancillaries: newResult.snapshots };
    });
  }
}

module.exports = { AncillariesService, httpError };
