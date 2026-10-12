require('dotenv').config();
const { validateRuntimeConfiguration } = require('./config/runtimeValidation');

validateRuntimeConfiguration();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const { sequelize } = require('./models');
const { initExpireBookingsJob } = require('./jobs/expireBookings.job');
const { assertBootstrapReady } = require('./utils/demoBootstrap');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Start Server after verifying DB connection
const startServer = async () => {
  try {
    await sequelize.authenticate();
    if (process.env.DEMO_BOOTSTRAP_REQUIRED === 'true') {
      const [rows] = await sequelize.query('SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only');
      assertBootstrapReady({ env: process.env, databaseRow: rows?.[0] });
      console.log('[Demo] Local bootstrap state and MySQL identity verified.');
    }
    console.log('✅ Database connected successfully via Sequelize.');

    // Initialize scheduled cron jobs
    if (process.env.DISABLE_CRON !== 'true') {
      initExpireBookingsJob();
    } else {
      console.log('[Cron] Disabled by DISABLE_CRON=true');
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('❌ Server startup failed (database or demo-bootstrap readiness):', error.message || error);
    process.exit(1);
  }
};

startServer();
