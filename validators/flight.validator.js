const { body, query, param } = require('express-validator');
const FLIGHT_STATUSES = ['scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed'];

const searchFlightValidator = [
  query('departure_airport_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('departure_airport_id must be a positive integer'),
  query('arrival_airport_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('arrival_airport_id must be a positive integer'),
  query('airline_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('airline_id must be a positive integer'),
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
  body().custom((value, { req }) => {
    if (req.body && typeof req.body === 'object') {
      if (Object.prototype.hasOwnProperty.call(req.body, 'available_seats')) {
        throw new Error('available_seats do hệ thống quản lý, không được gửi từ client');
      }
      const systemFields = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'];
      for (const field of systemFields) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          throw new Error(`Không được phép truyền trường hệ thống: ${field}`);
        }
      }
    }
    return true;
  }),
  body('airline_id').notEmpty().isInt({ min: 1 }).withMessage('airline_id is required'),
  body('departure_airport_id').notEmpty().isInt({ min: 1 }).withMessage('departure_airport_id is required'),
  body('arrival_airport_id')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('arrival_airport_id is required')
    .custom((val, { req }) => {
      if (req.body.departure_airport_id && Number(val) === Number(req.body.departure_airport_id)) {
        throw new Error('arrival_airport_id must be different from departure_airport_id');
      }
      return true;
    }),
  body('departure_time').notEmpty().isISO8601().withMessage('departure_time must be a valid ISO8601 datetime'),
  body('arrival_time')
    .notEmpty()
    .isISO8601()
    .withMessage('arrival_time must be a valid ISO8601 datetime')
    .custom((val, { req }) => {
      if (req.body.departure_time && new Date(val) <= new Date(req.body.departure_time)) {
        throw new Error('arrival_time must be after departure_time');
      }
      return true;
    }),
  body('total_seats').notEmpty().isInt({ min: 1 }).withMessage('total_seats must be a positive integer'),
  body('status')
    .optional()
    .isIn(['scheduled', 'cancelled', 'completed'])
    .withMessage('status must be scheduled, cancelled, or completed'),
];

const updateFlightValidator = [
  body().custom((value, { req }) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new Error('Dữ liệu cập nhật phải là object');
    }
    const keys = Object.keys(req.body);
    if (keys.length === 0) {
      throw new Error('Vui lòng cung cấp ít nhất một trường cần cập nhật');
    }
    const ALLOWED = ['departure_time', 'arrival_time', 'actual_departure_time', 'actual_arrival_time', 'status', 'reason'];
    const disallowed = keys.filter((key) => !ALLOWED.includes(key));
    if (disallowed.length > 0) {
      throw new Error(`Không được phép chỉnh sửa các trường: ${disallowed.join(', ')}`);
    }
    return true;
  }),
  body('departure_time').optional().isISO8601().withMessage('departure_time must be a valid ISO8601 datetime'),
  body('arrival_time')
    .optional()
    .isISO8601()
    .withMessage('arrival_time must be a valid ISO8601 datetime')
    .custom((val, { req }) => {
      if (req.body.departure_time && new Date(val) <= new Date(req.body.departure_time)) {
        throw new Error('arrival_time must be after departure_time');
      }
      return true;
    }),
  body('status')
    .optional()
    .isIn(FLIGHT_STATUSES)
    .withMessage('status không hợp lệ'),
  ...['actual_departure_time', 'actual_arrival_time'].map((field) => body(field).optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage(`${field} phải là thời gian ISO8601`)),
  body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('reason tối đa 500 ký tự'),
];

const flightStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
];

const updateFlightStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu trạng thái phải là object');
    const allowed = ['status', 'departure_time', 'arrival_time', 'actual_departure_time', 'actual_arrival_time', 'reason'];
    const extra = Object.keys(value).filter((key) => !allowed.includes(key));
    if (extra.length) throw new Error(`Không được phép truyền trường: ${extra.join(', ')}`);
    return true;
  }),
  body('status').notEmpty().isIn(FLIGHT_STATUSES).withMessage('status không hợp lệ'),
  ...['departure_time', 'arrival_time', 'actual_departure_time', 'actual_arrival_time']
    .map((field) => body(field).optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage(`${field} phải là thời gian ISO8601`)),
  body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('reason tối đa 500 ký tự'),
];

const cancelFlightValidator = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('reason').notEmpty().isString().trim().isLength({ min: 1, max: 500 }).withMessage('Vui lòng nhập lý do hủy chuyến'),
];

module.exports = {
  searchFlightValidator,
  createFlightValidator,
  updateFlightValidator,
  flightStatusValidator,
  updateFlightStatusValidator,
  cancelFlightValidator,
};
