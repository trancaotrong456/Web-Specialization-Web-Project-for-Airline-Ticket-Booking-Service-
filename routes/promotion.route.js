const express = require('express');
const router = express.Router();
const c = require('../controllers/promotion.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');

// Public: List active promotions, validate code
router.get('/', c.getAll);
router.get('/validate/:code', c.validateCode);
router.get('/:id', c.getById);

// Admin only: Write operations
router.post('/', authenticate, authorize('admin'), c.create);
router.put('/:id', authenticate, authorize('admin'), c.update);
router.delete('/:id', authenticate, authorize('admin'), c.delete);

module.exports = router;
