const bookingService = require('../services/booking.service');
const ApiResponse = require('../utils/apiResponse');

class BookingController {
  async createBooking(req, res, next) {
    try {
      const payload = {
        ...req.body,
        user_id: req.user ? req.user.id : null,
        currentUser: req.user || null,
      };
      const booking = await bookingService.createHoldingBooking(payload);
      return ApiResponse.created(res, booking, 'Holding booking created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMyBookings(req, res, next) {
    try {
      const result = await bookingService.getUserBookings(req.user.id, req.query);
      return ApiResponse.paginated(res, result, 'User bookings retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBookingById(req, res, next) {
    try {
      const booking = await bookingService.getBookingById(req.params.id, req.user || null, req.query.email);
      return ApiResponse.success(res, booking, 'Booking details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async lookupBooking(req, res, next) {
    try {
      const { code } = req.params;
      const { email } = req.query;
      const booking = await bookingService.getBookingByCode(code, email);
      return ApiResponse.success(res, booking, 'Booking found');
    } catch (error) {
      next(error);
    }
  }

  async cancelBooking(req, res, next) {
    try {
      const result = await bookingService.cancelHoldingBooking(req.params.id, req.user || null, req.body.guest_email);
      return ApiResponse.success(res, result, 'Booking cancelled');
    } catch (error) {
      next(error);
    }
  }

  async getAllBookings(req, res, next) {
    try {
      const result = await bookingService.getAllBookings(req.query);
      return ApiResponse.paginated(res, result, 'All bookings retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BookingController();
