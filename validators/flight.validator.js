const { body, query, param } = require('express-validator');
const FLIGHT_STATUSES = ['scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed'];

const SEARCH_QUERY_FIELDS = [
  'departure_airport_id', 'arrival_airport_id', 'airline_id', 'departure_date', 'min_seats', 'page', 'limit',
  'min_price', 'max_price', 'fare_class', 'departure_time_from', 'departure_time_to',
  'arrival_time_from', 'arrival_time_to', 'min_duration_minutes', 'max_duration_minutes', 'sort_by',
];

const searchFlightValidator = [
  query('*').custom((_value, { path }) => {
    if (!SEARCH_QUERY_FIELDS.includes(String(path).split('.')[0])) {
      throw new Error(`Unsupported search parameter: ${String(path).split('.')[0]}`);
    }
    return true;
  }),
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
  query('min_price').optional().isFloat({ min: 0, max: 9999999999.99 }).withMessage('min_price must be between 0 and 9999999999.99'),
  query('max_price').optional().isFloat({ min: 0, max: 9999999999.99 }).withMessage('max_price must be between 0 and 9999999999.99'),
  query('fare_class').optional().trim().isLength({ min: 1, max: 50 }).withMessage('fare_class must contain 1 to 50 characters'),
  query(['departure_time_from', 'departure_time_to', 'arrival_time_from', 'arrival_time_to'])
    .optional()
    .matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('Flight time filters must use HH:mm'),
  query('min_duration_minutes').optional().isInt({ min: 1, max: 1440 }).withMessage('min_duration_minutes must be between 1 and 1440'),
  query('max_duration_minutes').optional().isInt({ min: 1, max: 1440 }).withMessage('max_duration_minutes must be between 1 and 1440'),
  query('sort_by')
    .optional()
    .isIn(['price_low', 'price_high', 'departure_earliest', 'departure_latest', 'duration_shortest', 'arrival_earliest'])
    .withMessage('sort_by is not supported'),
  query('max_price').custom((value, { req }) => {
    if (value !== undefined && req.query.min_price !== undefined && Number(value) < Number(req.query.min_price)) {
      throw new Error('max_price must be greater than or equal to min_price');
    }
    return true;
  }),
  query('max_duration_minutes').custom((value, { req }) => {
    if (value !== undefined && req.query.min_duration_minutes !== undefined && Number(value) < Number(req.query.min_duration_minutes)) {
      throw new Error('max_duration_minutes must be greater than or equal to min_duration_minutes');
    }
    return true;
  }),
  query('departure_time_to').custom((value, { req }) => {
    if (value && req.query.departure_time_from && value < req.query.departure_time_from) {
      throw new Error('departure_time_to must be greater than or equal to departure_time_from');
    }
    return true;
  }),
  query('arrival_time_to').custom((value, { req }) => {
    if (value && req.query.arrival_time_from && value < req.query.arrival_time_from) {
      throw new Error('arrival_time_to must be greater than or equal to arrival_time_from');
    }
    return true;
  }),
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

// #27 Lịch chuyến bay dạng calendar
const CALENDAR_VIEWS = ['week', 'month'];
const CALENDAR_STATUS_VALUES = ['scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed'];
const CALENDAR_QUERY_FIELDS = ['view', 'date', 'status'];

const flightCalendarValidator = [
  // Chặn query param không được hỗ trợ
  query('*').custom((_value, { path }) => {
    const field = String(path).split('.')[0];
    if (!CALENDAR_QUERY_FIELDS.includes(field)) {
      throw new Error(`Tham số không được hỗ trợ: ${field}`);
    }
    return true;
  }),
  query('view')
    .optional()
    .isIn(CALENDAR_VIEWS)
    .withMessage("view phải là 'week' hoặc 'month'"),
  query('date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('date phải đúng định dạng YYYY-MM-DD')
    .custom((val) => {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) throw new Error('date không phải ngày hợp lệ');
      return true;
    }),
  query('status')
    .optional()
    .isIn(CALENDAR_STATUS_VALUES)
    .withMessage(`status phải là một trong: ${CALENDAR_STATUS_VALUES.join(', ')}`),
];

module.exports = {
  searchFlightValidator,
  SEARCH_QUERY_FIELDS,
  createFlightValidator,
  updateFlightValidator,
  flightStatusValidator,
  updateFlightStatusValidator,
  cancelFlightValidator,
  flightCalendarValidator,
};
