'use strict';

const { redactString } = require('../../shared/security/redactSensitive');

function emitReconciliationEvent(logger, event, fields = {}) {
  const payload = { event, at: new Date().toISOString(), ...fields };
  const safe = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? redactString(value) : value]));
  try {
    if (logger && typeof logger.info === 'function') logger.info(safe);
    else if (logger && typeof logger.log === 'function') logger.log(JSON.stringify(safe));
  } catch (_) {
    // Observability must never interrupt payment reconciliation.
  }
}

const alertState = new Map();
function evaluateReconciliationAlerts(metrics, environment = process.env, now = Date.now()) {
  const threshold = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const thresholds = {
    manualReviewQueue: threshold(environment.RECONCILIATION_ALERT_MANUAL_REVIEW, 10),
    oldestUnresolvedMinutes: threshold(environment.RECONCILIATION_ALERT_OLDEST_MINUTES, 60),
    pendingPaymentCount: threshold(environment.RECONCILIATION_ALERT_PENDING_COUNT, 10),
    leaseRecoveryCount: threshold(environment.RECONCILIATION_ALERT_LEASE_RECOVERY, 5),
  };
  const candidates = [];
  if (metrics.manual_review_cases >= thresholds.manualReviewQueue) candidates.push({ code: 'MANUAL_REVIEW_QUEUE_HIGH', value: metrics.manual_review_cases });
  if (metrics.oldest_unresolved_age_minutes >= thresholds.oldestUnresolvedMinutes) candidates.push({ code: 'OLDEST_UNRESOLVED_CASE_OLD', value: metrics.oldest_unresolved_age_minutes });
  if (metrics.pending_payments_beyond_sla >= thresholds.pendingPaymentCount) candidates.push({ code: 'PENDING_PAYMENT_SLA', value: metrics.pending_payments_beyond_sla });
  if (metrics.lease_recovery_count >= thresholds.leaseRecoveryCount) candidates.push({ code: 'LEASE_RECOVERY_ANOMALY', value: metrics.lease_recovery_count });
  const cooldownMs = Math.max(1000, threshold(environment.RECONCILIATION_ALERT_COOLDOWN_MS, 300000));
  return candidates.filter((alert) => {
    const previous = alertState.get(alert.code) || 0;
    if (now - previous < cooldownMs) return false;
    alertState.set(alert.code, now);
    return true;
  }).map((alert) => ({ ...alert, cooldown_ms: cooldownMs }));
}

module.exports = { emitReconciliationEvent, evaluateReconciliationAlerts };
