const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VI_PHONE_PATTERN = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

export const normalizeEmail = (value) => value.trim().toLowerCase();

export const mapApiFieldErrors = (errors) => (Array.isArray(errors) ? errors : []).reduce((result, error) => {
  if (error?.path && error?.msg) result[error.path] = error.msg;
  return result;
}, {});

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,49}$/;
const ROLE_NAME_ERROR = 'Tên vai trò chỉ gồm chữ thường, số, dấu gạch ngang hoặc gạch dưới; bắt đầu bằng chữ thường và dài 2–50 ký tự.';

export const validateRoleName = (name) => ROLE_NAME_PATTERN.test(name) ? null : ROLE_NAME_ERROR;

const validateEmail = (email) => {
  if (!email.trim()) return 'Vui lòng nhập email.';
  if (!EMAIL_PATTERN.test(normalizeEmail(email))) return 'Email không hợp lệ.';
  return null;
};

const validatePassword = (password, label = 'Mật khẩu') => {
  if (!password) return `Vui lòng nhập ${label.toLowerCase()}.`;
  if (password.length < 6) return `${label} phải có ít nhất 6 ký tự.`;
  if (new TextEncoder().encode(password).length > 72) return `${label} không được vượt quá 72 byte.`;
  return null;
};

export const validateLogin = ({ email, password }) => ({
  ...(validateEmail(email) ? { email: validateEmail(email) } : {}),
  ...(!password ? { password: 'Vui lòng nhập mật khẩu.' } : {}),
});

export const validateRegister = ({ full_name, email, phone, password, password_confirmation }) => {
  const errors = {};
  const trimmedName = full_name.trim();
  if (!trimmedName) errors.full_name = 'Vui lòng nhập họ và tên.';
  else if (trimmedName.length < 2 || trimmedName.length > 100) errors.full_name = 'Họ và tên phải từ 2 đến 100 ký tự.';
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (phone.trim() && !VI_PHONE_PATTERN.test(phone.trim().replace(/[\s.-]/g, ''))) {
    errors.phone = 'Số điện thoại Việt Nam không hợp lệ.';
  }
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (password_confirmation !== password) errors.password_confirmation = 'Mật khẩu xác nhận không khớp.';
  return errors;
};

export const validateForgotPassword = ({ email }) => {
  const error = validateEmail(email);
  return error ? { email: error } : {};
};

export const validateResetPassword = ({ new_password, password_confirmation }) => {
  const errors = {};
  const passwordError = validatePassword(new_password, 'Mật khẩu mới');
  if (passwordError) errors.new_password = passwordError;
  if (password_confirmation !== new_password) errors.password_confirmation = 'Mật khẩu xác nhận không khớp.';
  return errors;
};
