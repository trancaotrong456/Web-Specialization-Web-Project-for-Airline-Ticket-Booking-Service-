'use strict';

function fail(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; throw error; }
function validateLayout(layout) {
  if (!layout || !Number.isInteger(layout.row_count) || layout.row_count < 1 || layout.row_count > 200
    || !Number.isInteger(layout.column_count) || layout.column_count < 1 || layout.column_count > 40
    || !Array.isArray(layout.seats) || layout.seats.length > 5000) fail('Invalid seat map layout');
  const seatNos = new Set(); const positions = new Set();
  for (const seat of layout.seats) {
    if (!seat || typeof seat.seat_no !== 'string' || !/^[1-9]\d{0,2}[A-Z]{1,2}$/.test(seat.seat_no)
      || !Number.isInteger(seat.row_number) || seat.row_number < 1 || seat.row_number > layout.row_count
      || !Number.isInteger(seat.column_number) || seat.column_number < 1 || seat.column_number > layout.column_count
      || typeof seat.zone !== 'string' || !seat.zone.trim() || !Array.isArray(seat.special_properties ?? [])) fail('Invalid seat definition');
    const position = `${seat.row_number}:${seat.column_number}`;
    if (seatNos.has(seat.seat_no) || positions.has(position)) fail('Seat number and position must be unique');
    seatNos.add(seat.seat_no); positions.add(position);
  }
  if (!Array.isArray(layout.aisle_after ?? []) || (layout.aisle_after ?? []).some((n) => !Number.isInteger(n) || n < 1 || n >= layout.column_count)) fail('Invalid aisle positions');
  return { row_count: layout.row_count, column_count: layout.column_count,
    aisle_after: [...(layout.aisle_after ?? [])], seats: layout.seats.map((seat) => ({
      seat_no: seat.seat_no, row_number: seat.row_number, column_number: seat.column_number,
      zone: seat.zone.trim(), blocked: Boolean(seat.blocked), special_properties: [...(seat.special_properties ?? [])],
    })) };
}

