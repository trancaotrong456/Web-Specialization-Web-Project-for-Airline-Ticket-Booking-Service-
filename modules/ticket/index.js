const TicketService = require('./ticket.service');
const TicketController = require('./ticket.controller');

function createTicketModule({ repository, service, controller, pdfDocument } = {}) {
  const resolvedService = service || (repository ? new TicketService({ repository, pdfDocument }) : undefined);
  const resolvedController = controller || (resolvedService ? new TicketController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof resolvedController.downloadTicket !== 'function') {
    throw new TypeError('A Ticket controller with downloadTicket is required');
  }
  return { repository, service: resolvedService, controller: resolvedController };
}

function getDefaultTicketModule() { return require('../../application/buildContainer').getDefaultTicketModule(); }

module.exports = { createTicketModule, getDefaultTicketModule };
