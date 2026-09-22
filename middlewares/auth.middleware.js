const { verifyToken } = require('../utils/jwt.util');
const ApiResponse = require('../utils/apiResponse');
const { User, Role } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await User.findByPk(decoded.id, {
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token'] },
    });

    if (!user) {
      return ApiResponse.error(res, 'User no longer exists', 401);
    }

    if (user.status === 'locked') {
      return ApiResponse.error(res, 'Account has been locked', 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.error(res, 'Token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.error(res, 'Invalid token', 401);
    }
    return next(error);
  }
};

module.exports = authenticate;
