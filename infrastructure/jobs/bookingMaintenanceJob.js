function createBookingMaintenanceJob({ cron, bookingService, notificationWorker, environment = process.env, logger = console } = {}) {
  if (!cron || !bookingService) throw new TypeError('Cron and BookingService are required');
  let scheduled;
  let started = false;
  function start() {
    if (started) return scheduled;
    scheduled = cron.schedule('* * * * *', async () => {
      try {
        const result = await bookingService.expireHoldingBookings();
        if (result.expiredCount > 0) logger.log(`[Cron] Expired ${result.expiredCount} holding booking(s) at ${new Date().toISOString()}`);
        if (environment.ENABLE_PENDING_RECONCILIATION === 'true') {
          const reconciliation = await bookingService.reconcileStalePendingPayments();
          if (reconciliation.reconciledCount > 0) logger.log(`[Cron] Reconciled ${reconciliation.reconciledCount} stale pending payment(s) at ${new Date().toISOString()}`);
        }
        if (notificationWorker) {
          try {
            const delivered = await notificationWorker.runBatch(25);
            if (delivered > 0) logger.log(`[Notifications] Processed ${delivered} outbox event(s)`);
          } catch (error) {
            logger.error('[Notifications] Outbox delivery job failed:', error.message);
          }
        }
      } catch (error) {
        logger.error('[Cron] Error in booking maintenance job:', error.message);
      }
    });
    started = true;
    const reconciliationState = environment.ENABLE_PENDING_RECONCILIATION === 'true' ? 'enabled' : 'disabled';
    logger.log(`[Cron] Booking expiry initialized; pending-payment reconciliation ${reconciliationState} (runs every minute)`);
    return scheduled;
  }
  return { start };
}

module.exports = { createBookingMaintenanceJob };
