function createErrorFilter({ getEnvironment = () => process.env.NODE_ENV } = {}) {
  return (error) => {
    if (error.name === 'SequelizeValidationError') {
      return {
        message: 'Validation Error',
        statusCode: 422,
        errors: error.errors.map((item) => ({
          field: item.path,
          message: item.message,
          value: item.value,
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
          value: item.value,
        })),
      };
    }

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return { message: 'Invalid referenced resource ID', statusCode: 400 };
    }

    if (error.statusCode) {
      return {
        message: error.message,
        statusCode: error.statusCode,
        errors: error.errors || null,
      };
    }

    return {
      message: getEnvironment() === 'production' ? 'Internal server error' : error.message,
      statusCode: 500,
    };
  };
}

module.exports = createErrorFilter;
