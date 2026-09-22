const { body, query, param } = require('express-validator');

const searchFlightValidator = [
  query('departure_airport_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('departure_airport_id must be a positive integer'),
  query('arrival_airport_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('arrival_airport_id must be a positive integer'),
  query('departure_date')
    .optional()
    .isDate()
    .withMessage('departure_date must be a valid date (YYYY-MM-DD)'),
  query('min_seats')
    .optional()
    .isInt({ min: 1 })
    .withMessage('min_seats must be a positive integer'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be >= 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const createFlightValidator = [
  body('airline_id').notEmpty().isInt({ min: 1 }).withMessage('airline_id is required'),
  body('departure_airport_id').notEmpty().isInt({ min: 1 }).withMessage('departure_airport_id is required'),
  body('arrival_airport_id').notEmpty().isInt({ min: 1 }).withMessage('arrival_airport_id is required'),
  body('departure_time').notEmpty().isISO8601().withMessage('departure_time must be a valid ISO8601 datetime'),
  body('arrival_time').notEmpty().isISO8601().withMessage('arrival_time must be a valid ISO8601 datetime'),
  body('total_seats').notEmpty().isInt({ min: 1 }).withMessage('total_seats must be a positive integer'),
  body('status')
    .optional()
    .isIn(['scheduled', 'cancelled', 'completed'])
    .withMessage('status must be scheduled, cancelled, or completed'),
];

const updateFlightValidator = [
  body('departure_time').optional().isISO8601().withMessage('departure_time must be a valid ISO8601 datetime'),
  body('arrival_time').optional().isISO8601().withMessage('arrival_time must be a valid ISO8601 datetime'),
  body('status')
    .optional()
    .isIn(['scheduled', 'cancelled', 'completed'])
    .withMessage('status must be scheduled, cancelled, or completed'),
];

module.exports = {
  searchFlightValidator,
  createFlightValidator,
  updateFlightValidator,
};
