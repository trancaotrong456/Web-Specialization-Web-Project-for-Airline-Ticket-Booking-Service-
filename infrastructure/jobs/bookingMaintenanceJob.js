function createBookingMaintenanceJob({ cron, bookingService, paymentService, metricsCollector, environment = process.env, logger = console } = {}) {
  if (!cron || !bookingService) throw new TypeError('Cron and BookingService are required');
  let scheduled;
  let started = false;
  let running = false;
  let stopping = false;
  function start() {
    if (started) return scheduled;
    stopping = false;
    scheduled = cron.schedule('* * * * *', async () => {
      if (running || stopping) return;
      running = true;
      try {
        const result = await bookingService.expireHoldingBookings();
        if (result.expiredCount > 0) logger.log(`[Cron] Expired ${result.expiredCount} holding booking(s) at ${new Date().toISOString()}`);
        if (environment.ENABLE_PENDING_RECONCILIATION === 'true') {
          const reconciliation = environment.PAYOS_RECONCILIATION_WORKER === 'true' && paymentService
            ? await paymentService.reconcilePayosCases({ jitterRatio: Number(environment.PAYOS_RECONCILIATION_JITTER || 0) })
            : await bookingService.reconcileStalePendingPayments();
          const count = reconciliation.reconciledCount ?? reconciliation.claimedCount ?? 0;
          if (count > 0) logger.log(`[Cron] Reconciled ${count} stale pending payment(s) at ${new Date().toISOString()}`);
        }
        await metricsCollector?.refresh?.();
      } catch (error) {
        logger.error('[Cron] Error in booking maintenance job:', error.message);
      } finally {
        running = false;
      }
    });
    started = true;
    metricsCollector?.start?.();
    const reconciliationState = environment.ENABLE_PENDING_RECONCILIATION === 'true' ? 'enabled' : 'disabled';
    logger.log(`[Cron] Booking expiry initialized; pending-payment reconciliation ${reconciliationState} (runs every minute)`);
    return scheduled;
  }
  async function waitForIdle(timeoutMs = 30000) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (running && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    return !running;
  }
  async function stop(timeoutMs = 30000) {
    stopping = true;
    if (scheduled && typeof scheduled.stop === 'function') scheduled.stop();
    metricsCollector?.stop?.();
    return waitForIdle(timeoutMs);
  }
  return { start, stop, waitForIdle, isRunning: () => running };
}

module.exports = { createBookingMaintenanceJob };
