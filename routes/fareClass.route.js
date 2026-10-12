const express = require('express');
const router = express.Router();
const c = require('../controllers/fareClass.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  createFareClassValidator,
  updateFareClassValidator,
  fareClassIdParamValidator,
  flightIdParamValidator,
} = require('../validators/fareClass.validator');

// Public: Get fare classes for a flight
router.get('/flight/:flightId', flightIdParamValidator, validate, c.getByFlight);
router.get('/:id', fareClassIdParamValidator, validate, c.getById);

// Admin/Staff: Create and update
router.post('/', authenticate, authorize('admin', 'staff'), createFareClassValidator, validate, c.create);
router.put('/:id', authenticate, authorize('admin', 'staff'), fareClassIdParamValidator, updateFareClassValidator, validate, c.update);

// Admin: Delete
router.delete('/:id', authenticate, authorize('admin'), fareClassIdParamValidator, validate, c.delete);

module.exports = router;
