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
const defaultJob = createBookingMaintenanceJob({ cron, bookingService });
const initExpireBookingsJob = () => defaultJob.start();

module.exports = {
  initExpireBookingsJob,
};
