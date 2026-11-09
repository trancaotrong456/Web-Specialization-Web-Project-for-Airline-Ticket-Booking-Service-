'use strict';

const http = require('node:http');
const { buildContainer } = require('../../../application/buildContainer');
const { createApp } = require('../../../application/createApp');
const { generateAccessToken } = require('../../../utils/jwt.util');
const { assertSafeIntegrationEnvironment, models, verifyConnectedDatabase } = require('./mysqlTestDatabase');
const { createFlightFixture, createPromotionFixture, trackBooking, cleanupTrackedFixtures } = require('./testFixtures');

/**
 * Test-only canonical HTTP harness. It intentionally uses createApp/buildContainer
 * and never starts server.js, cron jobs, sockets or demo bootstrap.
 */
async function startHttpIntegrationHarness() {
  assertSafeIntegrationEnvironment();
  const identity = await verifyConnectedDatabase();
  if (identity.database_name !== 'airline_booking_integration_test' || Number(identity.server_port) !== 3306) {
    throw new Error('Refusing HTTP integration harness on an unexpected MySQL target');
  }

  const container = buildContainer();
  const app = createApp({ container });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const fixtures = { userIds: [] };
  async function createIdentity(roleName) {
    const [role] = await models.Role.findOrCreate({
      where: { name: roleName },
      defaults: { description: 'HTTP integration test role' },
    });
    const user = await models.User.create({
      role_id: role.id,
      full_name: `HTTP Test ${roleName}`,
      email: `http-${roleName}-${process.pid}-${Date.now()}@example.test`,
      password_hash: 'integration-only-not-a-real-password-hash',
      status: 'active',
    });
    fixtures.userIds.push(user.id);
    return { user, token: generateAccessToken({ id: user.id, email: user.email, role: roleName }) };
  }

  async function cleanup() {
    await cleanupTrackedFixtures();
    if (fixtures.userIds.length) {
      if (models.Notification) await models.Notification.destroy({ where: { user_id: fixtures.userIds }, force: true });
      if (models.NotificationOutbox) await models.NotificationOutbox.destroy({ where: { recipient_user_id: fixtures.userIds }, force: true });
      await models.User.destroy({ where: { id: fixtures.userIds }, force: true });
      fixtures.userIds.length = 0;
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  return { app, server, identity, container, createIdentity, createFlightFixture, createPromotionFixture, trackBooking, cleanup, models };
}

module.exports = { startHttpIntegrationHarness };
