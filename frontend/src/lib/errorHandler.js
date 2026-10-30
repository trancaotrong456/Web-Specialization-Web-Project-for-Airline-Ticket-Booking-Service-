/**
 * serene_flightways - Error translation and action guidance module
 * Translates raw backend errors into friendly Vietnamese with actionable next steps.
 */

const ERROR_MESSAGE_MAP = {
  // Booking related
  'Booking not found': 'Không tìm thấy đặt chỗ này. Kiểm tra lại mã đặt chỗ hoặc quay về danh sách.',
  'Booking not found with this code': 'Không tìm thấy đặt chỗ với mã này. Vui lòng kiểm tra lại mã đặt chỗ (PNR) và thông tin liên hệ.',
  'Booking hold has expired': 'Thời gian giữ chỗ đã hết hạn. Vui lòng chọn lại chuyến bay để đặt chỗ mới.',
  'Hold expired': 'Thời gian giữ chỗ đã hết hạn. Vui lòng chọn lại chuyến bay để đặt chỗ mới.',
  'Booking is already confirmed': 'Đặt chỗ này đã được xác nhận trước đó. Vui lòng kiểm tra danh sách vé.',
  'Booking is cancelled': 'Đặt chỗ này đã bị hủy. Bạn có thể tìm và đặt chuyến bay mới.',
  'Cannot cancel confirmed booking': 'Không thể hủy đặt chỗ đã xác nhận trực tuyến. Vui lòng liên hệ tổng đài hỗ trợ.',

  // Validation related
  'Validation error': 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu đỏ hoặc hướng dẫn bên dưới.',
  'Validation failed': 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu đỏ hoặc hướng dẫn bên dưới.',
  'Dữ liệu không hợp lệ': 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại các thông tin đã điền.',

  // Payment related
  'Payment not found': 'Không tìm thấy giao dịch thanh toán này. Vui lòng kiểm tra lại mã giao dịch hoặc quay về danh sách.',
  'Payment already completed': 'Giao dịch này đã được thanh toán thành công trước đó.',
  'Payment expired': 'Giao dịch thanh toán đã hết hạn. Vui lòng tạo giao dịch mới hoặc chọn phương thức khác.',

  // Flight & Seat related
  'Flight not found': 'Chuyến bay không tồn tại hoặc đã bị hủy. Vui lòng chọn chuyến bay khác.',
  'Fare class not found': 'Không tìm thấy hạng vé này cho chuyến bay. Vui lòng chọn hạng vé khác.',
  'No available seats': 'Chuyến bay không còn đủ số ghế trống yêu cầu. Vui lòng chọn chuyến bay khác.',
  'Not enough seats available': 'Chuyến bay không còn đủ số ghế trống yêu cầu. Vui lòng giảm số hành khách hoặc chọn chuyến khác.',
  'Seat already reserved': 'Ghế này vừa được hành khách khác chọn. Vui lòng chọn vị trí ghế khác.',
  'Current seat map template not found': 'Không tìm thấy mẫu sơ đồ ghế phù hợp cho loại máy bay này.',

  // Ancillaries related
  'Ancillary service not found': 'Không tìm thấy dịch vụ bổ sung này. Vui lòng kiểm tra lại danh mục dịch vụ.',
  'Ancillary offer not found': 'Gói dịch vụ bổ sung không còn khả dụng hoặc đã hết chỗ.',

  // Auth & Permissions
  'Invalid credentials': 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại thông tin đăng nhập.',
  'Invalid email or password': 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại thông tin đăng nhập.',
  'User not found': 'Không tìm thấy tài khoản người dùng này. Vui lòng kiểm tra lại thông tin.',
  'Role not found': 'Không tìm thấy vai trò này. Vui lòng kiểm tra lại danh sách vai trò.',
  'Airline not found': 'Không tìm thấy hãng hàng không này. Vui lòng kiểm tra lại danh mục.',
  'Airport not found': 'Không tìm thấy sân bay này. Vui lòng kiểm tra lại mã sân bay.',
  'Promotion not found': 'Mã khuyến mại không tồn tại hoặc đã hết hiệu lực. Vui lòng thử mã khác.',
  'Promotion code not found': 'Mã khuyến mại không tồn tại hoặc đã hết hiệu lực. Vui lòng thử mã khác.',
  'Unauthorized': 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại để tiếp tục.',
  'Access denied': 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ quản trị viên.',
  'Forbidden': 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ quản trị viên.',

  // Network & system
  'Failed to fetch': 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
  'NetworkError when attempting to fetch resource.': 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
  'Internal server error': 'Hệ thống đang gặp sự cố tạm thời. Vui lòng thử lại sau ít phút.',
};

