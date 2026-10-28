'use strict';

const SENSITIVE_KEY = /(authorization|api[_-]?key|client[_-]?secret|checksum|hash[_-]?secret|password|passphrase|access[_-]?token|refresh[_-]?token|secret|token)/i;
const SENSITIVE_QUERY = /^(authorization|api[_-]?key|client[_-]?secret|checksum|hash|password|passphrase|access[_-]?token|refresh[_-]?token|secret|token)$/i;

function redactString(value) {
  let text = String(value == null ? '' : value);
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  text = text.replace(/((?:api[_-]?key|client[_-]?secret|checksum(?:[_-]?key)?|hash[_-]?secret|password|passphrase|access[_-]?token|refresh[_-]?token|authorization|secret|token)\s*[:=]\s*)([^\s,;&]+)/gi, '$1[REDACTED]');
  text = text.replace(/([?&](?:authorization|api[_-]?key|client[_-]?secret|checksum(?:[_-]?key)?|hash|password|passphrase|access[_-]?token|refresh[_-]?token|secret|token)=)[^&#\s]*/gi, '$1[REDACTED]');
  try {
    text = text.replace(/https?:\/\/[^\s]+/gi, (rawUrl) => {
      const url = new URL(rawUrl);
      for (const key of [...url.searchParams.keys()]) if (SENSITIVE_QUERY.test(key)) url.searchParams.set(key, '[REDACTED]');
      if (url.username || url.password) { url.username = '[REDACTED]'; url.password = ''; }
      return url.toString();
    });
  } catch (_) { /* malformed URL: keep token patterns redacted */ }
  return text.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function redactValue(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return '[REDACTED]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactValue(item, seen)]));
}

function redactError(error) {
  if (!error) return 'Unknown error';
  return redactString(JSON.stringify(redactValue({
    name: error.name,
    message: error.message || String(error),
    code: error.code,
    status: error.status,
    statusCode: error.statusCode,
    provider: error.provider,
    response: error.response,
  })));
}

module.exports = { redactString, redactValue, redactError };
