const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');

// All routes require admin
router.use(authenticate, authorize('admin'));

router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.put('/:id/status', userController.updateStatus);
router.put('/:id/role', userController.updateRole);
router.delete('/:id', userController.deleteUser);

module.exports = router;
