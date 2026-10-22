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

  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
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

  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different in production.');
  }

  if (vnpayMode === 'production') {
    let endpoint;
    try { endpoint = new URL(env.VNP_URL); } catch (_error) { throw new Error('VNP_URL must be a valid URL in production.'); }
    if (endpoint.protocol !== 'https:' || endpoint.hostname === 'sandbox.vnpayment.vn') {
      throw new Error('Production VNPay must use a non-sandbox HTTPS VNP_URL.');
    }
  }
};

module.exports = { validateRuntimeConfiguration };
