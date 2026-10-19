const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeAirportRepository } = require('../modules/airport/airport.repository');

test('Airport repository preserves search fields, pagination types, and city ordering', async () => {
  const like = Symbol('like');
  const or = Symbol('or');
  const calls = [];
  const result = { count: 3, rows: [{ id: 1 }] };
  const repository = new SequelizeAirportRepository({
    Airport: { findAndCountAll: async (options) => { calls.push(options); return result; } },
    Op: { like, or },
  });

  assert.equal(await repository.findPage({ page: '2', limit: '7', search: ' HAN ' }), result);
  assert.deepEqual(calls[0], {
    where: {
      [or]: [
        { name: { [like]: '% HAN %' } },
        { iata_code: { [like]: '% HAN %' } },
        { city: { [like]: '% HAN %' } },
      ],
    },
    limit: 7,
    offset: 7,
    order: [['city', 'ASC']],
  });
  await repository.findPage({ page: 1, limit: 20, search: '' });
  assert.deepEqual(calls[1], { where: {}, limit: 20, offset: 0, order: [['city', 'ASC']] });
});

test('Airport repository delegates detail and writes to the existing Sequelize instances', async () => {
  const calls = [];
  const airport = {
    async update(data) { calls.push(['update', data]); return this; },
    async destroy() { calls.push(['destroy']); },
  };
  const repository = new SequelizeAirportRepository({
    Airport: {
      findByPk: async (id, options) => { calls.push(['findByPk', id, options]); return airport; },
      create: async (data) => { calls.push(['create', data]); return airport; },
    },
    Op: {},
  });

  assert.equal(await repository.findById('9'), airport);
  assert.equal(await repository.create({ name: 'Raw Name' }), airport);
  assert.equal(await repository.update(airport, { city: 'Raw City' }), airport);
  await repository.delete(airport);
  assert.deepEqual(calls, [
    ['findByPk', '9', undefined],
    ['create', { name: 'Raw Name' }],
    ['update', { city: 'Raw City' }],
    ['destroy'],
  ]);
});
