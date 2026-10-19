'use strict';

async function recordBookingStatusTransition({ booking, toStatus, source, actorUserId = null, fromStatusOverride, repository, transaction }) {
  if (booking.status === toStatus && fromStatusOverride === undefined) return false;
  if (!repository?.createStatusHistory) throw new TypeError('Booking status history repository is required');

  const fromStatus = fromStatusOverride === undefined ? booking.status || null : fromStatusOverride;
  await repository.createStatusHistory({
    booking_id: booking.id,
    from_status: fromStatus,
    to_status: toStatus,
    source,
    actor_user_id: actorUserId || null,
  }, { transaction });

  booking.status = toStatus;
  await repository.save(booking, { transaction });
  return true;
}

module.exports = { recordBookingStatusTransition };
