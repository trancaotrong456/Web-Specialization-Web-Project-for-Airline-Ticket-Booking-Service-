const test = require('node:test');
const assert = require('node:assert/strict');
const AirportService = require('../modules/airport/airport.service');

test('Airport service preserves default/query values and returns raw page and limit values', async () => {
  const calls = [];
  const rows = [{ id: 1 }];
  const service = new AirportService({
    repository: { findPage: async (query) => { calls.push(query); return { count: 1, rows }; } },
  });

  assert.deepEqual(await service.getAll(), { total: 1, page: 1, limit: 20, data: rows });
  assert.deepEqual(await service.getAll({ page: '2', limit: '7', search: ' HAN ' }), {
    total: 1, page: '2', limit: '7', data: rows,
  });
  assert.deepEqual(calls, [
    { page: 1, limit: 20, search: undefined },
    { page: '2', limit: '7', search: ' HAN ' },
  ]);
});

test('Airport service keeps not-found, pass-through create/update, and delete semantics', async () => {
  const calls = [];
  const airport = { id: 4 };
  const service = new AirportService({
    repository: {
      findById: async (id) => { calls.push(['findById', id]); return id === 'missing' ? null : airport; },
      create: async (data) => { calls.push(['create', data]); return data; },
      update: async (instance, data) => { calls.push(['update', instance, data]); return { ...instance, ...data }; },
      delete: async (instance) => { calls.push(['delete', instance]); },
    },
  });

  const input = { name: '  No normalization  ', iata_code: 'x' };
  assert.equal(await service.create(input), input);
  assert.deepEqual(await service.update('4', input), { id: 4, ...input });
  assert.deepEqual(await service.delete('4'), { message: 'Airport deleted' });
  await assert.rejects(service.getById('missing'), (error) => error.statusCode === 404 && error.message === 'Airport not found');
  assert.deepEqual(calls, [
    ['create', input],
    ['findById', '4'], ['update', airport, input],
    ['findById', '4'], ['delete', airport],
    ['findById', 'missing'],
  ]);
});
