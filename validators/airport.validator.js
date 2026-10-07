'use strict';

const { body, param, query } = require('express-validator');

// ─── Validator ID ──────────────────────────────────────────────────────────────
const airportIdValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Airport ID must be a positive integer'),
];

// ─── Validator danh sách (query params) ────────────────────────────────────────
const listAirportValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be >= 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search keyword must not exceed 100 characters'),
];

// ─── Validator IATA code (dùng lại) ────────────────────────────────────────────
const iataCodeField = (required = true) => {
  const v = body('iata_code')
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{3}$/)
    .withMessage('IATA code must be exactly 3 uppercase letters (e.g. SGN, HAN, DAD)');
  return required ? v : v.optional();
};

// ─── Validator tạo mới ─────────────────────────────────────────────────────────
const createAirportValidator = [
  iataCodeField(true),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Airport name is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Airport name must be between 3 and 200 characters'),

  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),

  body('country')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country must not exceed 100 characters'),
];

// ─── Validator cập nhật ────────────────────────────────────────────────────────
const updateAirportValidator = [
  ...airportIdValidator,

  // Phải cung cấp ít nhất 1 trường
  body().custom((_value, { req }) => {
    const { iata_code, name, city, country } = req.body;
    if (
      iata_code === undefined &&
      name === undefined &&
      city === undefined &&
      country === undefined
    ) {
      throw new Error(
        'At least one field (iata_code, name, city, country) is required',
      );
    }
    return true;
  }),

  body('iata_code')
    .optional()
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{3}$/)
    .withMessage('IATA code must be exactly 3 uppercase letters (e.g. SGN, HAN, DAD)'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Airport name must be between 3 and 200 characters'),

  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),

  body('country')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country must not exceed 100 characters'),
];

module.exports = {
  airportIdValidator,
  listAirportValidator,
  createAirportValidator,
  updateAirportValidator,
};
