const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  registerValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator,
} = require('../validators/auth.validator');

// Public routes
router.post('/register', registerValidator, validate, authController.register);
router.post('/login', loginValidator, validate, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

// Protected routes (Customer, Staff, Admin)
router.get('/me', authenticate, authController.getMe);
router.put('/me', authenticate, updateProfileValidator, validate, authController.updateProfile);
router.put('/change-password', authenticate, changePasswordValidator, validate, authController.changePassword);

module.exports = router;
