const { Server } = require('socket.io');
const { createSocketAuthenticator } = require('./socketAuthenticator');

let io = null;

const initSocket = (server, { authenticateSocket, ServerClass = Server } = {}) => {
  io = new ServerClass(server, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const socketAuthenticator = authenticateSocket || createSocketAuthenticator({
    verifyAccessToken: require('../utils/jwt.util').verifyAccessToken,
    findUser: async (id) => require('../models').User.findByPk(id, { attributes: ['id', 'status'] }),
  });
  io.use(socketAuthenticator);

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    if (socket.data.authenticatedUserId) socket.join(`user:${socket.data.authenticatedUserId}`);

    // Join room for a specific flight
    socket.on('join_flight', (flightId) => {
      const room = `flight_${flightId}`;
      socket.join(room);
      console.log(`[Socket.io] Socket ${socket.id} joined ${room}`);
    });

    // Leave room for a specific flight
    socket.on('leave_flight', (flightId) => {
      const room = `flight_${flightId}`;
      socket.leave(room);
      console.log(`[Socket.io] Socket ${socket.id} left ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
};
