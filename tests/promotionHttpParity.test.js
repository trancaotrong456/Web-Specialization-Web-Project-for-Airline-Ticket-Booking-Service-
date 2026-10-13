const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const { createPromotionModule } = require('../modules/promotion');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const ApiResponse = require('../utils/apiResponse');

test('Promotion HTTP routes preserve public reads, validation precedence, Admin writes and errors', async () => {
  const existing = { id: 9, code: 'SAVE', valid_from: '2026-10-13T00:00:00.000Z', valid_to: '2026-10-15T00:00:00.000Z', max_uses: null, used_count: 0 };
  const calls = [];
  const repository = {
    async findPage() { return { count: 1, rows: [existing] }; },
    async findById(id) { return id === '404' ? null : existing; },
    async findByCode(code) { calls.push(['code', code]); return code === 'MISSING' ? null : existing; },
    async create(data) { calls.push(['create', data]); return { ...data, id: 10 }; },
    async update(_instance, data) { calls.push(['update', data]); return { ...existing, ...data }; },
    async delete() { calls.push(['delete']); },
  };
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { role: { name: role } };
    next();
  };
  const module = createPromotionModule({ repository, guards: { authenticate, authorize }, now: () => new Date('2026-10-13T12:00:00.000Z') });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/promotions', module.router);
  app.use(createErrorHandlerAdapter({ filter: createErrorFilter(), apiResponse: ApiResponse, logger: { error() {} } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/promotions`;
  try {
    const list = await fetch(`${url}?page=2&limit=10`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { success: true, message: 'Success', data: [existing], pagination: { total: 1, page: 2, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: true } });
    const valid = await fetch(`${url}/validate/SAVE`);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).message, 'Promotion code is valid');
    assert.deepEqual(calls[0], ['code', 'SAVE']);
    const missingCode = await fetch(`${url}/validate/MISSING`);
    assert.equal(missingCode.status, 404);
    assert.deepEqual(await missingCode.json(), { success: false, message: 'Promotion code not found' });
    assert.equal((await fetch(`${url}/404`)).status, 404);
    const unauth = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauth.status, 401);
    const staff = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'staff' }, body: '{}' });
    assert.equal(staff.status, 403);
    const adminHeaders = { 'Content-Type': 'application/json', 'x-test-role': 'admin' };
    const created = await fetch(url, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: 'NEW' }) });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).message, 'Promotion created');
    const updated = await fetch(`${url}/9`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ code: 'UPDATED' }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).message, 'Promotion updated');
    const deleted = await fetch(`${url}/9`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).message, 'Promotion deleted');
    assert.deepEqual(calls.slice(2), [['create', { code: 'NEW' }], ['update', { code: 'UPDATED' }], ['delete']]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
