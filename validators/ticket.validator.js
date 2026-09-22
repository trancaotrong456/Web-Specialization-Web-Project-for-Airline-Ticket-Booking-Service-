const { param, query } = require('express-validator');

const downloadTicketValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Booking ID must be a positive integer'),
  query('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('email must be a valid email address'),
];

module.exports = {
  downloadTicketValidator,
};
