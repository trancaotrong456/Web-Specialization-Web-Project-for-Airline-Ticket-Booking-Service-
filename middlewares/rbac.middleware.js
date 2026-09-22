const ApiResponse = require('../utils/apiResponse');

/**
 * Role-based access control middleware
 * @param {...string} allowedRoles - e.g. 'admin', 'staff'
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized access', 401);
    }

    const userRole = req.user.role ? req.user.role.name : null;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return ApiResponse.error(
        res,
        'Forbidden: You do not have permission to perform this action',
        403
      );
    }

    next();
  };
};

module.exports = authorize;
