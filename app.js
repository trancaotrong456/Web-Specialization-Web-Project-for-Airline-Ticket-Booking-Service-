const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const errorHandler = require('./middlewares/errorHandler.middleware');
const apiRoutes = require('./routes');
const ApiResponse = require('./utils/apiResponse');

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (for uploads or generated tickets if needed)
app.use('/public', express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/v1', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Airline Ticket Booking Service API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

// 404 Handler
app.use((req, res) => {
  return ApiResponse.error(res, `Cannot ${req.method} ${req.originalUrl}`, 404);
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
