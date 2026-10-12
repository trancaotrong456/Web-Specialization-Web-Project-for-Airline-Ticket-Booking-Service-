const express = require('express');
const router = express.Router();
const c = require('../controllers/airport.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  airportIdValidator,
  listAirportValidator,
  createAirportValidator,
  updateAirportValidator,
} = require('../validators/airport.validator');

router.get('/', listAirportValidator, validate, c.getAll);
router.get('/:id', airportIdValidator, validate, c.getById);
router.post('/', authenticate, authorize('admin'), createAirportValidator, validate, c.create);
router.put('/:id', authenticate, authorize('admin'), updateAirportValidator, validate, c.update);
router.delete('/:id', authenticate, authorize('admin'), airportIdValidator, validate, c.delete);

module.exports = router;
