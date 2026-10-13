class SequelizeTicketRepository {
  constructor({ Booking, Flight, Airline, Airport, FareClass, BookingPassenger, User } = {}) {
    if (!Booking || !Flight || !Airline || !Airport || !FareClass || !BookingPassenger || !User) {
      throw new TypeError('Ticket repository requires Booking, Flight, Airline, Airport, FareClass, BookingPassenger and User');
    }
    this.Booking = Booking;
    this.Flight = Flight;
    this.Airline = Airline;
    this.Airport = Airport;
    this.FareClass = FareClass;
    this.BookingPassenger = BookingPassenger;
    this.User = User;
  }

  findBookingForTicket(bookingId) {
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
        { model: this.User, as: 'user', attributes: ['id', 'full_name', 'email'] },
      ],
    });
  }
}

module.exports = { SequelizeTicketRepository };
