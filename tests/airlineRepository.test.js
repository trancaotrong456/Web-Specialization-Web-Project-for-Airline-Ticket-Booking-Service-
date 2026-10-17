const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeAirlineRepository } = require('../modules/airline/airline.repository');

const attributes = ['id', 'name', 'iata_code', 'logo_url', 'created_at', 'updated_at'];

test('Airline repository preserves list filters, pagination, ordering, and selected fields', async () => {
  const like = Symbol('like');
  const or = Symbol('or');
  const calls = [];
  const rows = [{ id: 1, name: 'Sky Ways' }];
  const repository = new SequelizeAirlineRepository({
    Airline: { findAndCountAll: async (options) => { calls.push(options); return { count: 1, rows }; } },
    Flight: {},
    Op: { like, or },
  });

  assert.deepEqual(await repository.findPage({ page: 3, limit: 10, search: 'sky' }), { count: 1, rows });
  assert.deepEqual(calls[0], {
    where: {
      [or]: [
        { name: { [like]: '%sky%' } },
        { iata_code: { [like]: '%sky%' } },
      ],
    },
    limit: 10,
    offset: 20,
    order: [['name', 'ASC']],
    attributes,
  });
  assert.deepEqual(await repository.findPage({ page: 1, limit: 20 }), { count: 1, rows });
  assert.deepEqual(calls[1].where, {});
});

test('Airline repository preserves detail and duplicate-lookup Sequelize options', async () => {
  const ne = Symbol('ne');
  const airline = { id: 2 };
  const calls = {};
  const repository = new SequelizeAirlineRepository({
    Airline: {
      findByPk: async (...args) => { calls.byPk = args; return airline; },
      findOne: async (...args) => { calls.findOne = args; return airline; },
    },
    Flight: {},
    Op: { ne },
  });

  assert.equal(await repository.findById('2'), airline);
  assert.deepEqual(calls.byPk, ['2', { attributes }]);
  assert.equal(await repository.findByIataCode('VN'), airline);
  assert.deepEqual(calls.findOne, [{ where: { iata_code: 'VN' } }]);
  assert.equal(await repository.findByIataCode('VN', { excludeId: '2' }), airline);
  assert.deepEqual(calls.findOne[0], { where: { iata_code: 'VN', id: { [ne]: '2' } } });
});

test('Airline repository delegates create, update, flight count, and delete without opening transactions', async () => {
  const calls = [];
  const instance = {
    async update(values) { calls.push(['update', values]); return this; },
    async destroy() { calls.push(['destroy']); },
  };
  const repository = new SequelizeAirlineRepository({
    Airline: { create: async (values) => { calls.push(['create', values]); return instance; } },
    Flight: { count: async (options) => { calls.push(['count', options]); return 4; } },
    Op: {},
  });

  assert.equal(await repository.create({ name: 'Name' }), instance);
  assert.equal(await repository.update(instance, { name: 'Updated' }), instance);
  assert.equal(await repository.countFlightsByAirlineId('2'), 4);
  await repository.delete(instance);
  assert.deepEqual(calls, [
    ['create', { name: 'Name' }],
    ['update', { name: 'Updated' }],
    ['count', { where: { airline_id: '2' } }],
    ['destroy'],
  ]);
});
