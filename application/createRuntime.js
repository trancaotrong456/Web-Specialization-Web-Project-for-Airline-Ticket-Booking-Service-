const http = require('http');
const { validateRuntimeConfiguration } = require('../config/runtimeValidation');

// Importing the factory does not start any runtime provider.
function createRuntime({ app, createServer = http.createServer, initSocket, authenticate, initJob,
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
      try {
        await authenticate();
        logger.log('✅ Database connected successfully via Sequelize.');
        if (environment.DISABLE_CRON !== 'true') initJob();
        else logger.log('[Cron] Disabled by DISABLE_CRON=true');
        server.listen(port, () => {
          logger.log(`🚀 Server is running on port ${port} in ${environment.NODE_ENV || 'development'} mode.`);
          logger.log(`🔗 API Base URL: http://localhost:${port}/api/v1`);
        });
        return server;
      } catch (error) {
        logger.error('❌ Failed to connect to the database:', error);
        exit(1);
        return undefined;
      }
    })();
    return startPromise;
  }
  return { start };
}

module.exports = { createRuntime };
