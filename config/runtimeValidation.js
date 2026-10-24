const isPrivateOrLocalHost = (hostname) => {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0' || host === '::') return true;
  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 169 && octets[1] === 254);
  }
  return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
};

const parseHttpsUrl = (value, name) => {
  let parsed;
  try { parsed = new URL(value); } catch (_error) { throw new Error(`${name} must be a valid URL.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${name} must use HTTPS and must not contain credentials.`);
  }
  if (isPrivateOrLocalHost(parsed.hostname)) throw new Error(`${name} must not target localhost or a private network.`);
  return parsed;
};

const trustedHosts = (value) => String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);

const assertTrustedHost = (url, name, hosts) => {
  if (!hosts.some((allowed) => allowed === url.hostname.toLowerCase()
    || (allowed.startsWith('*.') && url.hostname.toLowerCase().endsWith(allowed.slice(1))))) {
    throw new Error(`${name} hostname is not in PAYOS_TRUSTED_HOSTS.`);
  }
};

const assertValidEmailFrom = (value) => {
  if (!value || /[\r\n]/.test(value)) throw new Error('EMAIL_FROM is required and must be a valid sender address.');
  const address = String(value).match(/<([^<>\s]+)>\s*$/)?.[1] || String(value).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error('EMAIL_FROM must contain a valid sender address.');
};

const parseTrustedHosts = (value) => String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);

const assertHostAllowed = (url, name, hosts) => {
  if (!hosts.some((allowed) => allowed === url.hostname.toLowerCase()
    || (allowed.startsWith('*.') && url.hostname.toLowerCase().endsWith(allowed.slice(1))))) {
    throw new Error(`${name} hostname is not in the configured trusted hosts.`);
  }
};

function validateAlertWebhookConfiguration(env = process.env) {
  const endpoint = String(env.RECONCILIATION_ALERT_WEBHOOK_URL || '').trim();
  const secret = String(env.RECONCILIATION_ALERT_WEBHOOK_SECRET || '').trim();
  const trustedHosts = parseTrustedHosts(env.RECONCILIATION_ALERT_TRUSTED_HOSTS);
  const hasPartialConfiguration = Boolean(endpoint || secret || trustedHosts.length);
  if (!hasPartialConfiguration) return { enabled: false };

  const timeoutMs = Number(env.RECONCILIATION_ALERT_TIMEOUT_MS || 3000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('RECONCILIATION_ALERT_TIMEOUT_MS must be an integer between 100 and 30000.');
  }
  if (env.NODE_ENV === 'test') return { enabled: false };
  if (!endpoint) throw new Error('RECONCILIATION_ALERT_WEBHOOK_URL is required when alert delivery is configured.');
  if (env.NODE_ENV === 'production') {
    const url = parseHttpsUrl(endpoint, 'RECONCILIATION_ALERT_WEBHOOK_URL');
    if (trustedHosts.length === 0) throw new Error('RECONCILIATION_ALERT_TRUSTED_HOSTS is required in production when alert delivery is enabled.');
    assertHostAllowed(url, 'RECONCILIATION_ALERT_WEBHOOK_URL', trustedHosts);
    if (secret.length < 32) throw new Error('RECONCILIATION_ALERT_WEBHOOK_SECRET must be at least 32 characters in production.');
  }
  return { enabled: true, endpoint, secret, timeoutMs, trustedHosts };
}

const validateRuntimeConfiguration = (env = process.env) => {
  const payosMode = (env.PAYOS_MODE || 'disabled').toLowerCase();
  const allowedPayosModes = ['disabled', 'demo', 'live'];

  if (!allowedPayosModes.includes(payosMode)) {
    throw new Error(`Invalid PAYOS_MODE '${payosMode}'. Expected disabled, demo, or live.`);
  }

  if (env.NODE_ENV === 'production' && payosMode === 'demo') {
    throw new Error('PAYOS_MODE=demo is forbidden in production. Use disabled or live.');
  }

  const vnpayMode = (env.VNPAY_MODE || 'disabled').toLowerCase();
  if (!['disabled', 'sandbox', 'production'].includes(vnpayMode)) {
    throw new Error(`Invalid VNPAY_MODE '${vnpayMode}'. Expected disabled, sandbox, or production.`);
  }
  if (env.NODE_ENV === 'production' && vnpayMode === 'sandbox') {
    throw new Error('VNPAY_MODE=sandbox is forbidden in production. Use production or disabled.');
  }

  if (env.NODE_ENV !== 'production') return;

  const requiredSecrets = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL'];
  if (vnpayMode === 'production') requiredSecrets.push('VNP_TMN_CODE', 'VNP_HASH_SECRET', 'VNP_URL');
  if (payosMode === 'live') {
    requiredSecrets.push('PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY');
  }

  const missingSecrets = requiredSecrets.filter(
    (name) => !env[name] || !env[name].trim()
  );
  if (missingSecrets.length > 0) {
    throw new Error(`Missing required production secrets: ${missingSecrets.join(', ')}`);
  }

  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (String(env[name]).length < 32) throw new Error(`${name} must be at least 32 characters in production.`);
  }

  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different in production.');
  }

  parseHttpsUrl(env.CLIENT_URL, 'CLIENT_URL');

  if (vnpayMode === 'production') {
    let endpoint;
    try { endpoint = new URL(env.VNP_URL); } catch (_error) { throw new Error('VNP_URL must be a valid URL in production.'); }
    if (endpoint.protocol !== 'https:' || endpoint.hostname === 'sandbox.vnpayment.vn') {
      throw new Error('Production VNPay must use a non-sandbox HTTPS VNP_URL.');
    }
  }

  if (payosMode === 'live') {
    const baseUrl = parseHttpsUrl(env.PAYOS_BASE_URL, 'PAYOS_BASE_URL');
    if (isPrivateOrLocalHost(baseUrl.hostname)) throw new Error('PAYOS_BASE_URL must target a public HTTPS host.');
    const hosts = trustedHosts(env.PAYOS_TRUSTED_HOSTS);
    if (hosts.length === 0) throw new Error('PAYOS_TRUSTED_HOSTS is required when PAYOS_MODE=live.');
    for (const [name, value] of [['PAYOS_RETURN_URL', env.PAYOS_RETURN_URL], ['PAYOS_CANCEL_URL', env.PAYOS_CANCEL_URL], ['PAYOS_WEBHOOK_URL', env.PAYOS_WEBHOOK_URL]]) {
      const url = parseHttpsUrl(value, name);
      assertTrustedHost(url, name, hosts);
    }
  }

  const emailMode = (env.EMAIL_DELIVERY_MODE || (env.RESEND_API_KEY ? 'live' : 'disabled')).toLowerCase();
  if (!['disabled', 'live'].includes(emailMode)) throw new Error(`Invalid EMAIL_DELIVERY_MODE '${emailMode}'. Expected disabled or live.`);
  if (emailMode === 'live') {
    if (!env.RESEND_API_KEY || !String(env.RESEND_API_KEY).trim()) throw new Error('RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=live.');
    assertValidEmailFrom(env.EMAIL_FROM);
  }

  validateAlertWebhookConfiguration(env);
};

module.exports = { validateRuntimeConfiguration, validateAlertWebhookConfiguration, isPrivateOrLocalHost };