class SeatSelectionService {
  constructor({ repository, transactionManager } = {}) {
    if (!repository || !transactionManager) throw new TypeError('Seat selection repository and transaction manager are required');
    this.repository = repository; this.transactionManager = transactionManager;
  }
  async listTemplates() { return this.repository.listCurrentTemplates(); }
  async createTemplate({ name, aircraft_type, layout }) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || typeof aircraft_type !== 'string' || !aircraft_type.trim() || aircraft_type.trim().length > 80) fail('Template name and aircraft type are required');
    const normalized = validateLayout(layout);
    return this.transactionManager.transaction(async (transaction) => {
      const latest = await this.repository.findLatestTemplate(name.trim(), transaction);
      if (latest?.is_current) await this.repository.updateTemplate(latest, { is_current: false }, transaction);
      return this.repository.createTemplate({ name: name.trim(), aircraft_type: aircraft_type.trim(), version: (latest?.version || 0) + 1, layout: normalized, is_current: true }, { transaction });
    });
  }
  async updateTemplate(id, data) {
    return this.transactionManager.transaction(async (transaction) => {
      const current = await this.repository.findTemplate(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!current || !current.is_current) fail('Current seat map template not found', 404);
      const layout = validateLayout(data.layout);
      const name = data.name === undefined ? current.name : String(data.name).trim();
      const aircraftType = data.aircraft_type === undefined ? current.aircraft_type : String(data.aircraft_type).trim();
      if (!name || name.length > 120 || !aircraftType || aircraftType.length > 80) fail('Template name and aircraft type are required');
      await this.repository.updateTemplate(current, { is_current: false }, transaction);
      return this.repository.createTemplate({ name, aircraft_type: aircraftType, version: current.version + 1, layout, is_current: true }, { transaction });
    });
  }
  async deleteTemplate(id) {
    const template = await this.repository.findTemplate(id);
    if (!template || !template.is_current) fail('Current seat map template not found', 404);
    if (await this.repository.findTemplateSnapshots(id)) fail('Template is assigned to a flight and cannot be deleted', 409);
    await this.repository.updateTemplate(template, { is_current: false });
    return { message: 'Seat map template archived' };
  }
  async assignTemplateToFlight(flightId, templateId, zoneFareClasses) {
    if (!zoneFareClasses || typeof zoneFareClasses !== 'object' || Array.isArray(zoneFareClasses)) fail('FareClass mapping is required');
    return this.transactionManager.transaction(async (transaction) => {
      const flight = await this.repository.findFlight(flightId, transaction);
      if (!flight) fail('Flight not found', 404);
      const template = await this.repository.findTemplate(templateId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!template || !template.is_current) fail('Current seat map template not found', 404);
      const existing = await this.repository.findFlightMap(flightId, transaction);
      if (existing) {
        const seats = await this.repository.listFlightSeats(flightId, transaction, true);
        if (seats.some((seat) => ['held', 'booked'].includes(seat.status))) fail('Cannot replace a seat map with active seat reservations', 409);
      }
      const zones = [...new Set(template.layout.seats.filter((seat) => !seat.blocked).map((seat) => seat.zone))];
      const fareIds = zones.map((zone) => Number(zoneFareClasses[zone]));
      if (fareIds.some((id) => !Number.isInteger(id) || id < 1) || Object.keys(zoneFareClasses).some((zone) => !zones.includes(zone))) fail('Map each sellable seat zone to one FareClass');
      const fareClasses = await this.repository.findFlightFareClasses(flightId, [...new Set(fareIds)], transaction);
      if (fareClasses.length !== new Set(fareIds).size) fail('Every mapped FareClass must belong to this flight');
      const snapshot = { row_count: template.layout.row_count, column_count: template.layout.column_count,
        aisle_after: template.layout.aisle_after, seats: template.layout.seats.map((seat) => ({ ...seat, fare_class_id: seat.blocked ? null : Number(zoneFareClasses[seat.zone]) })) };
      let map;
      if (existing) {
        await this.repository.deleteFlightSeats(flightId, transaction);
        map = await this.repository.updateFlightMap(existing, { template_id: template.id, template_version: template.version, snapshot }, transaction);
      } else map = await this.repository.createFlightMap({ flight_id: flightId, template_id: template.id, template_version: template.version, snapshot }, transaction);
      await this.repository.bulkCreateFlightSeats(snapshot.seats.map((seat) => ({
        flight_seat_map_id: map.id, flight_id: Number(flightId), seat_no: seat.seat_no, row_number: seat.row_number,
        column_number: seat.column_number, zone: seat.zone, special_properties: seat.special_properties,
        fare_class_id: seat.fare_class_id, status: seat.blocked ? 'blocked' : 'available',
      })), transaction);
      return map;
    });
  }
  async getFlightMap(flightId) {
    const map = await this.repository.findFlightMap(flightId);
    if (!map) return { supported: false, flight_id: Number(flightId), seats: [] };
    const seats = await this.repository.listFlightSeats(flightId);
    return { supported: true, flight_id: Number(flightId), template_version: map.template_version,
      row_count: map.snapshot.row_count, column_count: map.snapshot.column_count, aisle_after: map.snapshot.aisle_after,
      seats: seats.map((seat) => ({ seat_no: seat.seat_no, row_number: seat.row_number, column_number: seat.column_number,
        zone: seat.zone, special_properties: seat.special_properties, fare_class_id: seat.fare_class_id, status: seat.status })) };
  }
  async reserveSeats({ bookingId, passengers, selections, legs, holdExpiresAt, transaction }) {
    if (!Array.isArray(selections) || selections.length === 0) return [];
    const passengerCount = passengers.length;
    const seen = new Set(); const passengerSelections = new Set(); const requests = selections.map((selection) => {
      const legOrder = Number(selection.leg_order); const passengerIndex = Number(selection.passenger_index);
      const leg = legs[legOrder - 1]; const seatNo = String(selection.seat_no || '').trim().toUpperCase();
      if (!leg || !Number.isInteger(passengerIndex) || passengerIndex < 0 || passengerIndex >= passengerCount || !seatNo) fail('Seat selection does not match the itinerary or passenger');
      const key = `${leg.flight_id}:${seatNo}`; const passengerKey = `${legOrder}:${passengerIndex}`;
      if (seen.has(key) || passengerSelections.has(passengerKey)) fail('A seat and passenger can only be selected once');
      seen.add(key); passengerSelections.add(passengerKey); return { ...selection, legOrder, passengerIndex, passengerKey, leg, seatNo };
    }).sort((a, b) => a.leg.flight_id - b.leg.flight_id || a.seatNo.localeCompare(b.seatNo));
    const reserved = [];
    for (const request of requests) {
      const seat = await this.repository.findFlightSeatForUpdate(request.leg.flight_id, request.seatNo, transaction);
      if (!seat || seat.status !== 'available') fail(`Seat ${request.seatNo} is not available`, 409);
      if (Number(seat.fare_class_id) !== Number(request.leg.fareClass.id)) fail(`Seat ${request.seatNo} is not eligible for the selected FareClass`);
      await this.repository.reserveFlightSeat(seat, { status: 'held', booking_id: bookingId,
        booking_passenger_id: passengers[request.passengerIndex].id, leg_order: request.legOrder, hold_expires_at: holdExpiresAt }, transaction);
      reserved.push({ flight_id: Number(request.leg.flight_id), seat_no: request.seatNo, leg_order: request.legOrder, passenger_index: request.passengerIndex });
    }
    return reserved;
  }
  async confirmBookingSeats(bookingId, transaction) {
    const seats = await this.repository.findBookingSeats(bookingId, transaction, true);
    for (const seat of seats) if (seat.status === 'held') await this.repository.reserveFlightSeat(seat, { status: 'booked', hold_expires_at: null }, transaction);
  }
  async releaseBookingSeats(bookingId, transaction) {
    const seats = await this.repository.findBookingSeats(bookingId, transaction, true);
    for (const seat of seats) await this.repository.reserveFlightSeat(seat, { status: 'available', booking_id: null, booking_passenger_id: null, leg_order: null, hold_expires_at: null }, transaction);
  }
  async getBookingSeats(bookingId) { return this.repository.findBookingSeats(bookingId, null); }
}

module.exports = { SeatSelectionService, validateLayout };
