const express = require('express');

const routeDefinitions = [
  ['auth', '/auth', '../routes/auth.route'],
  ['users', '/users', '../routes/user.route'],
  ['roles', '/roles', '../routes/role.route'],
  ['airlines', '/airlines', '../routes/airline.route'],
  ['airports', '/airports', '../routes/airport.route'],
  ['flights', '/flights', '../routes/flight.route'],
  ['fareClasses', '/fare-classes', '../routes/fareClass.route'],
  ['bookings', '/bookings', '../routes/booking.route'],
  ['payments', '/payments', '../routes/payment.route'],
  ['promotions', '/promotions', '../routes/promotion.route'],
];

const loadDefaultRouteModules = () => Object.fromEntries(
  routeDefinitions.map(([name, , modulePath]) => [name, require(modulePath)]),
);

function registerModules({ expressModule = express, routeModules = loadDefaultRouteModules() } = {}) {
  const router = expressModule.Router();

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  for (const [name, mountPath] of routeDefinitions) {
    if (!routeModules[name]) {
      throw new Error(`Missing route module: ${name}`);
    }
    router.use(mountPath, routeModules[name]);
  }

  return router;
}

let defaultApiRouter;
function getDefaultApiRouter() {
  if (!defaultApiRouter) defaultApiRouter = registerModules();
  return defaultApiRouter;
}

module.exports = { registerModules, getDefaultApiRouter, routeDefinitions };
