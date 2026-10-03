const { body } = require('express-validator');

const validateBcryptPasswordLength = (value) => {
  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 bytes');
  }
  return true;
};

const registerValidator = [
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .custom(validateBcryptPasswordLength),
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .isMobilePhone('vi-VN')
    .withMessage('Must be a valid phone number'),
];

const loginValidator = [
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('password').notEmpty().withMessage('Password is required'),
];

const refreshTokenValidator = [
  body('refreshToken')
    .isString()
    .withMessage('Refresh token must be a string')
    .trim()
    .notEmpty()
    .withMessage('Refresh token is required'),
];

const updateProfileValidator = [
  body().custom((_value, { req }) => {
    if (req.body.full_name === undefined && req.body.phone === undefined) {
      throw new Error('At least one of full_name or phone is required');
    }
    return true;
  }),
  body('full_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .isMobilePhone('vi-VN')
    .withMessage('Must be a valid phone number'),
];

const changePasswordValidator = [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .custom(validateBcryptPasswordLength),
];

module.exports = {
  registerValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator,
  refreshTokenValidator,
};
