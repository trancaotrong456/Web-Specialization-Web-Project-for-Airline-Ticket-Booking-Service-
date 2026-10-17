'use strict';

const FLIGHT_STATUS_EVENT_TYPES = Object.freeze({
  delayed: 'FLIGHT_DELAYED',
  cancelled: 'FLIGHT_CANCELLED',
  schedule_changed: 'FLIGHT_SCHEDULE_CHANGED',
});

function createFlightStatusNotificationAdapter({ publisher } = {}) {
  if (!publisher || typeof publisher.publish !== 'function') throw new TypeError('Notification event publisher is required');
  return {
    async handleFlightStatusChanged({ eventId, flightId, changeType, recipients = [], transaction } = {}) {
      const eventType = FLIGHT_STATUS_EVENT_TYPES[changeType];
      if (!eventId || !flightId || !eventType || !Array.isArray(recipients)) {
        throw new TypeError('A stable eventId, flightId, supported changeType and recipient list are required');
      }
      const results = [];
      for (const recipient of recipients) {
        if (!recipient?.userId) continue;
        results.push(await publisher.publish({
          eventKey: `flight:${flightId}:status:${eventId}:user:${recipient.userId}`,
          eventType,
          aggregateType: 'flight',
          aggregateId: flightId,
          recipientUserId: recipient.userId,
          relatedType: 'flight',
          relatedId: flightId,
          variables: { flight: recipient.flightCode || flightId },
        }, { transaction }));
      }
      return results;
    },
  };
}

module.exports = { createFlightStatusNotificationAdapter, FLIGHT_STATUS_EVENT_TYPES };
