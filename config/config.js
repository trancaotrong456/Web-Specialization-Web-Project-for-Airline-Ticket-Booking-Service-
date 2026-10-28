'use strict';

const cliEnvIndex = process.argv.indexOf('--env');
const cliTargetEnv = cliEnvIndex >= 0 ? process.argv[cliEnvIndex + 1] : null;
// Local/test processes may load the developer .env. Production CLI invocations
// must receive credentials explicitly and never discover local dotenv values.
if (process.env.NODE_ENV !== 'production' && cliTargetEnv !== 'production') require('dotenv').config();

const sslEnabled = process.env.DB_SSL === 'true';
const requiredDatabaseFields = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
const missingDatabaseFields = requiredDatabaseFields.filter((name) => !String(process.env[name] || '').trim());
if (missingDatabaseFields.length > 0) {
  throw new Error(`Database configuration is incomplete: ${missingDatabaseFields.join(', ')}`);
}

const ssl = sslEnabled
  ? {
      ca: process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined,
      rejectUnauthorized: true,
    }
  : undefined;

const sharedConfig = {
  // Database credentials must be supplied by the selected runtime environment.
  // Local Compose/demo defaults are injected by Compose, never by Sequelize CLI.
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false,
  seederStorage: 'sequelize',
  ...(ssl ? { dialectOptions: { ssl } } : {}),
  define: {
    timestamps: true,
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
};

module.exports = {
  development: {
    ...sharedConfig,
    database: process.env.DB_NAME,
  },
  test: {
    ...sharedConfig,
    database: process.env.DB_NAME,
  },
  production: {
    ...sharedConfig,
    database: process.env.DB_NAME,
  },
};
