const { body, query, param } = require('express-validator');

const createBookingValidator = [
  body('flight_id')
    .notEmpty()
    .withMessage('flight_id is required')
    .isInt({ min: 1 })
    .withMessage('flight_id must be a positive integer'),

  body('fare_class_id')
    .notEmpty()
    .withMessage('fare_class_id is required')
    .isInt({ min: 1 })
    .withMessage('fare_class_id must be a positive integer'),

  body('passengers')
    .isArray({ min: 1 })
    .withMessage('passengers must contain at least 1 passenger'),

  body('passengers.*.passenger_name')
    .trim()
    .notEmpty()
    .withMessage('Passenger name is required')
    .isLength({ max: 150 })
    .withMessage('Passenger name must not exceed 150 characters'),

  body('passengers.*.passport_no')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Passport number must not exceed 30 characters'),

  body('promotion_code')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Promotion code must not exceed 30 characters'),
];

const listBookingValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be >= 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'])
    .withMessage('status filter is invalid'),
];

const bookingAccessEmailValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('booking_id must be a positive integer'),

  query('guest_email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('guest_email must be a valid email if provided')
    .isLength({ max: 191 })
    .withMessage('guest_email must not exceed 191 characters'),
];

// Public lookup is intentionally limited to guest bookings and must include
// the guest email as proof of access.
const lookupBookingValidator = [
  param('code')
    .trim()
    .notEmpty()
    .withMessage('booking code is required'),
  query('email')
    .trim()
    .notEmpty()
    .withMessage('email is required for guest booking lookup')
    .isEmail()
    .withMessage('email must be a valid email'),
];

const cancelBookingValidator = [
  body('guest_email').optional({ nullable: true }).trim().isEmail().withMessage('guest_email must be a valid email if provided'),
];

module.exports = {
  createBookingValidator,
  listBookingValidator,
  bookingAccessEmailValidator,
  lookupBookingValidator,
  cancelBookingValidator,
};
