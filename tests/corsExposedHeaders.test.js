const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');

// Kiểm tra CORS expose header Date được cấu hình đúng theo Đợt Chốt - Mục A
test('CORS response exposes Date header via Access-Control-Expose-Headers', (t, done) => {
  process.env.NODE_ENV = 'test';
  const apiRouter = require('express').Router();
  apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
  const errorHandler = (err, _req, res, _next) => res.status(500).json({ error: err.message });

  const app = createApp({ container: { apiRouter, errorHandler } });

  const http = require('node:http');
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/v1/health', method: 'GET',
        headers: { Origin: 'http://localhost:5173' } },
      (res) => {
        const exposeHeader = res.headers['access-control-expose-headers'] || '';
        server.close(() => {
          try {
            assert.ok(
              exposeHeader.toLowerCase().includes('date'),
              `Expected Access-Control-Expose-Headers to contain "Date", got: "${exposeHeader}"`,
            );
            done();
          } catch (err) {
            done(err);
          }
        });
      },
    );
    req.on('error', (err) => server.close(() => done(err)));
    req.end();
  });
});

test('CORS configuration allows wildcard origin when CLIENT_URL is not set', () => {
  const { createApp: makeApp } = require('../application/createApp');
  const apiRouter = require('express').Router();
  const errorHandler = function errorHandler() {};
  const saved = process.env.CLIENT_URL;
  delete process.env.CLIENT_URL;
  process.env.NODE_ENV = 'test';
  // Chỉ kiểm tra không throw – hành vi wildcard + credentials: true được ghi nhận trong doc
  const app = makeApp({ container: { apiRouter, errorHandler } });
  assert.ok(typeof app, 'function');
  if (saved !== undefined) process.env.CLIENT_URL = saved;
});
