'use strict';

const { query, param } = require('express-validator');

const listNotificationsValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
];

const notificationIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
];

module.exports = { listNotificationsValidator, notificationIdValidator };
