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

const updateUserRoleValidator = [
  ...userIdValidator,
  body('role_id').isInt({ min: 1 }).withMessage('role_id must be a positive integer'),
];

module.exports = {
  userListValidator,
  userIdValidator,
  updateUserStatusValidator,
  updateUserRoleValidator,
};
