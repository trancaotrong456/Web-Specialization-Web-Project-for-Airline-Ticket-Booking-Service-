const { body, param } = require('express-validator');

const allowedFields = new Set([
  'code',
  'discount_type',
  'discount_value',
  'valid_from',
  'valid_to',
  'max_uses',
]);

const rejectUnknownFields = body().custom((_, { req }) => {
  const unknownFields = Object.keys(req.body || {}).filter((key) => !allowedFields.has(key));
  if (unknownFields.length > 0) {
    throw new Error(`Unsupported promotion fields: ${unknownFields.join(', ')}`);
  }
  return true;
});

const promotionIdValidator = param('id')
  .isInt({ min: 1 })
  .withMessage('Promotion ID must be a positive integer');

const createPromotionValidator = [
  rejectUnknownFields,
  body('code').trim().notEmpty().isLength({ max: 30 }),
  body('discount_type').isIn(['percent', 'amount']),
  body('discount_value').isFloat({ gt: 0 }).withMessage('discount_value must be greater than 0'),
  body('valid_from').isISO8601().withMessage('valid_from must be a valid ISO8601 datetime'),
  body('valid_to').isISO8601().withMessage('valid_to must be a valid ISO8601 datetime'),
  body('max_uses')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('max_uses must be a positive integer or null'),
];

const updatePromotionValidator = [
  promotionIdValidator,
  rejectUnknownFields,
  body().custom((_, { req }) => {
    if (!Object.keys(req.body || {}).some((key) => allowedFields.has(key))) {
      throw new Error('At least one promotion field is required');
    }
    return true;
  }),
  body('code').optional().trim().notEmpty().isLength({ max: 30 }),
  body('discount_type').optional().isIn(['percent', 'amount']),
  body('discount_value').optional().isFloat({ gt: 0 }).withMessage('discount_value must be greater than 0'),
  body('valid_from').optional().isISO8601().withMessage('valid_from must be a valid ISO8601 datetime'),
  body('valid_to').optional().isISO8601().withMessage('valid_to must be a valid ISO8601 datetime'),
  body('max_uses')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('max_uses must be a positive integer or null'),
];

module.exports = {
  createPromotionValidator,
  updatePromotionValidator,
  promotionIdValidator: [promotionIdValidator],
};
