'use strict';

function toMinorUnits(value) {
  const text = String(value);
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new TypeError('Invalid money decimal');
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Money amount exceeds safe integer range');
  return Number(minor);
}

function fromMinorUnits(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid money minor units');
  const minor = BigInt(value);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

function addAmounts(values) {
  const total = values.reduce((sum, value) => sum + BigInt(toMinorUnits(value)), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Money amount exceeds safe integer range');
  return fromMinorUnits(Number(total));
}

function wholeVndAmount(value) {
  let minor;
  try { minor = toMinorUnits(value); } catch (_error) { minor = null; }
  if (minor === null || minor % 100 !== 0) {
    const error = new Error('VND amount must be a non-negative whole number');
    error.statusCode = 400;
    throw error;
  }
  return minor / 100;
}

module.exports = { toMinorUnits, fromMinorUnits, addAmounts, wholeVndAmount };
