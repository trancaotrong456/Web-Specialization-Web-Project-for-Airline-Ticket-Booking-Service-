'use strict';

const SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const SANDBOX_HOST = 'sandbox.vnpayment.vn';
const SANDBOX_API_URL = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
const PRODUCTION_API_URL = 'https://merchant.vnpay.vn/merchant_webapi/api/transaction';
const MODES = new Set(['disabled', 'sandbox', 'production']);

function configError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isTestEnvironment(env) {
  return env.NODE_ENV === 'test';
}

function getVnpayConfig(env = process.env) {
  const mode = String(env.VNPAY_MODE || 'disabled').trim().toLowerCase();
  if (!MODES.has(mode)) {
    throw configError(`Invalid VNPAY_MODE '${mode}'. Expected disabled, sandbox, or production.`, 500);
  }

  // Tests use a local, non-network gateway fixture. It never sends a request
  // to VNPAY and keeps production credentials out of the test environment.
  if (mode === 'disabled' && isTestEnvironment(env)) {
    return {
      mode: 'sandbox',
      testOnly: true,
      tmnCode: env.VNP_TMN_CODE || 'TEST_TMN',
      hashSecret: env.VNP_HASH_SECRET || 'test-only-vnpay-secret',
      endpoint: env.VNP_URL || SANDBOX_URL,
      apiUrl: env.VNP_API_URL || SANDBOX_API_URL,
    };
  }

  if (mode === 'disabled') return { mode, enabled: false };
  if (mode === 'sandbox' && env.NODE_ENV === 'production') {
    throw configError('VNPAY_MODE=sandbox is forbidden in production. Use production or disabled.', 500);
  }

  const missing = ['VNP_TMN_CODE', 'VNP_HASH_SECRET'].filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw configError(`VNPay is not configured. Missing: ${missing.join(', ')}`);

  const endpoint = String(env.VNP_URL || (mode === 'sandbox' ? SANDBOX_URL : '')).trim();
  const apiUrl = String(env.VNP_API_URL || (mode === 'sandbox' ? SANDBOX_API_URL : PRODUCTION_API_URL)).trim();
  if (!endpoint) throw configError('VNP_URL is required when VNPAY_MODE=production.');
  if (!apiUrl) throw configError('VNP_API_URL is required when VNPAY_MODE=production.');

  let parsedEndpoint;
  try { parsedEndpoint = new URL(endpoint); } catch (_error) { throw configError('VNP_URL must be a valid URL.', 500); }
  if (mode === 'production' && (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.hostname === SANDBOX_HOST)) {
    throw configError('Production VNPay must use a non-sandbox HTTPS VNP_URL.', 500);
  }
  if (mode === 'sandbox' && parsedEndpoint.protocol !== 'https:') {
    throw configError('Sandbox VNPay VNP_URL must use HTTPS.', 500);
  }

  let parsedApiUrl;
  try { parsedApiUrl = new URL(apiUrl); } catch (_error) { throw configError('VNP_API_URL must be a valid URL.', 500); }
  if (parsedApiUrl.protocol !== 'https:') throw configError('VNPay API URL must use HTTPS.', 500);

  return {
    mode,
    enabled: true,
    testOnly: false,
    tmnCode: String(env.VNP_TMN_CODE).trim(),
    hashSecret: String(env.VNP_HASH_SECRET),
    endpoint,
    apiUrl,
  };
}

module.exports = { getVnpayConfig, SANDBOX_URL, SANDBOX_API_URL };
