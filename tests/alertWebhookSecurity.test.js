'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validateAlertWebhookConfiguration } = require('../config/runtimeValidation');
const { createConfiguredAlertSink, ReconciliationMetricsExporter } = require('../infrastructure/observability/reconciliationMetricsExporter');

const secret = 'alert-webhook-secret-that-is-at-least-32-chars';
const validProduction = {
  NODE_ENV: 'production',
  RECONCILIATION_ALERT_WEBHOOK_URL: 'https://alerts.example.com/hooks/reconciliation',
  RECONCILIATION_ALERT_TIMEOUT_MS: '2500',
  RECONCILIATION_ALERT_TRUSTED_HOSTS: 'alerts.example.com',
  RECONCILIATION_ALERT_WEBHOOK_SECRET: secret,
};

test('accepts a valid production alert webhook configuration', () => {
  assert.deepEqual(validateAlertWebhookConfiguration(validProduction), {
    enabled: true,
    endpoint: validProduction.RECONCILIATION_ALERT_WEBHOOK_URL,
    secret,
    timeoutMs: 2500,
    trustedHosts: ['alerts.example.com'],
  });
});

test('rejects missing secret, insecure URL, private endpoint and untrusted/deceptive hosts', () => {
  assert.throws(() => validateAlertWebhookConfiguration({ ...validProduction, RECONCILIATION_ALERT_WEBHOOK_SECRET: '' }), /WEBHOOK_SECRET/);
  assert.throws(() => validateAlertWebhookConfiguration({ ...validProduction, RECONCILIATION_ALERT_WEBHOOK_URL: 'http://alerts.example.com/hooks' }), /HTTPS/);
  assert.throws(() => validateAlertWebhookConfiguration({ ...validProduction, RECONCILIATION_ALERT_WEBHOOK_URL: 'https://127.0.0.1/hooks', RECONCILIATION_ALERT_TRUSTED_HOSTS: '127.0.0.1' }), /localhost|private/i);
  assert.throws(() => validateAlertWebhookConfiguration({ ...validProduction, RECONCILIATION_ALERT_WEBHOOK_URL: 'https://alerts.example.com.evil.test/hooks', RECONCILIATION_ALERT_TRUSTED_HOSTS: 'example.com' }), /trusted hosts/);
  assert.throws(() => validateAlertWebhookConfiguration({ ...validProduction, RECONCILIATION_ALERT_TRUSTED_HOSTS: '' }), /TRUSTED_HOSTS/);
});

test('test mode disables external alert delivery even when configured', () => {
  assert.equal(createConfiguredAlertSink({ environment: { ...validProduction, NODE_ENV: 'test' }, fetchImpl: async () => { throw new Error('must not call fetch'); } }), null);
});

test('signs the exact body, includes a stable grouping key and rejects redirects', async () => {
  let request;
  const sink = createConfiguredAlertSink({
    environment: validProduction,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 202 };
    },
  });
  await sink({ code: 'MANUAL_REVIEW_QUEUE_HIGH', value: 3, cooldown_ms: 300000 });
  const expected = crypto.createHmac('sha256', secret).update(request.options.body).digest('hex');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['x-alert-signature'], `sha256=${expected}`);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.grouping_key, 'reconciliation:MANUAL_REVIEW_QUEUE_HIGH');
  assert.equal(payload.alert.value, 3);
  assert.equal(Object.hasOwn(payload, 'payment_id'), false);
});

test('timeout and delivery failures stay isolated from metrics refresh', async () => {
  const warnings = [];
  const exporter = new ReconciliationMetricsExporter({
    service: { getReconciliationMetrics: async () => ({ metrics: { active_reconciliation_cases: 1 }, alerts: [{ code: 'GATEWAY_TIMEOUT_RATE', value: 1 }] }) },
    alertSink: async () => { throw new Error('timeout'); },
    logger: { warn: (...args) => warnings.push(args.join(' ')) },
  });
  const snapshot = await exporter.refresh();
  assert.equal(snapshot.metrics.active_reconciliation_cases, 1);
  assert.equal(warnings.length, 1);
});

test('passes the configured request timeout to the HTTP client', async () => {
  const sink = createConfiguredAlertSink({
    environment: { ...validProduction, RECONCILIATION_ALERT_TIMEOUT_MS: '100' },
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout was not enforced')), 150);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
    }),
  });
  await assert.rejects(() => sink({ code: 'GATEWAY_TIMEOUT_RATE', value: 1, cooldown_ms: 300000 }));
});
