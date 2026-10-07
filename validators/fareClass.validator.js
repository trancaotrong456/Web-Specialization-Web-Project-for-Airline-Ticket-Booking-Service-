const { body, param } = require('express-validator');

const createFareClassValidator = [
  body('flight_id')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('flight_id is required and must be a positive integer'),
  body('class_name')
    .trim()
    .notEmpty()
    .withMessage('class_name is required'),
  body('price')
    .notEmpty()
    .isFloat({ min: 0 })
    .withMessage('price is required and must be non-negative'),
  body('seat_quota')
    .optional()
    .isInt({ min: 0 })
    .withMessage('seat_quota must be a non-negative integer'),
];

const updateFareClassValidator = [
  body('class_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('class_name cannot be empty'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('price must be non-negative'),
  body('seat_quota')
    .optional()
    .isInt({ min: 0 })
    .withMessage('seat_quota must be a non-negative integer'),
];

const fareClassIdParamValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Fare class ID must be a positive integer'),
];

const flightIdParamValidator = [
  param('flightId')
    .isInt({ min: 1 })
    .withMessage('Flight ID must be a positive integer'),
];

module.exports = {
  createFareClassValidator,
  updateFareClassValidator,
  fareClassIdParamValidator,
  flightIdParamValidator,
};
