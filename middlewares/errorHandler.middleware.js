const ApiResponse = require('../utils/apiResponse');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');

module.exports = createErrorHandlerAdapter({
  filter: createErrorFilter(),
  apiResponse: ApiResponse,
  logger: console,
});
