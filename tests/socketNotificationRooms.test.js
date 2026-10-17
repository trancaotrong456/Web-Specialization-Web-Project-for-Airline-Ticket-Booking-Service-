'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Socket.IO assigns notification room only from authenticated server identity', () => {
  const { initSocket } = require('../sockets');
  let connection;
  let authMiddleware;
  class FakeServer {
    constructor() { this.rooms = []; }
    use(middleware) { authMiddleware = middleware; }
    on(event, handler) { if (event === 'connection') connection = handler; }
  }
  initSocket({}, { ServerClass: FakeServer, authenticateSocket(_socket, next) { next(); } });
  const listeners = {};
  const socket = {
    id: 'socket-1', data: { authenticatedUserId: '501' },
    join(room) { this.rooms.push(room); }, leave() {},
    on(event, handler) { listeners[event] = handler; },
    rooms: [],
  };
  connection(socket);
  assert.equal(typeof authMiddleware, 'function');
  assert.deepEqual(socket.rooms, ['user:501']);
  assert.equal(Object.hasOwn(listeners, 'join_user'), false);
  assert.equal(Object.hasOwn(listeners, 'join_notification'), false);
  assert.equal(Object.hasOwn(listeners, 'join_flight'), true);
});
