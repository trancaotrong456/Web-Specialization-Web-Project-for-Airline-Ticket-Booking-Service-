const cron = require('node-cron');
const bookingService = require('../services/booking.service');
const { createBookingMaintenanceJob } = require('../infrastructure/jobs/bookingMaintenanceJob');

/**
 * Expire holding bookings cron job
 * Runs every minute: expires stale holding bookings and separately reconciles
 * pending payments that exceeded their configured callback grace period.
 *
 * IMPORTANT: Only targets { status: 'holding' } — NOT 'pending_payment'.
 */
let defaultJob;
function createDefaultNotificationWorker() {
  const models = require('../models');
  const { Op } = require('sequelize');
  const { SequelizeNotificationOutboxRepository } = require('../modules/notification/notificationOutbox.repository');
  const { NotificationDeliveryWorker } = require('../modules/notification/notificationDeliveryWorker');
  return new NotificationDeliveryWorker({
    repository: new SequelizeNotificationOutboxRepository({
      NotificationOutbox: models.NotificationOutbox, sequelize: models.sequelize, Op,
    }),
    emailProvider: require('../infrastructure/email/emailProvider').getEmailProvider(),
    getSocket: require('../infrastructure/realtime/socketProvider').getSocket,
  });
}

const initExpireBookingsJob = ({ notificationWorker } = {}) => {
  if (!defaultJob) {
    defaultJob = createBookingMaintenanceJob({
      cron,
      bookingService,
      notificationWorker: notificationWorker || createDefaultNotificationWorker(),
    });
  }
  return defaultJob.start();
};

module.exports = {
  initExpireBookingsJob,
};
