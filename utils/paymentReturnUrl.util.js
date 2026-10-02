const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseHttpUrl(value, fieldName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw createHttpError(`${fieldName} must be a valid absolute URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw createHttpError(`${fieldName} must use HTTP or HTTPS and must not contain credentials`);
  }

  return parsed;
}

function addConfiguredOrigin(origins, value) {
  if (!value) return;
  origins.add(parseHttpUrl(value.trim(), 'Configured payment return URL').origin);
}

function getAllowedReturnOrigins(configuredReturnUrl, fallbackUrl) {
  const origins = new Set();

  addConfiguredOrigin(origins, configuredReturnUrl);
  addConfiguredOrigin(origins, fallbackUrl);
  addConfiguredOrigin(origins, process.env.CLIENT_URL);

  const explicitAllowlist = process.env.PAYMENT_RETURN_URL_ALLOWLIST || '';
  explicitAllowlist
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => addConfiguredOrigin(origins, item));

  return origins;
}

function resolvePaymentReturnUrl(requestedUrl, configuredReturnUrl, fallbackUrl = null) {
  const selectedUrl = requestedUrl || configuredReturnUrl || fallbackUrl;
  if (!selectedUrl) return null;

  const parsed = parseHttpUrl(selectedUrl, 'return_url');

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw createHttpError('return_url must use HTTPS in production');
  }

  if (requestedUrl) {
    const allowedOrigins = getAllowedReturnOrigins(configuredReturnUrl, fallbackUrl);
    if (!allowedOrigins.has(parsed.origin)) {
      throw createHttpError('return_url origin is not allowed');
    }
  }

  if (
    process.env.NODE_ENV === 'production'
    && LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw createHttpError('return_url must not point to localhost in production');
  }

  return parsed.toString();
}

module.exports = { resolvePaymentReturnUrl };
