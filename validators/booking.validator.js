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
  body('promotion_code')
    .optional({ nullable: true })
    .trim()
    .isString()
    .withMessage('promotion_code must be a string'),
  body('passengers')
    .isArray({ min: 1, max: 9 })
    .withMessage('passengers must be an array with 1 to 9 passengers'),
  body('passengers.*.passenger_name')
    .trim()
    .notEmpty()
    .withMessage('Passenger name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Passenger name must be between 2 and 150 characters'),
  body('passengers.*.passport_no')
    .optional({ nullable: true })
    .trim()
    .isString(),
  body('passengers.*.seat_no')
    .optional({ nullable: true })
    .trim()
    .isString(),
  body('guest_email')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('guest_email must be a valid email if provided'),
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
  query('email').optional().trim().isEmail().withMessage('email must be a valid email if provided'),
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
