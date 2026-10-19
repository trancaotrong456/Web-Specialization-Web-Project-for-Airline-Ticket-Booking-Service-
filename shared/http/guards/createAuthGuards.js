function createAuthGuards({ authenticate, optionalAuth, authorize } = {}) {
  if (
    typeof authenticate !== 'function' ||
    typeof optionalAuth !== 'function' ||
    typeof authorize !== 'function'
  ) {
    throw new TypeError('authenticate, optionalAuth, and authorize middleware are required');
  }

  return Object.freeze({ authenticate, optionalAuth, authorize });
}

module.exports = createAuthGuards;
