const jwt = require('jsonwebtoken');

const LOCAL_ACCESS_SECRET = 'local-only-access-secret-for-tests-and-development';
const LOCAL_REFRESH_SECRET = 'local-only-refresh-secret-for-tests-and-development';

function getSecret(name, localFallback) {
  const configured = String(process.env[name] || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production.`);
  }
  return localFallback;
}

function getJwtSecret() { return getSecret('JWT_SECRET', LOCAL_ACCESS_SECRET); }
function getJwtRefreshSecret() { return getSecret('JWT_REFRESH_SECRET', LOCAL_REFRESH_SECRET); }

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
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  return jwt.sign({ ...payload, token_type: TOKEN_TYPES.ACCESS }, getJwtSecret(), { expiresIn });
};

/**
 * Generate a short-lived access token.
 * @param {object} payload - { id, email, role }
 */
const generateAccessToken = (payload) => {
  return jwt.sign(
    { ...payload, token_type: TOKEN_TYPES.ACCESS },
    getJwtSecret(),
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
    getJwtRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * Verify JWT token
 * @param {string} token
 */
const verifyToken = (token) => {
  return verifyTypedToken(token, getJwtSecret(), TOKEN_TYPES.ACCESS);
};

const verifyAccessToken = (token) => {
  return verifyTypedToken(token, getJwtSecret(), TOKEN_TYPES.ACCESS);
};

const verifyRefreshToken = (token) => {
  return verifyTypedToken(token, getJwtRefreshSecret(), TOKEN_TYPES.REFRESH);
};

module.exports = {
  generateToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
