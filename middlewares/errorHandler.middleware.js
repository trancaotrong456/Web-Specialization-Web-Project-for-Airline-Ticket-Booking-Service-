const ApiResponse = require('../utils/apiResponse');

// Centralized error handler
const errorHandler = (err, req, res, _next) => {
  console.error('[Error Details]:', err);

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
      value: e.value,
    }));
    return ApiResponse.error(res, 'Validation Error', 422, errors);
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const errors = err.errors.map((e) => ({
      field: e.path,
      message: `${e.path} already exists`,
      value: e.value,
    }));
    return ApiResponse.error(res, 'Duplicate entry error', 409, errors);
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return ApiResponse.error(res, 'Invalid referenced resource ID', 400);
  }

  // Custom App Error (e.g. throw { statusCode: 400, message: '...' })
  if (err.statusCode) {
    return ApiResponse.error(res, err.message, err.statusCode, err.errors || null);
  }

  // Default internal server error
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  return ApiResponse.error(res, message, 500);
};

module.exports = errorHandler;
