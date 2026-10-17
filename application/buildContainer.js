const ApiResponse = require('../utils/apiResponse');
const { getDefaultApiRouter, registerModules } = require('./registerModules');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const { createAirlineModule } = require('../modules/airline');
const { SequelizeAirlineRepository } = require('../modules/airline/airline.repository');
const { createAirportModule } = require('../modules/airport');
const { SequelizeAirportRepository } = require('../modules/airport/airport.repository');
const { createPromotionModule } = require('../modules/promotion');
const { SequelizePromotionRepository } = require('../modules/promotion/promotion.repository');
const { createFareClassModule } = require('../modules/fare-class');
const { SequelizeFareClassRepository } = require('../modules/fare-class/fareClass.repository');
const { createFlightModule } = require('../modules/flight');
const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
const { createUserModule } = require('../modules/user');
const { SequelizeUserRepository } = require('../modules/user/user.repository');
const { createRoleModule } = require('../modules/role');
const { SequelizeRoleRepository } = require('../modules/role/role.repository');
const { createAuthModule } = require('../modules/auth');
const { SequelizeAuthRepository } = require('../modules/auth/auth.repository');
const { createTicketModule } = require('../modules/ticket');
const { SequelizeTicketRepository } = require('../modules/ticket/ticket.repository');
const { createBookingModule } = require('../modules/booking');
const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');
const { createPaymentModule } = require('../modules/payment');
const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
const { createSeatSelectionModule } = require('../modules/seat-selection');
const SequelizeSeatSelectionRepository = require('../modules/seat-selection/seatSelection.repository');
const { createAncillariesModule } = require('../modules/ancillaries');
const { SequelizeAncillariesRepository } = require('../modules/ancillaries/ancillaries.repository');
const { createNotificationModule } = require('../modules/notification');
const { SequelizeNotificationRepository } = require('../modules/notification/notification.repository');
const { NotificationEventPublisher } = require('../modules/notification/notificationEventPublisher');
const createAuthGuards = require('../shared/http/guards/createAuthGuards');
const createValidationAdapter = require('../shared/http/validation/validationAdapter');
const { getEmailProvider } = require('../infrastructure/email/emailProvider');
const { getSocket } = require('../infrastructure/realtime/socketProvider');

let defaultAirlineModule;
function getDefaultAirlineModule() {
  if (defaultAirlineModule) return defaultAirlineModule;

  const { Airline, Flight } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = {
    validate: createValidationAdapter(require('../middlewares/validate.middleware')),
  };

  defaultAirlineModule = createAirlineModule({
    repository: new SequelizeAirlineRepository({ Airline, Flight, Op }),
    guards,
    validation,
    validators: require('../validators/airline.validator'),
    apiResponse: ApiResponse,
  });
  return defaultAirlineModule;
}

let defaultAirportModule;
function getDefaultAirportModule() {
  if (defaultAirportModule) return defaultAirportModule;

  const { Airport } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });

  defaultAirportModule = createAirportModule({
    repository: new SequelizeAirportRepository({ Airport, Op }),
    guards,
  });
  return defaultAirportModule;
}

let defaultPromotionModule;
function getDefaultPromotionModule() {
  if (defaultPromotionModule) return defaultPromotionModule;
  const { Promotion } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  defaultPromotionModule = createPromotionModule({
    repository: new SequelizePromotionRepository({ Promotion, Op }), guards,
  });
  return defaultPromotionModule;
}

let defaultFareClassModule;
function getDefaultFareClassModule() {
  if (defaultFareClassModule) return defaultFareClassModule;
  const { FareClass, Flight, Booking } = require('../models');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultFareClassModule = createFareClassModule({
    repository: new SequelizeFareClassRepository({ FareClass, Flight, Booking }),
    guards, validation, validators: require('../validators/fareClass.validator'),
  });
  return defaultFareClassModule;
}

let defaultFlightModule;
function getDefaultFlightModule() {
  if (defaultFlightModule) return defaultFlightModule;
  const { sequelize, Flight, Airline, Airport, FareClass, Booking, FlightStatusHistory, User } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultFlightModule = createFlightModule({
    repository: new SequelizeFlightRepository({ sequelize, Flight, Airline, Airport, FareClass, Booking, FlightStatusHistory, User, Op }),
    guards, validation, validators: require('../validators/flight.validator'), getIO: getSocket,
  });
  return defaultFlightModule;
}

let defaultUserModule;
function getDefaultUserModule() {
  if (defaultUserModule) return defaultUserModule;
  const { User, Role } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultUserModule = createUserModule({
    repository: new SequelizeUserRepository({ User, Role, Op }),
    guards, validation, validators: require('../validators/user.validator'),
  });
  return defaultUserModule;
}

let defaultRoleModule;
function getDefaultRoleModule() {
  if (defaultRoleModule) return defaultRoleModule;
  const { Role, User } = require('../models');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultRoleModule = createRoleModule({
    repository: new SequelizeRoleRepository({ Role, User }),
    guards, validation, validators: require('../validators/role.validator'),
  });
  return defaultRoleModule;
}

