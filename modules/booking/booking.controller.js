const ApiResponse = require('../../utils/apiResponse');
const { normalizeGuestEmail, resolveGuestEmail } = require('../../utils/guestEmail.util');

class BookingController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Booking service is required');
    this.service = service;
    this.apiResponse = apiResponse;
    for (const name of ['createBooking', 'getMyBookings', 'getBookingById', 'lookupBooking', 'cancelBooking', 'getAllBookings', 'replaceAncillaries']) {
      this[name] = this[name].bind(this);
    }
  }
  async createBooking(req, res, next) {
    try {
      const payload = {
        ...req.body,
        guest_email: normalizeGuestEmail(req.body.guest_email),
        user_id: req.user ? req.user.id : null,
        currentUser: req.user || null,
      };
      const booking = await this.service.createHoldingBooking(payload);
      return this.apiResponse.created(res, booking, 'Holding booking created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMyBookings(req, res, next) {
    try {
      const result = await this.service.getUserBookings(req.user.id, req.query);
      return this.apiResponse.paginated(res, result, 'User bookings retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBookingById(req, res, next) {
    try {
      const booking = await this.service.getBookingById(
        req.params.id,
        req.user || null,
        normalizeGuestEmail(req.query.guest_email)
      );

      return this.apiResponse.success(
        res,
        booking,
        'Booking details retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async lookupBooking(req, res, next) {
    try {
      const { code } = req.params;
      const guestEmail = resolveGuestEmail(req.query.guest_email, req.query.email);
      const booking = await this.service.getBookingByCode(code, guestEmail);
      return this.apiResponse.success(res, booking, 'Booking found');
    } catch (error) {
      next(error);
    }
  }

  async cancelBooking(req, res, next) {
    try {
      const result = await this.service.cancelHoldingBooking(
        req.params.id,
        req.user || null,
        normalizeGuestEmail(req.body.guest_email)
      );
      return this.apiResponse.success(res, result, 'Booking cancelled');
    } catch (error) {
      next(error);
    }
  }

  async replaceAncillaries(req, res, next) {
    try {
      const result = await this.service.replaceAncillaries(req.params.id, req.body.ancillary_selections, req.user || null, normalizeGuestEmail(req.body.guest_email));
      return this.apiResponse.success(res, result, 'Booking ancillary selections updated');
    } catch (error) { next(error); }
  }

  async getAllBookings(req, res, next) {
    try {
      const result = await this.service.getAllBookings(req.query);
      return this.apiResponse.paginated(res, result, 'All bookings retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BookingController;
