const { resolveGuestEmail } = require('../../utils/guestEmail.util');

class TicketController {
  constructor({ service } = {}) {
    if (!service) throw new TypeError('A Ticket service is required');
    this.service = service;
    this.downloadTicket = this.downloadTicket.bind(this);
  }

  async downloadTicket(req, res, next) {
    try {
      const bookingId = req.params.id;
      const guestEmail = resolveGuestEmail(req.query.guest_email, req.query.email);
      const pdfBuffer = await this.service.generateTicketPDF(bookingId, req.user || null, guestEmail);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ticket_${bookingId}.pdf"`);
      return res.end(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = TicketController;
