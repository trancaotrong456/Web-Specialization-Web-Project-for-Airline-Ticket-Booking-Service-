const cron = require('node-cron');
const bookingService = require('../services/booking.service');

/**
 * Expire holding bookings cron job
 * Runs every minute: expires stale holding bookings and separately reconciles
 * pending payments that exceeded their configured callback grace period.
 *
 * IMPORTANT: Only targets { status: 'holding' } — NOT 'pending_payment'.
 */
const initExpireBookingsJob = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const result = await bookingService.expireHoldingBookings();
      if (result.expiredCount > 0) {
        console.log(`[Cron] Expired ${result.expiredCount} holding booking(s) at ${new Date().toISOString()}`);
      }

      if (process.env.ENABLE_PENDING_RECONCILIATION === 'true') {
        const reconciliation = await bookingService.reconcileStalePendingPayments();
        if (reconciliation.reconciledCount > 0) {
          console.log(`[Cron] Reconciled ${reconciliation.reconciledCount} stale pending payment(s) at ${new Date().toISOString()}`);
        }
      }
    } catch (error) {
      console.error('[Cron] Error in booking maintenance job:', error.message);
    }
  });

  const reconciliationState = process.env.ENABLE_PENDING_RECONCILIATION === 'true' ? 'enabled' : 'disabled';
  console.log(`[Cron] Booking expiry initialized; pending-payment reconciliation ${reconciliationState} (runs every minute)`);
};

module.exports = {
  initExpireBookingsJob,
};
