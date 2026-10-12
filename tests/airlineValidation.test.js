const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  airlineIdValidator,
  createAirlineValidator,
  updateAirlineValidator,
  listAirlineValidator,
} = require('../validators/airline.validator');
const validate = require('../middlewares/validate.middleware');

test('airline validation rejects invalid creation payload', async () => {
  const app = express();
  app.use(express.json());
  app.post('/airlines', createAirlineValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    // Missing required fields
    const resEmpty = await fetch(`http://127.0.0.1:${server.address().port}/airlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resEmpty.status, 422);

    // Invalid IATA code (too long or invalid characters)
    const resBadIata = await fetch(`http://127.0.0.1:${server.address().port}/airlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'VietJet', iata_code: 'VIETJET' }),
    });
    assert.equal(resBadIata.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('airline validation rejects empty update payload or invalid id', async () => {
  const app = express();
  app.use(express.json());
  app.put('/airlines/:id', updateAirlineValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    // Invalid ID
    const resBadId = await fetch(`http://127.0.0.1:${server.address().port}/airlines/abc`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Name' }),
    });
    assert.equal(resBadId.status, 422);

    // Empty body
    const resEmptyBody = await fetch(`http://127.0.0.1:${server.address().port}/airlines/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resEmptyBody.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('airline validation rejects invalid query parameters for listing', async () => {
  const app = express();
  app.get('/airlines', listAirlineValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const resBadPage = await fetch(`http://127.0.0.1:${server.address().port}/airlines?page=0`);
    assert.equal(resBadPage.status, 422);

    const resBadLimit = await fetch(`http://127.0.0.1:${server.address().port}/airlines?limit=999`);
    assert.equal(resBadLimit.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
