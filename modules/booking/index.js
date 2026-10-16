const BookingService = require('./booking.service');
const BookingController = require('./booking.controller');
const createBookingRouter = require('./booking.route');

function createBookingModule({ repository, service, controller, router, transactionManager, ticketController, guards, validators, validation, apiResponse, socket, flightSeatService, seatSelectionService } = {}) {
  const resolvedService = service || (repository ? new BookingService({ repository, transactionManager, socket, flightSeatService, seatSelectionService }) : undefined);
  const resolvedController = controller || (resolvedService ? new BookingController({ service: resolvedService, apiResponse }) : undefined);
  if (!resolvedController) throw new TypeError('A Booking controller is required');
  const resolvedRouter = router || createBookingRouter({ bookingController: resolvedController, ticketController: ticketController || require('../ticket').getDefaultTicketModule().controller, guards, validators, validation });
  return { repository, service: resolvedService, controller: resolvedController, router: resolvedRouter };
}

function getDefaultBookingModule() { return require('../../application/buildContainer').getDefaultBookingModule(); }

module.exports = { createBookingModule, getDefaultBookingModule };
