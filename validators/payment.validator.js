const { body, param, query } = require('express-validator');

const initiatePaymentValidator = [
  body('booking_id')
    .notEmpty()
    .withMessage('booking_id is required')
    .isInt({ min: 1 })
    .withMessage('booking_id must be a valid ID'),
  body('payment_method')
    .notEmpty()
    .withMessage('payment_method is required')
    .isIn(['vnpay', 'payos'])
    .withMessage('payment_method must be either vnpay or payos'),
  body('return_url')
    .optional()
    .isURL()
    .withMessage('return_url must be a valid URL'),
  body('guest_email')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('guest_email must be a valid email if provided'),
];

const refundValidator = [
  param('id')
    .notEmpty()
    .withMessage('Booking ID is required')
    .isInt({ min: 1 })
    .withMessage('Invalid Booking ID'),
  body('reason')
    .optional()
    .trim()
    .isString()
    .withMessage('Reason must be a string'),
];

const revenueValidator = [
  query('from_date')
    .notEmpty()
    .withMessage('from_date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('from_date must be in YYYY-MM-DD format')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('from_date must be a valid date'),

  query('to_date')
    .notEmpty()
    .withMessage('to_date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('to_date must be in YYYY-MM-DD format')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('to_date must be a valid date'),

  query('group_by')
    .notEmpty()
    .withMessage('group_by is required')
    .isIn(['day', 'month'])
    .withMessage('group_by must be either day or month'),
];
module.exports = {
  initiatePaymentValidator,
  refundValidator,
  revenueValidator,
};
