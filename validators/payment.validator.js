const { body, param } = require('express-validator');

const initiatePaymentValidator = [
  body('booking_id')
    .notEmpty()
    .withMessage('booking_id is required')
    .isInt({ min: 1 })
    .withMessage('booking_id must be a valid ID'),
  body('payment_method')
    .notEmpty()
    .withMessage('payment_method is required')
    .isIn(['vnpay', 'momo'])
    .withMessage('payment_method must be either vnpay or momo'),
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

module.exports = {
  initiatePaymentValidator,
  refundValidator,
};
