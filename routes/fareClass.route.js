const express = require('express');
const router = express.Router();
const c = require('../controllers/fareClass.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');

// Public: Get fare classes for a flight
router.get('/flight/:flightId', c.getByFlight);
router.get('/:id', c.getById);

// Admin: CRUD
router.post('/', authenticate, authorize('admin', 'staff'), c.create);
router.put('/:id', authenticate, authorize('admin', 'staff'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.delete);

module.exports = router;
