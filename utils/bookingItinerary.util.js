'use strict';

async function getBookingFlightIds(booking, repository, transaction) {
  const ids = [];
  if (booking?.flight_id !== undefined && booking?.flight_id !== null) ids.push(Number(booking.flight_id));
  if (booking?.id && typeof repository?.findBookingSegments === 'function') {
    const segments = await repository.findBookingSegments(booking.id, transaction);
    for (const segment of segments || []) ids.push(Number(segment.flight_id));
  }
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

async function releaseBookingFlightSeats(booking, { repository, transaction, findFlight }) {
  if (!Array.isArray(booking?.passengers) || booking.passengers.length === 0) {
    throw new TypeError('Booking passenger data is required to release held seats');
  }
  const flightIds = await getBookingFlightIds(booking, repository, transaction);
  const passengerCount = booking.passengers.length;
  const updates = [];
  for (const flightId of flightIds.sort((a, b) => a - b)) {
    const flight = await findFlight(flightId, transaction);
    if (!flight) continue;
    flight.available_seats += passengerCount;
    await repository.save(flight, { transaction });
    updates.push({ flight_id: flight.id, available_seats: flight.available_seats });
  }
  return updates;
}

module.exports = { getBookingFlightIds, releaseBookingFlightSeats };
