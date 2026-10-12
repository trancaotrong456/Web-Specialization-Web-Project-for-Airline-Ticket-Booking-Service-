const test = require('node:test');
const assert = require('node:assert/strict');
const airlineService = require('../services/airline.service');
const { Airline, Flight } = require('../models');

const expectedAttributes = [
  'id',
  'name',
  'iata_code',
  'logo_url',
  'created_at',
  'updated_at',
];

test('airline list uses the documented fields, search filtering, and pagination', async () => {
  const originalFindAndCountAll = Airline.findAndCountAll;
  let receivedOptions;
  const rows = [
    { id: 1, name: 'Bamboo Airways', iata_code: 'QH' },
    { id: 2, name: 'VietJet Air', iata_code: 'VJ' },
  ];
  Airline.findAndCountAll = async (options) => {
    receivedOptions = options;
    return { count: 2, rows };
  };

  try {
    const result = await airlineService.getAll({ page: 1, limit: 10, search: 'vietjet' });
    assert.deepEqual(result, {
      total: 2,
      page: 1,
      limit: 10,
      data: rows,
    });
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
    assert.deepEqual(receivedOptions.order, [['name', 'ASC']]);
    assert.equal(receivedOptions.limit, 10);
    assert.equal(receivedOptions.offset, 0);
    assert.ok(receivedOptions.where);
  } finally {
    Airline.findAndCountAll = originalFindAndCountAll;
  }
});

test('airline detail returns documented attributes', async () => {
  const originalFindByPk = Airline.findByPk;
  let receivedId;
  let receivedOptions;
  const airline = { id: 1, name: 'Vietnam Airlines', iata_code: 'VN' };
  Airline.findByPk = async (id, options) => {
    receivedId = id;
    receivedOptions = options;
    return airline;
  };

  try {
    const result = await airlineService.getById(1);
    assert.equal(result, airline);
    assert.equal(receivedId, 1);
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
  } finally {
    Airline.findByPk = originalFindByPk;
  }
});

test('airline detail reports a missing airline as 404', async () => {
  const originalFindByPk = Airline.findByPk;
  Airline.findByPk = async () => null;

  try {
    await assert.rejects(
      airlineService.getById(999),
      (error) => error.statusCode === 404 && error.message === 'Airline not found',
    );
  } finally {
    Airline.findByPk = originalFindByPk;
  }
});

test('airline creation normalizes data and rejects duplicates with 409', async () => {
  const originalFindOne = Airline.findOne;
  const originalCreate = Airline.create;
  let createdValues;
  Airline.findOne = async () => null;
  Airline.create = async (values) => {
    createdValues = values;
    return { id: 10, ...values };
  };

  try {
    const result = await airlineService.create({
      name: ' VietJet Air ',
      iata_code: ' vj ',
      logo_url: ' https://example.com/logo.png ',
    });

    assert.equal(result.id, 10);
    assert.deepEqual(createdValues, {
      name: 'VietJet Air',
      iata_code: 'VJ',
      logo_url: 'https://example.com/logo.png',
    });

    // Test duplicate check
    Airline.findOne = async () => ({ id: 1, iata_code: 'VJ' });
    await assert.rejects(
      airlineService.create({ name: 'VietJet', iata_code: 'VJ' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airline.findOne = originalFindOne;
    Airline.create = originalCreate;
  }
});

test('airline creation maps concurrent unique constraint violation to HTTP 409', async () => {
  const originalFindOne = Airline.findOne;
  const originalCreate = Airline.create;
  Airline.findOne = async () => null;
  Airline.create = async () => {
    const error = new Error('Duplicate entry');
    error.name = 'SequelizeUniqueConstraintError';
    throw error;
  };

  try {
    await assert.rejects(
      airlineService.create({ name: 'Bamboo', iata_code: 'QH' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airline.findOne = originalFindOne;
    Airline.create = originalCreate;
  }
});

test('airline update changes allowed fields and rejects duplicate IATA code on other airlines', async () => {
  const originalFindByPk = Airline.findByPk;
  const originalFindOne = Airline.findOne;
  let updatedValues;
  const airline = {
    id: 1,
    name: 'Old Name',
    iata_code: 'VN',
    logo_url: null,
    async update(values) {
      updatedValues = values;
      Object.assign(this, values);
    },
  };
  Airline.findByPk = async () => airline;
  Airline.findOne = async () => null;

  try {
    const result = await airlineService.update(1, {
      name: 'Vietnam Airlines JSC',
      iata_code: 'vna',
      logo_url: 'https://example.com/vn.png',
    });

    assert.equal(result, airline);
    assert.deepEqual(updatedValues, {
      name: 'Vietnam Airlines JSC',
      iata_code: 'VNA',
      logo_url: 'https://example.com/vn.png',
    });

    // Conflict with another airline
    Airline.findOne = async () => ({ id: 2, iata_code: 'VJ' });
    await assert.rejects(
      airlineService.update(1, { iata_code: 'VJ' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airline.findByPk = originalFindByPk;
    Airline.findOne = originalFindOne;
  }
});

test('airline deletion is blocked if flights are assigned with HTTP 409', async () => {
  const originalFindByPk = Airline.findByPk;
  const originalCount = Flight.count;
  let destroyed = false;
  Airline.findByPk = async () => ({
    id: 1,
    async destroy() { destroyed = true; },
  });
  Flight.count = async () => 5;

  try {
    await assert.rejects(
      airlineService.delete(1),
      (error) => error.statusCode === 409 && error.message.includes('existing flights'),
    );
    assert.equal(destroyed, false);
  } finally {
    Airline.findByPk = originalFindByPk;
    Flight.count = originalCount;
  }
});

test('airline deletion succeeds when no flights are assigned', async () => {
  const originalFindByPk = Airline.findByPk;
  const originalCount = Flight.count;
  let destroyed = false;
  Airline.findByPk = async () => ({
    id: 99,
    async destroy() { destroyed = true; },
  });
  Flight.count = async () => 0;

  try {
    const result = await airlineService.delete(99);
    assert.deepEqual(result, { id: 99, message: 'Airline deleted' });
    assert.equal(destroyed, true);
  } finally {
    Airline.findByPk = originalFindByPk;
    Flight.count = originalCount;
  }
});
