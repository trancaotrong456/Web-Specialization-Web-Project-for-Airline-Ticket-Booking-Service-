const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flight.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  searchFlightValidator,
  createFlightValidator,
  updateFlightValidator,
} = require('../validators/flight.validator');

// Public: Search available flights
router.get('/search', searchFlightValidator, validate, flightController.searchFlights);

// Public: Get flight details by ID
router.get('/:id', flightController.getFlightById);

// Admin/Staff: Get all flights (including cancelled)
router.get('/', authenticate, authorize('admin', 'staff'), flightController.getAllFlights);

// Admin: Create flight
router.post('/', authenticate, authorize('admin'), createFlightValidator, validate, flightController.createFlight);

// Admin/Staff: Update flight
router.put('/:id', authenticate, authorize('admin', 'staff'), updateFlightValidator, validate, flightController.updateFlight);

// Admin/Staff: Cancel flight
router.put('/:id/cancel', authenticate, authorize('admin', 'staff'), flightController.cancelFlight);

// Admin: Permanently delete a flight only if it has no booking history
router.delete('/:id', authenticate, authorize('admin'), flightController.deleteFlight);

module.exports = router;
