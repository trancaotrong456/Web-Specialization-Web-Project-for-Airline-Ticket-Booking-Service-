const { verifyToken } = require('../utils/jwt.util');
const { User, Role } = require('../models');

/**
 * Optional authentication middleware:
 * If Authorization header exists and valid, set req.user.
 * Otherwise, set req.user = null and continue.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      const user = await User.findByPk(decoded.id, {
        include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
        attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token'] },
      });
      if (user && user.status !== 'locked') {
        req.user = user;
      } else {
        req.user = null;
      }
    } else {
      req.user = null;
    }
  } catch (_err) {
    req.user = null;
  }
  next();
};

module.exports = optionalAuth;
