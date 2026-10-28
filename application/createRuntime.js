const http = require('http');
const { validateRuntimeConfiguration } = require('../config/runtimeValidation');

// Importing the factory does not start any runtime provider.
function createRuntime({ app, createServer = http.createServer, initSocket, authenticate, verifyReadiness = async () => {}, initJob,
  validate = validateRuntimeConfiguration, environment = process.env, logger = console, exit = process.exit } = {}) {
  if (!app || !initSocket || !authenticate || !initJob) throw new TypeError('Runtime providers are required');
  let startPromise;
  function start() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      validate(environment);
      const port = environment.PORT || 5000;
      const server = createServer(app);
      initSocket(server);
      let startupPhase = 'database';
      try {
        await authenticate();
        startupPhase = 'bootstrap';
        await verifyReadiness(environment);
        startupPhase = 'runtime';
        logger.log('✅ Database connected successfully via Sequelize.');
        let jobControl = null;
        if (environment.DISABLE_CRON !== 'true') jobControl = initJob();
        else logger.log('[Cron] Disabled by DISABLE_CRON=true');
        server.listen(port, () => {
          logger.log(`🚀 Server is running on port ${port} in ${environment.NODE_ENV || 'development'} mode.`);
          logger.log(`🔗 API Base URL: http://localhost:${port}/api/v1`);
        });
        const shutdown = async (timeoutMs = Number(environment.SHUTDOWN_TIMEOUT_MS || 30000)) => {
          if (jobControl && typeof jobControl.stop === 'function') await jobControl.stop(timeoutMs);
          await new Promise((resolve) => server.close(() => resolve()));
        };
        server.shutdown = shutdown;
        return server;
      } catch (error) {
        if (startupPhase === 'bootstrap') {
          logger.error('❌ Server startup failed (database or demo-bootstrap readiness):', error.message || error);
        } else {
          logger.error('❌ Failed to connect to the database:', error);
        }
        exit(1);
        return undefined;
      }
    })();
    return startPromise;
  }
  return { start };
}

module.exports = { createRuntime };
