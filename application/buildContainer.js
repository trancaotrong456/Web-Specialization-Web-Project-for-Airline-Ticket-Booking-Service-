const ApiResponse = require('../utils/apiResponse');
const { getDefaultApiRouter } = require('./registerModules');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const { createAirlineModule } = require('../modules/airline');
const { SequelizeAirlineRepository } = require('../modules/airline/airline.repository');
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

function buildContainer({
  apiRouter,
  airlineModule,
  errorHandler,
  apiResponse = ApiResponse,
  logger = console,
  getEnvironment = () => process.env.NODE_ENV,
} = {}) {
  const resolvedAirlineModule = airlineModule || (apiRouter ? undefined : getDefaultAirlineModule());
  const resolvedApiRouter = apiRouter || getDefaultApiRouter({
    routeModules: { airlines: resolvedAirlineModule.router },
  });

  return {
    apiRouter: resolvedApiRouter,
    ...(resolvedAirlineModule ? { airlineModule: resolvedAirlineModule } : {}),
    errorHandler: errorHandler || createErrorHandlerAdapter({
      filter: createErrorFilter({ getEnvironment }),
      apiResponse,
      logger,
    }),
  };
}

module.exports = { buildContainer, getDefaultAirlineModule };