let defaultAuthModule;
function getDefaultAuthModule() {
  if (defaultAuthModule) return defaultAuthModule;
  const { User, Role } = require('../models');
  const { Op } = require('sequelize');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultAuthModule = createAuthModule({
    repository: new SequelizeAuthRepository({ User, Role, Op }),
    guards, validation, validators: require('../validators/auth.validator'), emailProvider: getEmailProvider(),
  });
  return defaultAuthModule;
}

let defaultTicketModule;
function getDefaultTicketModule() {
  if (defaultTicketModule) return defaultTicketModule;
  const models = require('../models');
  defaultTicketModule = createTicketModule({
    repository: new SequelizeTicketRepository(models),
  });
  return defaultTicketModule;
}

let defaultBookingModule;
let defaultSeatSelectionModule;
let defaultAncillariesModule;
function getDefaultAncillariesModule() {
  if (defaultAncillariesModule) return defaultAncillariesModule;
  const models = require('../models');
  const guards = createAuthGuards({ authenticate: require('../middlewares/auth.middleware'), optionalAuth: require('../middlewares/optionalAuth.middleware'), authorize: require('../middlewares/rbac.middleware') });
  defaultAncillariesModule = createAncillariesModule({ repository: new SequelizeAncillariesRepository(models), transactionManager: models.sequelize, guards });
  return defaultAncillariesModule;
}
function getDefaultSeatSelectionModule() {
  if (defaultSeatSelectionModule) return defaultSeatSelectionModule;
  const models = require('../models');
  const guards = createAuthGuards({ authenticate: require('../middlewares/auth.middleware'), optionalAuth: require('../middlewares/optionalAuth.middleware'), authorize: require('../middlewares/rbac.middleware') });
  defaultSeatSelectionModule = createSeatSelectionModule({ repository: new SequelizeSeatSelectionRepository(models), transactionManager: models.sequelize, guards });
  return defaultSeatSelectionModule;
}
function getDefaultBookingModule() {
  if (defaultBookingModule) return defaultBookingModule;
  const models = require('../models');
  defaultBookingModule = createBookingModule({
    repository: new SequelizeBookingRepository(models),
    transactionManager: models.sequelize,
    ticketController: getDefaultTicketModule().controller,
    socket: getSocket,
    seatSelectionService: getDefaultSeatSelectionModule().service,
    ancillaryService: getDefaultAncillariesModule().service,
    notificationPublisher: getDefaultNotificationPublisher(),
  });
  return defaultBookingModule;
}

let defaultPaymentModule;
function getDefaultPaymentModule() {
  if (defaultPaymentModule) return defaultPaymentModule;
  const models = require('../models');
  defaultPaymentModule = createPaymentModule({
    repository: new SequelizePaymentRepository(models),
    transactionManager: models.sequelize,
    socket: getSocket,
    emailProvider: getEmailProvider(),
    seatSelectionService: getDefaultSeatSelectionModule().service,
    ancillaryService: getDefaultAncillariesModule().service,
    notificationPublisher: getDefaultNotificationPublisher(),
  });
  return defaultPaymentModule;
}

let defaultNotificationPublisher;
function getDefaultNotificationPublisher() {
  if (defaultNotificationPublisher) return defaultNotificationPublisher;
  const { Notification, NotificationOutbox, User } = require('../models');
  defaultNotificationPublisher = new NotificationEventPublisher({ Notification, NotificationOutbox, User });
  return defaultNotificationPublisher;
}

let defaultNotificationModule;
function getDefaultNotificationModule() {
  if (defaultNotificationModule) return defaultNotificationModule;
  const { Notification } = require('../models');
  const guards = createAuthGuards({
    authenticate: require('../middlewares/auth.middleware'),
    optionalAuth: require('../middlewares/optionalAuth.middleware'),
    authorize: require('../middlewares/rbac.middleware'),
  });
  const validation = { validate: createValidationAdapter(require('../middlewares/validate.middleware')) };
  defaultNotificationModule = createNotificationModule({
    repository: new SequelizeNotificationRepository({ Notification }),
    guards,
    validation,
    validators: require('../validators/notification.validator'),
  });
  return defaultNotificationModule;
}

