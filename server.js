require('dotenv').config();

const validateProductionSecrets = () => {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'VNP_HASH_SECRET', 'MOMO_SECRET_KEY'];
  const missingSecrets = requiredSecrets.filter((name) => !process.env[name] || !process.env[name].trim());

  if (missingSecrets.length > 0) {
    throw new Error(`Missing required production secrets: ${missingSecrets.join(', ')}`);
  }
};

validateProductionSecrets();
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
    initExpireBookingsJob();

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
