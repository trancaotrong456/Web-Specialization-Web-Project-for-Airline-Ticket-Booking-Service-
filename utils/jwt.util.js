const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_airline_booking_system_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_airline_booking_system_2026';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

const verifyTypedToken = (token, secret, expectedType) => {
  const decoded = jwt.verify(token, secret);
  if (decoded.token_type !== expectedType) {
    throw new jwt.JsonWebTokenError(`Invalid ${expectedType} token`);
  }
  return decoded;
};

/**
 * Generate JWT token
 * @param {object} payload - { id, email, role }
 * @param {string} expiresIn
 */
const generateToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  return jwt.sign({ ...payload, token_type: TOKEN_TYPES.ACCESS }, JWT_SECRET, { expiresIn });
};

/**
 * Generate a short-lived access token.
 * @param {object} payload - { id, email, role }
 */
const generateAccessToken = (payload) => {
  return jwt.sign(
    { ...payload, token_type: TOKEN_TYPES.ACCESS },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

/**
 * Generate a long-lived refresh token using a separate signing secret.
 * @param {object} payload - { id, email, role }
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(
    { ...payload, token_type: TOKEN_TYPES.REFRESH },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 * @param {string} token
 */
const verifyToken = (token) => {
  return verifyTypedToken(token, JWT_SECRET, TOKEN_TYPES.ACCESS);
};

const verifyAccessToken = (token) => {
  return verifyTypedToken(token, JWT_SECRET, TOKEN_TYPES.ACCESS);
};

const verifyRefreshToken = (token) => {
  return verifyTypedToken(token, JWT_REFRESH_SECRET, TOKEN_TYPES.REFRESH);
};

module.exports = {
  generateToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
