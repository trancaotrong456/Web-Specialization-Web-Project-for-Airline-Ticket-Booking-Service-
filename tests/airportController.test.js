const test = require('node:test');
const assert = require('node:assert/strict');
const AirportController = require('../modules/airport/airport.controller');

test('Airport controller calls injected service and preserves ApiResponse methods/messages', async () => {
  const calls = [];
  const service = Object.fromEntries(['getAll', 'getById', 'create', 'update', 'delete'].map((name) => [
    name,
    async (...args) => { calls.push([name, ...args]); return { name }; },
  ]));
  const response = Object.fromEntries(['paginated', 'success', 'created'].map((name) => [
    name,
    (...args) => { calls.push([`response.${name}`, ...args]); return name; },
  ]));
  const controller = new AirportController({ service, apiResponse: response });
  const req = { query: { page: '3' }, params: { id: '8' }, body: { city: 'Hanoi' } };
  const res = {};
  const next = (error) => { throw error; };

  assert.equal(await controller.getAll(req, res, next), 'paginated');
  assert.equal(await controller.getById(req, res, next), 'success');
  assert.equal(await controller.create(req, res, next), 'created');
  assert.equal(await controller.update(req, res, next), 'success');
  assert.equal(await controller.delete(req, res, next), 'success');
  assert.deepEqual(calls.filter(([name]) => !name.startsWith('response.')).map((entry) => entry.slice(0, 2)), [
    ['getAll', req.query], ['getById', '8'], ['create', req.body], ['update', '8'], ['delete', '8'],
  ]);
  const responseCalls = calls.filter(([name]) => name.startsWith('response.'));
  assert.deepEqual(responseCalls.map(([name]) => name), [
    'response.paginated', 'response.success', 'response.created', 'response.success', 'response.success',
  ]);
  assert.deepEqual(responseCalls.map(([, responseRes]) => responseRes), [res, res, res, res, res]);
  assert.deepEqual(responseCalls.map(([, , data]) => data), [
    { name: 'getAll' }, { name: 'getById' }, { name: 'create' }, { name: 'update' }, { name: 'delete' },
  ]);
  assert.deepEqual(responseCalls.map(([, , , message]) => message), [
    undefined, undefined, 'Airport created', 'Airport updated', 'Airport deleted',
  ]);
});

test('Airport controller forwards service errors to Express next', async () => {
  const expected = new Error('failure');
  let received;
  const controller = new AirportController({ service: { getById: async () => { throw expected; } } });
  await controller.getById({ params: { id: '1' } }, {}, (error) => { received = error; });
  assert.equal(received, expected);
});
