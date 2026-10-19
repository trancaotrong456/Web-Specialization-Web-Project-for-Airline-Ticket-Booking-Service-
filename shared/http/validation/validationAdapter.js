function createValidationAdapter(validateMiddleware) {
  if (typeof validateMiddleware !== 'function') {
    throw new TypeError('An express-validator middleware function is required');
  }

  return function validationAdapter(req, res, next) {
    return validateMiddleware(req, res, next);
  };
}

module.exports = createValidationAdapter;
