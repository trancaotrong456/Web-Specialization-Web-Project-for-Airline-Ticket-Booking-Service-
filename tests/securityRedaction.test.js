'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { redactString, redactValue, redactError } = require('../shared/security/redactSensitive');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');

test('redacts bearer tokens, query secrets and inline credentials', () => {
  const value = redactString('Bearer abc.def token=secret123 https://gateway.test/cb?apiKey=key123&order=42 password:pw');
  assert.doesNotMatch(value, /abc\.def|secret123|key123|pw/);
  assert.match(value, /\[REDACTED\]/);
  assert.match(value, /order=42/);
});

test('redacts nested JSON fields and malformed gateway payloads safely', () => {
  const value = redactValue({ response: { access_token: 'a', amount: 10 }, nested: [{ password: 'p' }] });
  assert.equal(value.response.access_token, '[REDACTED]');
  assert.equal(value.response.amount, 10);
  assert.equal(value.nested[0].password, '[REDACTED]');
  assert.match(redactError({ message: 'bad', response: { clientSecret: 'secret' } }), /REDACTED/);
});

test('error filter exposes sanitized diagnostics outside production and hides them in production', () => {
  const error = Object.assign(new Error('Authorization: Bearer abc123 https://x.test/?token=secret'), { statusCode: 502 });
  const development = createErrorFilter({ getEnvironment: () => 'development' })(error);
  const production = createErrorFilter({ getEnvironment: () => 'production' })(error);
  assert.doesNotMatch(development.message, /abc123|secret/);
  assert.equal(production.message, 'Internal server error');
});
