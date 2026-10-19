const test = require('node:test');
const assert = require('node:assert/strict');
const errorHandler = require('../middlewares/errorHandler.middleware');

const invoke = (error, env = 'test') => {
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  let statusCode;
  let body;
  process.env.NODE_ENV = env;
  console.error = () => {};
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  try {
    errorHandler(error, {}, response, () => {});
  } finally {
    console.error = originalConsoleError;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }

  return { statusCode, body };
};

test('maps Sequelize validation errors to the current 422 response contract', () => {
  const result = invoke({
    name: 'SequelizeValidationError',
    errors: [{ path: 'name', message: 'name is required', value: '' }],
  });

  assert.equal(result.statusCode, 422);
  assert.deepEqual(result.body, {
    success: false,
    message: 'Validation Error',
    errors: [{ field: 'name', message: 'name is required', value: '' }],
  });
});

test('maps Sequelize unique constraint errors to the current 409 response contract', () => {
  const result = invoke({
    name: 'SequelizeUniqueConstraintError',
    errors: [{ path: 'iata_code', value: 'VN' }],
  });

  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, {
    success: false,
    message: 'Duplicate entry error',
    errors: [{ field: 'iata_code', message: 'iata_code already exists', value: 'VN' }],
  });
});

test('maps Sequelize foreign-key errors to HTTP 400', () => {
  const result = invoke({ name: 'SequelizeForeignKeyConstraintError' });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, {
    success: false,
    message: 'Invalid referenced resource ID',
  });
});

test('preserves custom status, message, and optional errors', () => {
  const result = invoke({ statusCode: 404, message: 'Airline not found', errors: null });
  assert.equal(result.statusCode, 404);
  assert.deepEqual(result.body, { success: false, message: 'Airline not found' });
});

test('uses the current environment-sensitive fallback error message', () => {
  const error = new Error('diagnostic detail');
  const development = invoke(error, 'development');
  const production = invoke(error, 'production');

  assert.equal(development.statusCode, 500);
  assert.deepEqual(development.body, { success: false, message: 'diagnostic detail' });
  assert.equal(production.statusCode, 500);
  assert.deepEqual(production.body, { success: false, message: 'Internal server error' });
});
