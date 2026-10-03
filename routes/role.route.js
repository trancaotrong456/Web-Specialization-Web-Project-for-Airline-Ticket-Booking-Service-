const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { roleIdValidator } = require('../validators/role.validator');

// Role metadata is read-only in the implemented project scope.
router.use(authenticate, authorize('admin'));
router.get('/', roleController.getAllRoles);
router.get('/:id', roleIdValidator, validate, roleController.getRoleById);

module.exports = router;
