require('dotenv').config();
const { validateRuntimeConfiguration } = require('./config/runtimeValidation');

validateRuntimeConfiguration();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const { sequelize } = require('./models');
const { initExpireBookingsJob } = require('./jobs/expireBookings.job');
const { assertBootstrapReady } = require('./utils/demoBootstrap');
const { createRuntime } = require('./application/createRuntime');
const { createDemoBootstrapReadiness } = require('./infrastructure/demoBootstrapReadiness');

createRuntime({
  app,
  createServer: http.createServer,
  initSocket,
  authenticate: () => sequelize.authenticate(),
  verifyReadiness: createDemoBootstrapReadiness({ sequelize, assertBootstrapReady }),
  initJob: initExpireBookingsJob,
  // Entry-point validation intentionally precedes loading app/models.
  validate: () => {},
}).start();
