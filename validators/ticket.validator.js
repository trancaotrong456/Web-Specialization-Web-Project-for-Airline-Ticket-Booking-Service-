const { param, query } = require('express-validator');
const { normalizeGuestEmail } = require('../utils/guestEmail.util');

const optionalAliasEmailValidator = (field) =>
  query(field)
    .optional({ nullable: true })
    .isString()
    .withMessage(`${field} must be a valid email address`)
    .bail()
    .trim()
    .isEmail()
    .withMessage(`${field} must be a valid email address`)
    .bail()
    .isLength({ max: 191 })
    .withMessage(`${field} must not exceed 191 characters`)
    .customSanitizer(normalizeGuestEmail);

const ticketEmailConsistencyValidator = query('guest_email').custom((_value, { req }) => {
  const canonical = normalizeGuestEmail(req.query.guest_email);
  const legacy = normalizeGuestEmail(req.query.email);
  if (canonical && legacy && canonical !== legacy) {
    throw new Error('guest_email and email must match');
  }
  if (!req.user && !canonical && !legacy) {
    throw new Error('guest_email is required for guest ticket download');
  }
  return true;
});

const downloadTicketValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Booking ID must be a positive integer'),
  optionalAliasEmailValidator('guest_email'),
  optionalAliasEmailValidator('email'),
  ticketEmailConsistencyValidator,
];

module.exports = {
  downloadTicketValidator,
};
