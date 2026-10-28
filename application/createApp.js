const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const ApiResponse = require('../utils/apiResponse');
const { buildContainer } = require('./buildContainer');

function createApp({ container = buildContainer() } = {}) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || '*',
      credentials: true,
      exposedHeaders: ['Date'],
    }),
  );

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/v1', container.apiRouter);

  app.get('/', (req, res) => {
    res.json({
      message: 'Airline Ticket Booking Service API',
      version: '1.0.0',
      docs: '/api/v1/health',
    });
  });

  app.use((req, res) => ApiResponse.error(res, `Cannot ${req.method} ${req.originalUrl}`, 404));
  app.use(container.errorHandler);
  return app;
}

module.exports = { createApp };