function buildContainer({
  apiRouter,
  airlineModule,
  airportModule,
  promotionModule,
  fareClassModule,
  flightModule,
  userModule,
  roleModule,
  authModule,
  bookingModule,
  paymentModule,
  seatSelectionModule,
  ancillariesModule,
  notificationModule,
  errorHandler,
  apiResponse = ApiResponse,
  logger = console,
  getEnvironment = () => process.env.NODE_ENV,
} = {}) {
  const resolvedAirlineModule = airlineModule || (apiRouter ? undefined : getDefaultAirlineModule());
  const resolvedAirportModule = airportModule || (apiRouter ? undefined : getDefaultAirportModule());
  const resolvedPromotionModule = promotionModule || (apiRouter ? undefined : getDefaultPromotionModule());
  const resolvedFareClassModule = fareClassModule || (apiRouter ? undefined : getDefaultFareClassModule());
  const resolvedFlightModule = flightModule || (apiRouter ? undefined : getDefaultFlightModule());
  const resolvedUserModule = userModule || (apiRouter ? undefined : getDefaultUserModule());
  const resolvedRoleModule = roleModule || (apiRouter ? undefined : getDefaultRoleModule());
  const resolvedAuthModule = authModule || (apiRouter ? undefined : getDefaultAuthModule());
  const resolvedBookingModule = bookingModule || (apiRouter ? undefined : getDefaultBookingModule());
  const resolvedPaymentModule = paymentModule || (apiRouter ? undefined : getDefaultPaymentModule());
  const resolvedSeatSelectionModule = seatSelectionModule || (apiRouter ? undefined : getDefaultSeatSelectionModule());
  const resolvedAncillariesModule = ancillariesModule || (apiRouter ? undefined : getDefaultAncillariesModule());
  const resolvedNotificationModule = notificationModule || (apiRouter ? undefined : getDefaultNotificationModule());
  const routeModules = {
    ...(resolvedAuthModule ? { auth: resolvedAuthModule.router } : {}),
    ...(resolvedUserModule ? { users: resolvedUserModule.router } : {}),
    ...(resolvedRoleModule ? { roles: resolvedRoleModule.router } : {}),
    ...(resolvedAirlineModule ? { airlines: resolvedAirlineModule.router } : {}),
    ...(resolvedAirportModule ? { airports: resolvedAirportModule.router } : {}),
    ...(resolvedPromotionModule ? { promotions: resolvedPromotionModule.router } : {}),
    ...(resolvedFareClassModule ? { fareClasses: resolvedFareClassModule.router } : {}),
    ...(resolvedFlightModule ? { flights: resolvedFlightModule.router } : {}),
    ...(resolvedBookingModule ? { bookings: resolvedBookingModule.router } : {}),
    ...(resolvedPaymentModule ? { payments: resolvedPaymentModule.router } : {}),
    ...(resolvedSeatSelectionModule ? { seatSelection: resolvedSeatSelectionModule.router } : {}),
    ...(resolvedAncillariesModule ? { ancillaries: resolvedAncillariesModule.router } : {}),
    ...(resolvedNotificationModule ? { notifications: resolvedNotificationModule.router } : {}),
  };
  const hasModuleOverrides = Boolean(airlineModule || airportModule || promotionModule || fareClassModule || flightModule || userModule || roleModule || authModule || bookingModule || paymentModule || seatSelectionModule || ancillariesModule || notificationModule);
  const resolvedApiRouter = apiRouter || (hasModuleOverrides
    ? registerModules({ routeModules })
    : getDefaultApiRouter({ routeModules }));

  return {
    apiRouter: resolvedApiRouter,
    ...(resolvedAirlineModule ? { airlineModule: resolvedAirlineModule } : {}),
    ...(resolvedAirportModule ? { airportModule: resolvedAirportModule } : {}),
    ...(resolvedPromotionModule ? { promotionModule: resolvedPromotionModule } : {}),
    ...(resolvedFareClassModule ? { fareClassModule: resolvedFareClassModule } : {}),
    ...(resolvedFlightModule ? { flightModule: resolvedFlightModule } : {}),
    ...(resolvedUserModule ? { userModule: resolvedUserModule } : {}),
    ...(resolvedRoleModule ? { roleModule: resolvedRoleModule } : {}),
    ...(resolvedAuthModule ? { authModule: resolvedAuthModule } : {}),
    ...(resolvedBookingModule ? { bookingModule: resolvedBookingModule } : {}),
    ...(resolvedPaymentModule ? { paymentModule: resolvedPaymentModule } : {}),
    ...(resolvedSeatSelectionModule ? { seatSelectionModule: resolvedSeatSelectionModule } : {}),
    ...(resolvedAncillariesModule ? { ancillariesModule: resolvedAncillariesModule } : {}),
    ...(resolvedNotificationModule ? { notificationModule: resolvedNotificationModule } : {}),
    errorHandler: errorHandler || createErrorHandlerAdapter({
      filter: createErrorFilter({ getEnvironment }),
      apiResponse,
      logger,
    }),
  };
}

module.exports = { buildContainer, getDefaultAirlineModule, getDefaultAirportModule, getDefaultPromotionModule, getDefaultFareClassModule, getDefaultFlightModule, getDefaultUserModule, getDefaultRoleModule, getDefaultAuthModule, getDefaultTicketModule, getDefaultBookingModule, getDefaultPaymentModule, getDefaultSeatSelectionModule, getDefaultAncillariesModule, getDefaultNotificationModule, getDefaultNotificationPublisher };
