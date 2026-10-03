const { param } = require('express-validator');

const roleIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Role ID must be a positive integer'),
];

module.exports = { roleIdValidator };
