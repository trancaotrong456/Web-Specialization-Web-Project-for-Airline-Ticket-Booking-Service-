const cron = require('node-cron');
const bookingService = require('../services/booking.service');

/**
 * Expire holding bookings cron job
 * Runs every minute: checks for bookings with status='holding'
 * and hold_expires_at < NOW(), then marks them as 'expired'.
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
    } catch (error) {
      console.error('[Cron] Error in expireHoldingBookings job:', error.message);
    }
  });

  console.log('[Cron] Expire holding bookings job initialized (runs every minute)');
};

module.exports = {
  initExpireBookingsJob,
};
