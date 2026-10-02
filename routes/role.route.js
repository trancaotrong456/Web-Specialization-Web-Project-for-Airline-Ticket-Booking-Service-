const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { roleIdValidator } = require('../validators/role.validator');

// The report commits to role list/detail only.  Role mutation is deliberately
// out of scope and therefore has no POST, PUT, or DELETE route.
router.use(authenticate, authorize('admin'));
router.get('/', roleController.getAllRoles);
router.get('/:id', roleIdValidator, validate, roleController.getRoleById);

module.exports = router;
