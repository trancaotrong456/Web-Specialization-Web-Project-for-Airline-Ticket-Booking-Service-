const { redactError } = require('../../security/redactSensitive');

function createErrorHandlerAdapter({ filter, apiResponse, logger = console } = {}) {
  if (typeof filter !== 'function' || !apiResponse || typeof apiResponse.error !== 'function') {
    throw new TypeError('An error filter and ApiResponse-compatible provider are required');
  }

  return (error, req, res, _next) => {
    logger.error('[Error Details]:', redactError(error));
    const mapped = filter(error, req);
    return apiResponse.error(res, mapped.message, mapped.statusCode, mapped.errors || null);
  };
}

module.exports = createErrorHandlerAdapter;
