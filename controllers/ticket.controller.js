const ticketService = require('../services/ticket.service');
const ApiResponse = require('../utils/apiResponse');

class TicketController {
  async downloadTicket(req, res, next) {
    try {
      const bookingId = req.params.id;
      const pdfBuffer = await ticketService.generateTicketPDF(bookingId, req.user || null, req.query.email);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ticket_${bookingId}.pdf"`);
      return res.end(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TicketController();
