require('dotenv').config();
const { validateRuntimeConfiguration } = require('./config/runtimeValidation');

validateRuntimeConfiguration();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const { sequelize } = require('./models');
const { initExpireBookingsJob } = require('./jobs/expireBookings.job');

const { createRuntime } = require('./application/createRuntime');

createRuntime({
  app,
  createServer: http.createServer,
  initSocket,
  authenticate: () => sequelize.authenticate(),
  initJob: initExpireBookingsJob,
  // Entry-point validation intentionally precedes loading app/models.
  validate: () => {},
}).start();
