const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  airportIdValidator,
  createAirportValidator,
  updateAirportValidator,
  listAirportValidator,
} = require('../validators/airport.validator');
const validate = require('../middlewares/validate.middleware');

test('airport validation rejects invalid creation payload', async () => {
  const app = express();
  app.use(express.json());
  app.post('/airports', createAirportValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    // Missing required fields
    const resEmpty = await fetch(`http://127.0.0.1:${server.address().port}/airports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resEmpty.status, 422);

    // Invalid IATA code (not 3 uppercase letters)
    const resBadIata = await fetch(`http://127.0.0.1:${server.address().port}/airports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tan Son Nhat', city: 'TP HCM', iata_code: 'SGN1' }),
    });
    assert.equal(resBadIata.status, 422);

    // Invalid name (too short)
    const resShortName = await fetch(`http://127.0.0.1:${server.address().port}/airports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AB', city: 'Hanoi', iata_code: 'HAN' }),
    });
    assert.equal(resShortName.status, 422);

    // Forbidden field (id / mass assignment attempt)
    const resForbiddenField = await fetch(`http://127.0.0.1:${server.address().port}/airports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 99, name: 'Noi Bai Airport', city: 'Hanoi', iata_code: 'HAN' }),
    });
    assert.equal(resForbiddenField.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('airport validation rejects empty update payload or invalid id', async () => {
  const app = express();
  app.use(express.json());
  app.put('/airports/:id', updateAirportValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    // Invalid ID
    const resBadId = await fetch(`http://127.0.0.1:${server.address().port}/airports/0`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Name' }),
    });
    assert.equal(resBadId.status, 422);

    // Empty body
    const resEmptyBody = await fetch(`http://127.0.0.1:${server.address().port}/airports/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(resEmptyBody.status, 422);

    // Prohibited field in update (timestamp / id modification)
    const resProhibited = await fetch(`http://127.0.0.1:${server.address().port}/airports/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 2, name: 'Valid Name' }),
    });
    assert.equal(resProhibited.status, 422);

    // Valid partial updates
    const resValidUpdate = await fetch(`http://127.0.0.1:${server.address().port}/airports/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Updated Name' }),
    });
    assert.equal(resValidUpdate.status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('airport validation rejects invalid query parameters for listing', async () => {
  const app = express();
  app.get('/airports', listAirportValidator, validate, (_req, res) => res.json({ reached: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const resBadPage = await fetch(`http://127.0.0.1:${server.address().port}/airports?page=0`);
    assert.equal(resBadPage.status, 422);

    const resBadLimit = await fetch(`http://127.0.0.1:${server.address().port}/airports?limit=999`);
    assert.equal(resBadLimit.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
