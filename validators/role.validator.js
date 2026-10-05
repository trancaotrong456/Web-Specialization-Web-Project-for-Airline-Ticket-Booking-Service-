const { body, param } = require('express-validator');

const roleIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Role ID must be a positive integer'),
];

const roleNameValidator = () => body('name')
  .trim()
  .toLowerCase()
  .matches(/^[a-z][a-z0-9_-]{1,49}$/)
  .withMessage('Role name must contain 2-50 lowercase letters, numbers, underscores, or hyphens');

const roleDescriptionValidator = () => body('description')
  .optional({ nullable: true })
  .trim()
  .isLength({ max: 255 })
  .withMessage('Role description must not exceed 255 characters');

const createRoleValidator = [
  roleNameValidator().notEmpty().withMessage('Role name is required'),
  roleDescriptionValidator(),
];

const updateRoleValidator = [
  ...roleIdValidator,
  body().custom((_value, { req }) => {
    if (req.body.name === undefined && req.body.description === undefined) {
      throw new Error('At least one of name or description is required');
    }
    return true;
  }),
  roleNameValidator().optional(),
  roleDescriptionValidator(),
];

module.exports = {
  roleIdValidator,
  createRoleValidator,
  updateRoleValidator,
};
