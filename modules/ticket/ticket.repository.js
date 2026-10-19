const { Op } = require('sequelize');

class SequelizeTicketRepository {
  constructor({ Booking, BookingSegment, Flight, Airline, Airport, FareClass, BookingPassenger, User, BookingAncillary } = {}) {
    if (!Booking || !Flight || !Airline || !Airport || !FareClass || !BookingPassenger || !User) {
      throw new TypeError('Ticket repository requires Booking, Flight, Airline, Airport, FareClass, BookingPassenger and User');
    }
    this.Booking = Booking;
    this.BookingSegment = BookingSegment;
    this.Flight = Flight;
    this.Airline = Airline;
    this.Airport = Airport;
    this.FareClass = FareClass;
    this.BookingPassenger = BookingPassenger;
    this.User = User;
    this.BookingAncillary = BookingAncillary;
  }

  findBookingForTicket(bookingId) {
    const itineraryInclude = this.BookingSegment ? [{ model: this.BookingSegment, as: 'itinerarySegments', required: false, where: { leg_order: { [Op.gt]: 1 } }, include: [
      { model: this.Flight, as: 'flight', include: [
        { model: this.Airline, as: 'airline' },
        { model: this.Airport, as: 'departureAirport' },
        { model: this.Airport, as: 'arrivalAirport' },
      ] },
      { model: this.FareClass, as: 'fareClass' },
    ] }] : [];
    return this.Booking.findByPk(bookingId, {
      include: [
        {
          model: this.Flight,
          as: 'flight',
          include: [
            { model: this.Airline, as: 'airline' },
            { model: this.Airport, as: 'departureAirport' },
            { model: this.Airport, as: 'arrivalAirport' },
          ],
        },
        { model: this.FareClass, as: 'fareClass' },
        { model: this.BookingPassenger, as: 'passengers' },
        ...(this.BookingAncillary ? [{ model: this.BookingAncillary, as: 'ancillaries', include: [{ model: this.BookingPassenger, as: 'passenger' }, ...(this.BookingSegment ? [{ model: this.BookingSegment, as: 'segment' }] : [])] }] : []),
        { model: this.User, as: 'user', attributes: ['id', 'full_name', 'email'] },
        ...itineraryInclude,
      ],
    });
  }
}

module.exports = { SequelizeTicketRepository };
