const { redactString } = require('../../security/redactSensitive');

function createErrorFilter({ getEnvironment = () => process.env.NODE_ENV } = {}) {
  return (error) => {
    if (error.name === 'SequelizeValidationError') {
      return {
        message: 'Validation Error',
        statusCode: 422,
        errors: error.errors.map((item) => ({
          field: item.path,
          message: item.message,
          value: redactString(item.value),
        })),
      };
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return {
        message: 'Duplicate entry error',
        statusCode: 409,
        errors: error.errors.map((item) => ({
          field: item.path,
          message: `${item.path} already exists`,
          value: redactString(item.value),
        })),
      };
    }

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return { message: 'Invalid referenced resource ID', statusCode: 400 };
    }

    if (error.statusCode) {
      return {
        message: getEnvironment() === 'production' && Number(error.statusCode) >= 500
          ? 'Internal server error' : redactString(error.message),
        statusCode: error.statusCode,
        errors: error.errors ? error.errors.map((item) => ({ ...item, value: redactString(item.value), message: redactString(item.message) })) : null,
      };
    }

    return {
      message: getEnvironment() === 'production' ? 'Internal server error' : redactString(error.message),
      statusCode: 500,
    };
  };
}

module.exports = createErrorFilter;
