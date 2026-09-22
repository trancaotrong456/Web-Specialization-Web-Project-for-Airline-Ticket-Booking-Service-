'use strict';

require('dotenv').config();

const sslEnabled = process.env.DB_SSL === 'true';
const ssl = sslEnabled
  ? {
      ca: process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined,
      rejectUnauthorized: true,
    }
  : undefined;

const sharedConfig = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
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
    database: process.env.DB_NAME || 'airline_booking_db',
  },
  test: {
    ...sharedConfig,
    database: process.env.DB_NAME || 'airline_booking_test_db',
  },
  production: {
    ...sharedConfig,
    database: process.env.DB_NAME || 'airline_booking_prod_db',
  },
};
