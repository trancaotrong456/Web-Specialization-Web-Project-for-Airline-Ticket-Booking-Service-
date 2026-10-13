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
const createAuthGuards = require('../shared/http/guards/createAuthGuards');
const createValidationAdapter = require('../shared/http/validation/validationAdapter');

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

function buildContainer({
  apiRouter,
  airlineModule,
  airportModule,
  promotionModule,
  fareClassModule,
  errorHandler,
  apiResponse = ApiResponse,
  logger = console,
  getEnvironment = () => process.env.NODE_ENV,
} = {}) {
  const resolvedAirlineModule = airlineModule || (apiRouter ? undefined : getDefaultAirlineModule());
  const resolvedAirportModule = airportModule || (apiRouter ? undefined : getDefaultAirportModule());
  const resolvedPromotionModule = promotionModule || (apiRouter ? undefined : getDefaultPromotionModule());
  const resolvedFareClassModule = fareClassModule || (apiRouter ? undefined : getDefaultFareClassModule());
  const routeModules = {
    ...(resolvedAirlineModule ? { airlines: resolvedAirlineModule.router } : {}),
    ...(resolvedAirportModule ? { airports: resolvedAirportModule.router } : {}),
    ...(resolvedPromotionModule ? { promotions: resolvedPromotionModule.router } : {}),
    ...(resolvedFareClassModule ? { fareClasses: resolvedFareClassModule.router } : {}),
  };
  const hasModuleOverrides = Boolean(airlineModule || airportModule || promotionModule || fareClassModule);
  const resolvedApiRouter = apiRouter || (hasModuleOverrides
    ? registerModules({ routeModules })
    : getDefaultApiRouter({ routeModules }));

  return {
    apiRouter: resolvedApiRouter,
    ...(resolvedAirlineModule ? { airlineModule: resolvedAirlineModule } : {}),
    ...(resolvedAirportModule ? { airportModule: resolvedAirportModule } : {}),
    ...(resolvedPromotionModule ? { promotionModule: resolvedPromotionModule } : {}),
    ...(resolvedFareClassModule ? { fareClassModule: resolvedFareClassModule } : {}),
    errorHandler: errorHandler || createErrorHandlerAdapter({
      filter: createErrorFilter({ getEnvironment }),
      apiResponse,
      logger,
    }),
  };
}

module.exports = { buildContainer, getDefaultAirlineModule, getDefaultAirportModule, getDefaultPromotionModule, getDefaultFareClassModule };
