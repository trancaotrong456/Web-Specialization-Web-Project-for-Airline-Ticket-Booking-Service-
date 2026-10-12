const { body, param, query } = require('express-validator');
const { normalizeGuestEmail } = require('../utils/guestEmail.util');

const paymentGuestEmailValidator = [
  body('guest_email').custom((value, { req }) => {
    if ((value === undefined || value === null) && !req.user) {
      throw new Error('guest_email is required for guest payment');
    }
    return true;
  }),
  body('guest_email')
    .optional({ nullable: true })
    .isString()
    .withMessage('guest_email must be a valid email if provided')
    .bail()
    .trim()
    .isEmail()
    .withMessage('guest_email must be a valid email if provided')
    .bail()
    .isLength({ max: 191 })
    .withMessage('guest_email must not exceed 191 characters')
    .customSanitizer(normalizeGuestEmail),
];

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
  ...paymentGuestEmailValidator,
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

const paymentListValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'success', 'failed', 'refunded'])
    .withMessage('status filter is invalid'),
  query('payment_method')
    .optional()
    .isIn(['vnpay', 'payos'])
    .withMessage('payment_method filter must be vnpay or payos'),
  query('booking_id').optional().isInt({ min: 1 }).withMessage('booking_id must be a valid ID'),
];

const paymentIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Payment ID must be a positive integer'),
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
    .withMessage('to_date must be a valid date')
    .bail()
    .custom((toDate, { req }) => {
      const fromDate = req.query.from_date;
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(fromDate || '') || !datePattern.test(toDate || '')) return true;
      return fromDate <= toDate;
    })
    .withMessage('from_date must be before or equal to to_date'),

  query('group_by')
    .notEmpty()
    .withMessage('group_by is required')
    .isIn(['day', 'month'])
    .withMessage('group_by must be either day or month'),
];

module.exports = {
  initiatePaymentValidator,
  refundValidator,
  paymentListValidator,
  paymentIdValidator,
  revenueValidator,
};
