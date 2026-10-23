'use strict';

const { evaluateReconciliationAlerts } = require('./reconciliationObservability');

class ReconciliationMetricsExporter {
  constructor({ service, logger = console, alertSink = null, intervalMs = 60000, environment = process.env, clock = () => Date.now() } = {}) {
    if (!service) throw new TypeError('A reconciliation service is required');
    this.service = service;
    this.logger = logger;
    this.alertSink = alertSink;
    this.intervalMs = Math.max(1000, Number(intervalMs) || 60000);
    this.environment = environment;
    this.clock = clock;
    this.timer = null;
    this.refreshing = null;
    this.snapshot = null;
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const result = await this.service.getReconciliationMetrics({ now: new Date(this.clock()) });
        const metrics = { ...result.metrics, collected_at: new Date(this.clock()).toISOString() };
        this.snapshot = { metrics, alerts: result.alerts || [] };
        for (const alert of this.snapshot.alerts) {
          try { await this.alertSink?.(alert); } catch (error) { this.logger.warn?.('[Reconciliation] alert delivery failed:', error.message); }
        }
        return this.snapshot;
      } catch (error) {
        this.logger.warn?.('[Reconciliation] metrics refresh failed:', error.message);
        return this.snapshot;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  start() {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async getSnapshot() { return this.snapshot || this.refresh(); }

  async renderPrometheus() {
    const snapshot = await this.getSnapshot();
    if (!snapshot) return '# reconciliation metrics unavailable\n';
    const lines = ['# HELP reconciliation_collected_at_seconds Unix timestamp of the latest successful collection', '# TYPE reconciliation_collected_at_seconds gauge'];
    const collected = Date.parse(snapshot.metrics.collected_at) / 1000;
    lines.push(`reconciliation_collected_at_seconds ${Number.isFinite(collected) ? collected : 0}`);
    for (const [key, value] of Object.entries(snapshot.metrics)) {
      if (key === 'collected_at' || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const name = `reconciliation_${key}`;
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

function createReconciliationMetricsExporter(options) { return new ReconciliationMetricsExporter(options); }

function createConfiguredAlertSink({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  const endpoint = String(environment.RECONCILIATION_ALERT_WEBHOOK_URL || '').trim();
  if (!endpoint || typeof fetchImpl !== 'function') return null;
  return async (alert) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'airline-booking-reconciliation', severity: alert.code === 'PENDING_PAYMENT_SLA' ? 'warning' : 'critical', alert: { code: alert.code, value: alert.value, cooldown_ms: alert.cooldown_ms } }),
      signal: AbortSignal.timeout(Number(environment.RECONCILIATION_ALERT_TIMEOUT_MS || 3000)),
    });
    if (!response.ok) throw new Error(`alert backend returned HTTP ${response.status}`);
  };
}

module.exports = { ReconciliationMetricsExporter, createReconciliationMetricsExporter, createConfiguredAlertSink };
