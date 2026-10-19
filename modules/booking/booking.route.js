const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createBookingValidator,
  listBookingValidator,
  bookingAccessEmailValidator,
  lookupBookingValidator,
  cancelBookingValidator,
} = require('../../validators/booking.validator');
const { downloadTicketValidator } = require('../../validators/ticket.validator');

const defaultGuards = { authenticate, optionalAuth, authorize };
const defaultValidators = { createBookingValidator, listBookingValidator, bookingAccessEmailValidator, lookupBookingValidator, cancelBookingValidator, downloadTicketValidator };
const defaultValidation = { validate };

function createBookingRouter({ bookingController, ticketController, guards = defaultGuards, validators = defaultValidators, validation = defaultValidation, expressModule = express } = {}) {
const router = expressModule.Router();
const { authenticate, optionalAuth, authorize } = guards;
const { createBookingValidator, listBookingValidator, bookingAccessEmailValidator, lookupBookingValidator, cancelBookingValidator, downloadTicketValidator } = validators;
const { validate } = validation;

// Create a booking (holding) - supports both logged in users and guests
router.post('/', optionalAuth, createBookingValidator, validate, bookingController.createBooking);

// Get current user's bookings
router.get('/my-bookings', authenticate, listBookingValidator, validate, bookingController.getMyBookings);

// Public lookup is available only to guest bookings with the matching email.
router.get('/lookup/:code', lookupBookingValidator, validate, bookingController.lookupBooking);

// Admin/Staff get all bookings
router.get('/admin/all', authenticate, authorize('admin', 'staff'), listBookingValidator, validate, bookingController.getAllBookings);

// Download a confirmed booking's PDF ticket. Guest bookings require ?email= verification.
router.get('/:id/ticket', optionalAuth, downloadTicketValidator, validate, ticketController.downloadTicket);

// Get booking details by ID
router.get('/:id', optionalAuth, bookingAccessEmailValidator, validate, bookingController.getBookingById);

// Cancel holding booking
router.put('/:id/cancel', optionalAuth, cancelBookingValidator, validate, bookingController.cancelBooking);
router.put('/:id/ancillaries', optionalAuth, bookingAccessEmailValidator, validate, bookingController.replaceAncillaries);

return router;
}

module.exports = createBookingRouter;
