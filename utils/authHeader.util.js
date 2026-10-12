/**
 * Return the token from one well-formed Bearer authorization header.
 * Authentication schemes are case-insensitive, but the credential itself
 * must be a single non-whitespace value with no trailing data.
 */
const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') return null;

  const match = authorizationHeader.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : null;
};

module.exports = { extractBearerToken };
