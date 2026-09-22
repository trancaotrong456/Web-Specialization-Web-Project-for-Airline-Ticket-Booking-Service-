const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const ticketController = require('../controllers/ticket.controller');
const authenticate = require('../middlewares/auth.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createBookingValidator, listBookingValidator, bookingAccessEmailValidator, cancelBookingValidator } = require('../validators/booking.validator');
const { downloadTicketValidator } = require('../validators/ticket.validator');

// Create a booking (holding) - supports both logged in users and guests
router.post('/', optionalAuth, createBookingValidator, validate, bookingController.createBooking);

// Get current user's bookings
router.get('/my-bookings', authenticate, listBookingValidator, validate, bookingController.getMyBookings);

// Guest or public lookup by booking code
router.get('/lookup/:code', bookingController.lookupBooking);

// Admin/Staff get all bookings
router.get('/admin/all', authenticate, authorize('admin', 'staff'), listBookingValidator, validate, bookingController.getAllBookings);

// Download a confirmed booking's PDF ticket. Guest bookings require ?email= verification.
router.get('/:id/ticket', optionalAuth, downloadTicketValidator, validate, ticketController.downloadTicket);

// Get booking details by ID
router.get('/:id', optionalAuth, bookingAccessEmailValidator, validate, bookingController.getBookingById);

// Cancel holding booking
router.put('/:id/cancel', optionalAuth, cancelBookingValidator, validate, bookingController.cancelBooking);

module.exports = router;
