const { body, param } = require('express-validator');

const createFareClassValidator = [
  body().custom((value, { req }) => {
    const ALLOWED_FIELDS = ['flight_id', 'class_name', 'price', 'seat_quota'];
    const extraFields = Object.keys(req.body || {}).filter((k) => !ALLOWED_FIELDS.includes(k));
    if (extraFields.length > 0) {
      throw new Error(`Các trường không hợp lệ ngoài hợp đồng: ${extraFields.join(', ')}`);
    }
    return true;
  }),
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
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('seat_quota must be a non-negative integer'),
];

const updateFareClassValidator = [
  body().custom((value, { req }) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new Error('Dữ liệu cập nhật phải là object');
    }
    const keys = Object.keys(req.body);
    if (keys.length === 0) {
      throw new Error('Vui lòng cung cấp ít nhất một trường cần cập nhật');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'flight_id')) {
      throw new Error('Không thể thay đổi chuyến bay (flight_id) của hạng vé đã tạo');
    }
    const ALLOWED = ['class_name', 'price', 'seat_quota'];
    const disallowed = keys.filter((k) => !ALLOWED.includes(k));
    if (disallowed.length > 0) {
      throw new Error(`Không được phép chỉnh sửa các trường: ${disallowed.join(', ')}`);
    }
    return true;
  }),
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
    .optional({ nullable: true })
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
