const express = require('express');
const router = express.Router();
const c = require('../controllers/airline.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  airlineIdValidator,
  listAirlineValidator,
  createAirlineValidator,
  updateAirlineValidator,
} = require('../validators/airline.validator');

router.get('/', listAirlineValidator, validate, c.getAll);
router.get('/:id', airlineIdValidator, validate, c.getById);
router.post('/', authenticate, authorize('admin'), createAirlineValidator, validate, c.create);
router.put('/:id', authenticate, authorize('admin'), updateAirlineValidator, validate, c.update);
router.delete('/:id', authenticate, authorize('admin'), airlineIdValidator, validate, c.delete);

module.exports = router;
