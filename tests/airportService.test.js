const test = require('node:test');
const assert = require('node:assert/strict');
const airportService = require('../services/airport.service');
const { Airport, Flight } = require('../models');

const expectedAttributes = [
  'id',
  'iata_code',
  'name',
  'city',
  'country',
  'created_at',
  'updated_at',
];

test('airport list uses the documented fields, search filtering, and pagination', async () => {
  const originalFindAndCountAll = Airport.findAndCountAll;
  let receivedOptions;
  const rows = [
    { id: 1, name: 'Tân Sơn Nhất', iata_code: 'SGN', city: 'TP Hồ Chí Minh' },
    { id: 2, name: 'Nội Bài', iata_code: 'HAN', city: 'Hà Nội' },
  ];
  Airport.findAndCountAll = async (options) => {
    receivedOptions = options;
    return { count: 2, rows };
  };

  try {
    const result = await airportService.getAll({ page: 1, limit: 10, search: 'hanoi' });
    assert.deepEqual(result, {
      total: 2,
      page: 1,
      limit: 10,
      data: rows,
    });
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
    assert.deepEqual(receivedOptions.order, [['city', 'ASC'], ['name', 'ASC']]);
    assert.equal(receivedOptions.limit, 10);
    assert.equal(receivedOptions.offset, 0);
    assert.ok(receivedOptions.where);
  } finally {
    Airport.findAndCountAll = originalFindAndCountAll;
  }
});

test('airport detail returns documented attributes', async () => {
  const originalFindByPk = Airport.findByPk;
  let receivedId;
  let receivedOptions;
  const airport = { id: 1, name: 'Đà Nẵng', iata_code: 'DAD', city: 'Đà Nẵng' };
  Airport.findByPk = async (id, options) => {
    receivedId = id;
    receivedOptions = options;
    return airport;
  };

  try {
    const result = await airportService.getById(1);
    assert.equal(result, airport);
    assert.equal(receivedId, 1);
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
  } finally {
    Airport.findByPk = originalFindByPk;
  }
});

test('airport detail reports a missing airport as 404', async () => {
  const originalFindByPk = Airport.findByPk;
  Airport.findByPk = async () => null;

  try {
    await assert.rejects(
      airportService.getById(999),
      (error) => error.statusCode === 404 && error.message === 'Airport not found',
    );
  } finally {
    Airport.findByPk = originalFindByPk;
  }
});

