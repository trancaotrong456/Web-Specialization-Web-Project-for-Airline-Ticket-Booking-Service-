const test = require('node:test');
const assert = require('node:assert/strict');
const PromotionController = require('../modules/promotion/promotion.controller');

test('Promotion controller forwards all six request shapes and preserves response messages', async () => {
  const calls = [];
  const response = { paginated: (...args) => calls.push(['paginated', ...args]), success: (...args) => calls.push(['success', ...args]), created: (...args) => calls.push(['created', ...args]) };
  const service = {
    getAll: async (value) => { calls.push(['getAll', value]); return { data: [] }; },
    getById: async (value) => { calls.push(['getById', value]); return { id: value }; },
    validateCode: async (value) => { calls.push(['validateCode', value]); return { code: value }; },
    create: async (value) => { calls.push(['create', value]); return value; },
    update: async (id, value) => { calls.push(['update', id, value]); return value; },
    delete: async (id) => { calls.push(['delete', id]); return { message: 'Promotion deleted' }; },
  };
  const controller = new PromotionController({ service, apiResponse: response });
  const res = {};
  const next = (error) => { throw error; };
  const req = { query: { page: '2' }, params: { id: '4', code: 'SAVE' }, body: { code: 'SAVE' } };
  for (const method of ['getAll', 'getById', 'validateCode', 'create', 'update', 'delete']) await controller[method](req, res, next);
  assert.deepEqual(calls, [
    ['getAll', req.query], ['paginated', res, { data: [] }],
    ['getById', '4'], ['success', res, { id: '4' }],
    ['validateCode', 'SAVE'], ['success', res, { code: 'SAVE' }, 'Promotion code is valid'],
    ['create', req.body], ['created', res, req.body, 'Promotion created'],
    ['update', '4', req.body], ['success', res, req.body, 'Promotion updated'],
    ['delete', '4'], ['success', res, { message: 'Promotion deleted' }, 'Promotion deleted'],
  ]);
});

test('Promotion controller forwards service errors to next without responding', async () => {
  const failure = new Error('failed');
  const controller = new PromotionController({ service: { validateCode: async () => { throw failure; } }, apiResponse: { success() { throw new Error('unexpected response'); } } });
  let passed;
  await controller.validateCode({ params: { code: 'X' } }, {}, (error) => { passed = error; });
  assert.equal(passed, failure);
});
