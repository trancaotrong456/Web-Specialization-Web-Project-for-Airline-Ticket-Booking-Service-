const test = require('node:test');
const assert = require('node:assert/strict');
const { extractBearerToken } = require('../utils/authHeader.util');

test('extracts one Bearer credential with a case-insensitive scheme', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi');
});

test('rejects missing, empty, or ambiguous authorization credentials', () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken('Basic abc'), null);
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Bearer token trailing-data'), null);
  assert.equal(extractBearerToken('Bearer token '), null);
});
