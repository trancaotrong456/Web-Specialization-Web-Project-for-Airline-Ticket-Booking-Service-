require('dotenv').config();
const { validateRuntimeConfiguration } = require('./config/runtimeValidation');

validateRuntimeConfiguration();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const { sequelize } = require('./models');
const { initExpireBookingsJob } = require('./jobs/expireBookings.job');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Start Server after verifying DB connection
const startServer = async () => {
  try {
    await sequelize.authenticate();
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
    console.error('❌ Failed to connect to the database:', error);
    process.exit(1);
  }
};

startServer();
