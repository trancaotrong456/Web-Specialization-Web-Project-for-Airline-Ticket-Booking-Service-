const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  userListValidator,
  userIdValidator,
  updateUserStatusValidator,
  updateUserRoleValidator,
} = require('../validators/user.validator');

// All routes require admin
router.use(authenticate, authorize('admin'));

router.get('/', userListValidator, validate, userController.getAllUsers);
router.get('/:id', userIdValidator, validate, userController.getUserById);
router.put('/:id/status', updateUserStatusValidator, validate, userController.updateStatus);
router.put('/:id/role', updateUserRoleValidator, validate, userController.updateRole);
router.delete('/:id', userIdValidator, validate, userController.deleteUser);

module.exports = router;
