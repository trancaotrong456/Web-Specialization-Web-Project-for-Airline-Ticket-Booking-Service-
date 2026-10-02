require('dotenv').config();

const validateProductionSecrets = () => {
  const payosMode = (process.env.PAYOS_MODE || 'disabled').toLowerCase();
  const allowedPayosModes = ['disabled', 'demo', 'live'];

  if (!allowedPayosModes.includes(payosMode)) {
    throw new Error(`Invalid PAYOS_MODE '${payosMode}'. Expected disabled, demo, or live.`);
  }

  if (process.env.NODE_ENV === 'production' && payosMode === 'demo') {
    throw new Error('PAYOS_MODE=demo is forbidden in production. Use disabled or live.');
  }

  if (process.env.NODE_ENV !== 'production') return;

  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'VNP_HASH_SECRET'];
  if (payosMode === 'live') {
    requiredSecrets.push('PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY');
  }
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
