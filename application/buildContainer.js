const ApiResponse = require('../utils/apiResponse');
const { getDefaultApiRouter } = require('./registerModules');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');

function buildContainer({
  apiRouter = getDefaultApiRouter(),
  errorHandler,
  apiResponse = ApiResponse,
  logger = console,
  getEnvironment = () => process.env.NODE_ENV,
} = {}) {
  return {
    apiRouter,
    errorHandler: errorHandler || createErrorHandlerAdapter({
      filter: createErrorFilter({ getEnvironment }),
      apiResponse,
      logger,
    }),
  };
}

module.exports = { buildContainer };
