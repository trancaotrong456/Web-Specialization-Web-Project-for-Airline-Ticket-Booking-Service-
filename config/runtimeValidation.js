const validateRuntimeConfiguration = (env = process.env) => {
  const payosMode = (env.PAYOS_MODE || 'disabled').toLowerCase();
  const allowedPayosModes = ['disabled', 'demo', 'live'];

  if (!allowedPayosModes.includes(payosMode)) {
    throw new Error(`Invalid PAYOS_MODE '${payosMode}'. Expected disabled, demo, or live.`);
  }

  if (env.NODE_ENV === 'production' && payosMode === 'demo') {
    throw new Error('PAYOS_MODE=demo is forbidden in production. Use disabled or live.');
  }

  if (env.NODE_ENV !== 'production') return;

  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'VNP_HASH_SECRET'];
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
};

module.exports = { validateRuntimeConfiguration };
