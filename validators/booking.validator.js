const { body, query, param } = require('express-validator');
const { normalizeGuestEmail } = require('../utils/guestEmail.util');

const validateGuestEmailField = (location, field) => [
  location(field).custom((value, { req }) => {
    if ((value === undefined || value === null) && !req.user) {
      throw new Error(`${field} is required for guest bookings`);
    }
    return true;
  }),
  location(field)
    .optional({ nullable: true })
    .isString()
    .withMessage(`${field} must be a valid email`)
    .bail()
    .trim()
    .isEmail()
    .withMessage(`${field} must be a valid email`)
    .bail()
    .isLength({ max: 191 })
    .withMessage(`${field} must not exceed 191 characters`)
    .customSanitizer(normalizeGuestEmail),
];

const optionalAliasEmailValidator = (field) =>
  query(field)
    .optional({ nullable: true })
    .isString()
    .withMessage(`${field} must be a valid email`)
    .bail()
    .trim()
    .isEmail()
    .withMessage(`${field} must be a valid email`)
    .bail()
    .isLength({ max: 191 })
    .withMessage(`${field} must not exceed 191 characters`)
    .customSanitizer(normalizeGuestEmail);

const bookingLookupEmailValidator = query('guest_email').custom((_value, { req }) => {
  const canonical = normalizeGuestEmail(req.query.guest_email);
  const legacy = normalizeGuestEmail(req.query.email);
  if (canonical && legacy && canonical !== legacy) {
    throw new Error('guest_email and email must match');
  }
  if (!canonical && !legacy) throw new Error('guest_email is required for guest booking lookup');
  return true;
});

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

  ...validateGuestEmailField(body, 'guest_email'),

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

  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 191 })
    .withMessage('search must be between 1 and 191 characters'),
];

const bookingAccessEmailValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('booking_id must be a positive integer'),

  ...validateGuestEmailField(query, 'guest_email'),
];

// Public lookup is intentionally limited to guest bookings and must include
// the guest email as proof of access.
const lookupBookingValidator = [
  param('code')
    .trim()
    .notEmpty()
    .withMessage('booking code is required'),
  optionalAliasEmailValidator('guest_email'),
  optionalAliasEmailValidator('email'),
  bookingLookupEmailValidator,
];

const cancelBookingValidator = [
  ...validateGuestEmailField(body, 'guest_email'),
];

module.exports = {
  createBookingValidator,
  listBookingValidator,
  bookingAccessEmailValidator,
  lookupBookingValidator,
  cancelBookingValidator,
};