/**
 * Translates an English or raw error message into friendly Vietnamese with action instructions.
 * @param {string} rawMessage
 * @param {number} [statusCode]
 * @returns {string}
 */
export function translateErrorMessage(rawMessage, statusCode) {
  if (!rawMessage && !statusCode) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  const trimmed = typeof rawMessage === 'string' ? rawMessage.trim() : '';

  if (ERROR_MESSAGE_MAP[trimmed]) {
    return ERROR_MESSAGE_MAP[trimmed];
  }

  // Check case-insensitive or partial match
  const lower = trimmed.toLowerCase();
  for (const [key, translated] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (key.toLowerCase() === lower) {
      return translated;
    }
  }

  if (lower.includes('validation error') || lower.includes('validation failed')) {
    return 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu đỏ hoặc hướng dẫn bên dưới.';
  }
  if (lower.includes('booking not found')) {
    return 'Không tìm thấy đặt chỗ này. Kiểm tra lại mã đặt chỗ hoặc quay về danh sách.';
  }
  if (lower.includes('payment not found')) {
    return 'Không tìm thấy giao dịch thanh toán này. Vui lòng kiểm tra lại mã giao dịch hoặc quay về danh sách.';
  }
  if (lower.includes('flight not found')) {
    return 'Chuyến bay không tồn tại hoặc đã bị hủy. Vui lòng chọn chuyến bay khác.';
  }
  if (lower.includes('user not found')) {
    return 'Không tìm thấy tài khoản người dùng này. Vui lòng kiểm tra lại thông tin.';
  }
  if (lower.includes('role not found')) {
    return 'Không tìm thấy vai trò này. Vui lòng kiểm tra lại danh sách vai trò.';
  }
  if (lower.includes('promotion') && lower.includes('not found')) {
    return 'Mã khuyến mại không tồn tại hoặc đã hết hiệu lực. Vui lòng thử mã khác.';
  }

  // Only fallback by HTTP status code if backend returned no specific message
  if (!trimmed) {
    if (statusCode === 404) {
      return 'Không tìm thấy dữ liệu yêu cầu. Vui lòng kiểm tra lại mã tra cứu hoặc quay về danh sách.';
    }
    if (statusCode === 401) {
      return 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.';
    }
    if (statusCode === 403) {
      return 'Bạn không có quyền thực hiện thao tác này. Vui lòng kiểm tra lại quyền tài khoản.';
    }
    if (statusCode === 422 || statusCode === 400) {
      return 'Dữ liệu nhập vào chưa hợp lệ. Vui lòng kiểm tra lại các trường thông tin bên dưới.';
    }
    if (statusCode === 409) {
      return 'Dữ liệu bị trùng lặp hoặc xung đột với trạng thái hiện tại.';
    }
    if (statusCode >= 500) {
      return 'Hệ thống đang bận hoặc gặp sự cố xử lý. Vui lòng thử lại sau ít phút.';
    }
  }

  return trimmed || 'Yêu cầu không thể hoàn tất. Vui lòng thử lại.';
}

/**
 * Extracts and maps field-level errors from an array of errors returned by the backend.
 * @param {Array<{field?: string, path?: string, message?: string, msg?: string}>|null} errors
 * @returns {Record<string, string>}
 */
export function extractFieldErrors(errors) {
  if (!Array.isArray(errors)) return {};
  const fieldErrors = {};
  for (const item of errors) {
    const key = item?.path || item?.field;
    const msg = item?.msg || item?.message || 'Thông tin chưa hợp lệ.';
    if (key) {
      fieldErrors[key] = msg;
    }
  }
  return fieldErrors;
}

/**
 * Normalizes any error object into friendly presentation format.
 * @param {any} error
 * @param {string} [fallback]
 * @returns {{ message: string, fieldErrors: Record<string, string>, rawErrors: Array<any> }}
 */
export function formatFriendlyError(error, fallback = 'Yêu cầu không thể hoàn tất.') {
  if (!error) return { message: '', fieldErrors: {}, rawErrors: [] };
  const rawMessage = typeof error === 'string' ? error : error?.message || fallback;
  const status = error?.status || error?.statusCode;
  const rawErrors = Array.isArray(error?.errors) ? error.errors : [];
  const message = translateErrorMessage(rawMessage, status);
  const fieldErrors = extractFieldErrors(rawErrors);
  return { message, fieldErrors, rawErrors };
}
