'use strict';

const bcrypt = require('bcryptjs');

// Public test accounts for Docker-local demos only. Never use these credentials outside local development.
const demoUsers = Object.freeze([
  Object.freeze({ full_name: 'Demo Admin', email: 'admin@airline-booking.local', password: 'DemoAdmin@2026!', role: 'admin', status: 'active' }),
  Object.freeze({ full_name: 'Demo Staff', email: 'staff.demo@airline-booking.local', password: 'DemoStaff@2026!', role: 'staff', status: 'active' }),
  Object.freeze({ full_name: 'Demo Customer', email: 'customer.demo@airline-booking.local', password: 'DemoCustomer@2026!', role: 'customer', status: 'active' }),
]);

async function plan({ models, transaction }) {
  const existingByEmail = {};
  for (const account of demoUsers) {
    existingByEmail[account.email] = await models.User.findOne({ where: { email: account.email }, ...(transaction ? { transaction } : {}) });
  }
  const missing = demoUsers.filter((account) => !existingByEmail[account.email]);
  return { existing: demoUsers.length - missing.length, existingByEmail, missing };
}

async function seedUsers({ models, transaction, roles, accounts = demoUsers }) {
  let created = 0;
  let existing = 0;
  for (const account of accounts) {
    const current = await models.User.findOne({ where: { email: account.email }, ...(transaction ? { transaction } : {}) });
    if (current) {
      existing += 1;
      continue;
    }
    const role = roles[account.role];
    const roleId = typeof role?.get === 'function' ? role.get('id') : role?.id;
    if (roleId == null) throw new Error(`Required role '${account.role}' was not found; refusing to create demo account ${account.email}.`);
    const password_hash = await bcrypt.hash(account.password, 10);
    await models.User.create({
      role_id: roleId,
      full_name: account.full_name,
      email: account.email,
      password_hash,
      phone: null,
      status: account.status,
    }, { ...(transaction ? { transaction } : {}) });
    created += 1;
  }
  return { existing, created };
}

module.exports = { demoUsers, plan, seed: seedUsers, seedUsers };
