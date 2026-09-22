const express = require('express');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Mount all feature routes
router.use('/auth',        require('./auth.route'));
router.use('/users',       require('./user.route'));
router.use('/airlines',    require('./airline.route'));
router.use('/airports',    require('./airport.route'));
router.use('/flights',     require('./flight.route'));
router.use('/fare-classes', require('./fareClass.route'));
router.use('/bookings',    require('./booking.route'));
router.use('/payments',    require('./payment.route'));
router.use('/promotions',  require('./promotion.route'));

module.exports = router;
