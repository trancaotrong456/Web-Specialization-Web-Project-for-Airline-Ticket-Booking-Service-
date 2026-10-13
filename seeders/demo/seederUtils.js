'use strict';

async function planFixtureRows({ model, attributes, fixtures, key, entity, identityFields, transaction }) {
  const existingRows = await model.findAll({ attributes, ...(transaction ? { transaction } : {}) });
  const seenFixtures = new Set();
  const byKey = new Map();

  for (const fixture of fixtures) {
    const value = String(fixture[key] || '').trim();
    if (!value || seenFixtures.has(value)) throw new Error(`Demo ${entity} fixture has a missing or duplicate ${key}: ${value || '(empty)'}.`);
    seenFixtures.add(value);
  }
  for (const row of existingRows) {
    const value = String(row[key]);
    const matches = byKey.get(value) || [];
    matches.push(row);
    byKey.set(value, matches);
  }

  const missing = [];
  let existing = 0;
  for (const fixture of fixtures) {
    const matches = byKey.get(String(fixture[key])) || [];
    if (matches.length > 1) throw new Error(`Existing demo ${entity} identity ${fixture[key]} is duplicated; refusing to seed.`);
    if (!matches.length) {
      missing.push(fixture);
      continue;
    }
    const mismatch = identityFields.find((field) => String(matches[0][field] ?? '') !== String(fixture[field] ?? ''));
    if (mismatch) throw new Error(`Existing demo ${entity} ${fixture[key]} conflicts on ${mismatch}; refusing to overwrite or duplicate it.`);
    existing += 1;
  }
  return { existing, missing };
}

async function createMissingRows({ model, rows, transaction }) {
  for (const row of rows) await model.create({ ...row }, { ...(transaction ? { transaction } : {}) });
  return rows.length;
}

module.exports = { planFixtureRows, createMissingRows };
