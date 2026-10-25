'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toMinorUnits, fromMinorUnits, addAmounts } = require('../modules/ancillaries/money.util');

test('decimal money arithmetic preserves cents without floating-point drift', () => {
  assert.equal(toMinorUnits('0.10') + toMinorUnits('0.20'), 30);
  assert.equal(fromMinorUnits(123456), '1234.56');
  assert.equal(addAmounts(['1250.50', '500.50', '99.99']), '1850.99');
});

test('decimal money arithmetic rejects unsupported precision and non-money input', () => {
  assert.throws(() => toMinorUnits('1.001'), /decimal|money/i);
  assert.throws(() => toMinorUnits('NaN'), /decimal|money/i);
  assert.throws(() => toMinorUnits('-1'), /decimal|money/i);
});
