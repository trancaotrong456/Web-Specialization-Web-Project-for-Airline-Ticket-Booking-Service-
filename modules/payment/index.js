const PaymentService = require('./payment.service');
const PaymentController = require('./payment.controller');
const createPaymentRouter = require('./payment.route');

function createPaymentModule({ repository, service, controller, router, transactionManager, guards, validators, validation, apiResponse, socket, flightSeatService, payOSFactory, qrCode, emailProvider } = {}) {
  const resolvedService = service || (repository ? new PaymentService({ repository, transactionManager, socket, flightSeatService, payOSFactory, qrCode, emailProvider }) : undefined);
  const resolvedController = controller || (resolvedService ? new PaymentController({ service: resolvedService, apiResponse }) : undefined);
  if (!resolvedController) throw new TypeError('A Payment controller is required');
  const resolvedRouter = router || createPaymentRouter({ paymentController: resolvedController, guards, validators, validation });
  return { repository, service: resolvedService, controller: resolvedController, router: resolvedRouter };
}

function getDefaultPaymentModule() { return require('../../application/buildContainer').getDefaultPaymentModule(); }

module.exports = { createPaymentModule, getDefaultPaymentModule };
