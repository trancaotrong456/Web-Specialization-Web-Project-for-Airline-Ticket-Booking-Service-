'use strict';

function createSocketAuthenticator({ verifyAccessToken, findUser } = {}) {
  if (typeof verifyAccessToken !== 'function' || typeof findUser !== 'function') {
    throw new TypeError('Socket token verifier and user lookup are required');
  }

  return async function authenticateSocket(socket, next) {
    const authorization = socket.handshake?.headers?.authorization || '';
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = socket.handshake?.auth?.accessToken || bearer;
    if (!token) return next(); // Public flight rooms remain available to guests.

    try {
      const decoded = verifyAccessToken(token);
      const user = await findUser(decoded.id);
      if (!user || user.status === 'locked') throw new Error('Account is unavailable');
      socket.data.authenticatedUserId = String(user.id);
      return next();
    } catch (_error) {
      return next(new Error('Unauthorized'));
    }
  };
}

module.exports = { createSocketAuthenticator };
