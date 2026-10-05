const { body, param, query } = require('express-validator');

const airlineIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Airline ID must be a positive integer'),
];

const listAirlineValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('search keyword must not exceed 100 characters'),
];

const airlineNameValidator = () => body('name')
  .trim()
  .notEmpty()
  .withMessage('Airline name is required')
  .isLength({ min: 2, max: 150 })
  .withMessage('Airline name must be between 2 and 150 characters');

const airlineIataValidator = () => body('iata_code')
  .trim()
  .toUpperCase()
  .matches(/^[A-Z0-9]{2,3}$/)
  .withMessage('IATA code must be 2-3 alphanumeric characters');

const airlineLogoValidator = () => body('logo_url')
  .optional({ nullable: true })
  .trim()
  .isLength({ max: 500 })
  .withMessage('logo_url must not exceed 500 characters')
  .custom((value) => {
    if (value && !/^https?:\/\//i.test(value) && !/^\/[a-zA-Z0-9_.-]+/.test(value)) {
      throw new Error('logo_url must be a valid URL or path');
    }
    return true;
  });

const createAirlineValidator = [
  airlineNameValidator(),
  airlineIataValidator(),
  airlineLogoValidator(),
];

const updateAirlineValidator = [
  ...airlineIdValidator,
  body().custom((_value, { req }) => {
    if (
      req.body.name === undefined &&
      req.body.iata_code === undefined &&
      req.body.logo_url === undefined
    ) {
      throw new Error('At least one of name, iata_code, or logo_url is required');
    }
    return true;
  }),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Airline name must be between 2 and 150 characters'),
  body('iata_code')
    .optional()
    .trim()
    .toUpperCase()
    .matches(/^[A-Z0-9]{2,3}$/)
    .withMessage('IATA code must be 2-3 alphanumeric characters'),
  airlineLogoValidator(),
];

module.exports = {
  airlineIdValidator,
  listAirlineValidator,
  createAirlineValidator,
  updateAirlineValidator,
};
