/*
 * One-time recovery utility for the seeded TiDB production administrator.
 * Usage (PowerShell):
 *   $env:ADMIN_DEMO_PASSWORD='...'; node scripts/reset-production-admin-password.js --apply
 *
 * It intentionally refuses to run unless the configured database is SSL-enabled,
 * exactly one admin user exists, and that user is active.
 */
require('dotenv').config();
process.env.NODE_ENV = 'production';

const bcrypt = require('bcryptjs');
const { User, Role, sequelize } = require('../models');

async function main() {
  const password = process.env.ADMIN_DEMO_PASSWORD;
  if (!password) throw new Error('ADMIN_DEMO_PASSWORD must be set; do not hard-code a production password in this script.');
  if (process.env.DB_SSL !== 'true') throw new Error('Refusing to run: DB_SSL must be true for the TiDB production target.');
  if (!process.argv.includes('--apply')) throw new Error('Refusing dry run. Re-run with --apply after reviewing the target admin below.');

  await sequelize.authenticate();
  const admins = await User.findAll({
    attributes: ['id', 'email', 'full_name', 'role_id', 'status'],
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'], where: { name: 'admin' } }],
  });
  if (admins.length !== 1) throw new Error(`Refusing to update: expected exactly one admin user, found ${admins.length}.`);

  const admin = admins[0];
  if (admin.status !== 'active') throw new Error(`Refusing to update: admin #${admin.id} (${admin.email}) is ${admin.status}, not active.`);
  console.log(`Verified target: id=${admin.id}, email=${admin.email}, role=${admin.role.name}, status=${admin.status}`);

  const passwordHash = await bcrypt.hash(password, 10);
  const [updated] = await User.update(
    { password_hash: passwordHash },
    { where: { id: admin.id, role_id: admin.role_id } }
  );
  if (updated !== 1) throw new Error(`Update safety check failed: expected one row, updated ${updated}.`);
  console.log(`Updated exactly one admin password: ${admin.email}`);
}

main()
  .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