test('airport creation normalizes data and rejects duplicates with 409', async () => {
  const originalFindOne = Airport.findOne;
  const originalCreate = Airport.create;
  const originalFindByPk = Airport.findByPk;
  let createdValues;
  Airport.findOne = async () => null;
  Airport.create = async (values) => {
    createdValues = values;
    return { id: 10, ...values };
  };
  Airport.findByPk = async (id) => ({ id, ...createdValues });

  try {
    const result = await airportService.create({
      iata_code: ' sgn ',
      name: ' Tân Sơn Nhất ',
      city: ' TP Hồ Chí Minh ',
      country: ' Việt Nam ',
    });

    assert.equal(result.id, 10);
    assert.deepEqual(createdValues, {
      iata_code: 'SGN',
      name: 'Tân Sơn Nhất',
      city: 'TP Hồ Chí Minh',
      country: 'Việt Nam',
    });

    // Test duplicate check
    Airport.findOne = async () => ({ id: 1, iata_code: 'SGN' });
    await assert.rejects(
      airportService.create({ name: 'SGN Dup', iata_code: 'SGN', city: 'HCM' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airport.findOne = originalFindOne;
    Airport.create = originalCreate;
    Airport.findByPk = originalFindByPk;
  }
});

test('airport creation maps concurrent unique constraint violation to HTTP 409', async () => {
  const originalFindOne = Airport.findOne;
  const originalCreate = Airport.create;
  Airport.findOne = async () => null;
  Airport.create = async () => {
    const error = new Error('Duplicate entry');
    error.name = 'SequelizeUniqueConstraintError';
    throw error;
  };

  try {
    await assert.rejects(
      airportService.create({ name: 'Cam Ranh', iata_code: 'CXR', city: 'Nha Trang' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airport.findOne = originalFindOne;
    Airport.create = originalCreate;
  }
});

test('airport creation rejects prohibited mass assignment fields with HTTP 400', async () => {
  await assert.rejects(
    airportService.create({ id: 10, name: 'Forbidden', iata_code: 'FBD', city: 'City' }),
    (error) => error.statusCode === 400 && error.message.includes('cannot be modified'),
  );

  await assert.rejects(
    airportService.create({ created_at: new Date(), name: 'Forbidden', iata_code: 'FBD', city: 'City' }),
    (error) => error.statusCode === 400 && error.message.includes('cannot be modified'),
  );
});

test('airport update changes allowed fields and rejects duplicate IATA code on other airports', async () => {
  const originalFindByPk = Airport.findByPk;
  const originalFindOne = Airport.findOne;
  let updatedValues;
  const airport = {
    id: 1,
    name: 'Old Airport',
    iata_code: 'HAN',
    city: 'Hanoi',
    country: 'Vietnam',
    async update(values) {
      updatedValues = values;
      Object.assign(this, values);
    },
  };
  Airport.findByPk = async () => airport;
  Airport.findOne = async () => null;

  try {
    const result = await airportService.update(1, {
      name: 'Noi Bai International Airport',
      iata_code: 'han',
      city: 'Ha Noi Capital',
    });

    assert.equal(result, airport);
    assert.deepEqual(updatedValues, {
      name: 'Noi Bai International Airport',
      iata_code: 'HAN',
      city: 'Ha Noi Capital',
    });

    // Conflict with another airport
    Airport.findOne = async () => ({ id: 2, iata_code: 'SGN' });
    await assert.rejects(
      airportService.update(1, { iata_code: 'SGN' }),
      (error) => error.statusCode === 409 && error.message.includes('already exists'),
    );
  } finally {
    Airport.findByPk = originalFindByPk;
    Airport.findOne = originalFindOne;
  }
});

test('airport update rejects prohibited mass assignment fields with HTTP 400', async () => {
  await assert.rejects(
    airportService.update(1, { id: 99, name: 'Changed' }),
    (error) => error.statusCode === 400 && error.message.includes('cannot be modified'),
  );

  await assert.rejects(
    airportService.update(1, { updated_at: new Date() }),
    (error) => error.statusCode === 400 && error.message.includes('cannot be modified'),
  );
});

test('airport deletion is blocked if flights are assigned with HTTP 409', async () => {
  const originalFindByPk = Airport.findByPk;
  const originalCount = Flight.count;
  let destroyed = false;
  Airport.findByPk = async () => ({
    id: 1,
    async destroy() { destroyed = true; },
  });
  Flight.count = async () => 3;

  try {
    await assert.rejects(
      airportService.delete(1),
      (error) => error.statusCode === 409 && error.message.includes('existing flights'),
    );
    assert.equal(destroyed, false);
  } finally {
    Airport.findByPk = originalFindByPk;
    Flight.count = originalCount;
  }
});

test('airport deletion succeeds when no flights are assigned', async () => {
  const originalFindByPk = Airport.findByPk;
  const originalCount = Flight.count;
  let destroyed = false;
  Airport.findByPk = async () => ({
    id: 99,
    async destroy() { destroyed = true; },
  });
  Flight.count = async () => 0;

  try {
    const result = await airportService.delete(99);
    assert.deepEqual(result, { id: 99, message: 'Airport deleted' });
    assert.equal(destroyed, true);
  } finally {
    Airport.findByPk = originalFindByPk;
    Flight.count = originalCount;
  }
});

test('airport deletion maps foreign key constraint error to HTTP 400', async () => {
  const originalFindByPk = Airport.findByPk;
  const originalCount = Flight.count;
  Airport.findByPk = async () => ({
    id: 50,
    async destroy() {
      const err = new Error('foreign key constraint fail');
      err.name = 'SequelizeForeignKeyConstraintError';
      throw err;
    },
  });
  Flight.count = async () => 0;

  try {
    await assert.rejects(
      airportService.delete(50),
      (error) => error.statusCode === 400 && error.message.includes('Invalid referenced resource ID'),
    );
  } finally {
    Airport.findByPk = originalFindByPk;
    Flight.count = originalCount;
  }
});

