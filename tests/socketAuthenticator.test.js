'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSocketAuthenticator } = require('../sockets/socketAuthenticator');

test('unauthenticated sockets remain guests and cannot receive an authenticated user identity', async () => {
  const authenticate = createSocketAuthenticator({ verifyAccessToken: () => { throw new Error('unused'); }, findUser: async () => null });
  const socket = { handshake: { auth: {}, headers: {} }, data: {} };
  let error = 'not called';
  await authenticate(socket, (value) => { error = value; });
  assert.equal(error, undefined);
  assert.equal(socket.data.authenticatedUserId, undefined);
});

test('valid access token resolves the authenticated user id server-side', async () => {
  const authenticate = createSocketAuthenticator({ verifyAccessToken: (token) => ({ id: token === 'valid' ? 22 : null }), findUser: async (id) => ({ id, status: 'active' }) });
  const socket = { handshake: { auth: { accessToken: 'valid' }, headers: {} }, data: {} };
  await authenticate(socket, (error) => assert.equal(error, undefined));
  assert.equal(socket.data.authenticatedUserId, '22');
});

test('invalid tokens and locked users are denied without exposing identity', async () => {
  const authenticate = createSocketAuthenticator({ verifyAccessToken: (token) => { if (token !== 'valid') throw new Error('invalid'); return { id: 22 }; }, findUser: async () => ({ id: 22, status: 'locked' }) });
  for (const token of ['invalid', 'valid']) {
    const socket = { handshake: { auth: { accessToken: token }, headers: {} }, data: {} };
    await authenticate(socket, (error) => assert.equal(error.message, 'Unauthorized'));
    assert.equal(socket.data.authenticatedUserId, undefined);
  }
});
