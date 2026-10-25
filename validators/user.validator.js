const { body, param, query } = require('express-validator');

const userIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
];

const userListValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'locked']).withMessage('status filter is invalid'),
  query('search').optional().trim().isLength({ max: 150 }).withMessage('search must not exceed 150 characters'),
];

const updateUserStatusValidator = [
  ...userIdValidator,
  body('status').isIn(['active', 'locked']).withMessage('status must be active or locked'),
];

const updateUserProfileValidator = [
  ...userIdValidator,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('User profile must be an object');
    }
    const allowed = new Set(['full_name', 'phone']);
    const keys = Object.keys(value);
    if (!keys.length) throw new Error('At least one profile field is required');
    if (keys.some((key) => !allowed.has(key))) throw new Error('Only full_name and phone can be updated');
    return true;
  }),
  body('full_name').optional().trim().isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('phone').optional({ nullable: true }).trim().isMobilePhone('vi-VN')
    .withMessage('Must be a valid phone number'),
];

const updateUserRoleValidator = [
  ...userIdValidator,
  body('role_id').isInt({ min: 1 }).withMessage('role_id must be a positive integer'),
];

module.exports = {
  userListValidator,
  userIdValidator,
  updateUserProfileValidator,
  updateUserStatusValidator,
  updateUserRoleValidator,
};
