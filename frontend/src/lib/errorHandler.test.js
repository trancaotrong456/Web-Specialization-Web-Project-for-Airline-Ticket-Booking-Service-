import { describe, expect, it } from 'vitest';
import { extractFieldErrors, formatFriendlyError, translateErrorMessage } from './errorHandler';

describe('translateErrorMessage', () => {
  it('translates raw validation errors to friendly Vietnamese with instructions', () => {
    expect(translateErrorMessage('Validation error')).toContain('Dữ liệu nhập vào chưa hợp lệ');
    expect(translateErrorMessage('Validation failed')).toContain('Dữ liệu nhập vào chưa hợp lệ');
  });

  it('translates Booking not found and guides action', () => {
    const result = translateErrorMessage('Booking not found');
    expect(result).toBe('Không tìm thấy đặt chỗ này. Kiểm tra lại mã đặt chỗ hoặc quay về danh sách.');
  });

  it('translates Payment not found', () => {
    const result = translateErrorMessage('Payment not found');
    expect(result).toContain('Không tìm thấy giao dịch thanh toán này');
  });

  it('translates Flight not found', () => {
    const result = translateErrorMessage('Flight not found');
    expect(result).toBe('Chuyến bay không tồn tại hoặc đã bị hủy. Vui lòng chọn chuyến bay khác.');
  });

  it('translates User and Role not found', () => {
    expect(translateErrorMessage('User not found')).toContain('Không tìm thấy tài khoản');
    expect(translateErrorMessage('Role not found')).toContain('Không tìm thấy vai trò');
  });

  it('translates auth and credentials errors', () => {
    expect(translateErrorMessage('Invalid credentials')).toContain('Email hoặc mật khẩu không chính xác');
    expect(translateErrorMessage('Unauthorized')).toContain('chưa đăng nhập');
  });

  it('provides status code fallback when message is generic', () => {
    expect(translateErrorMessage('', 404)).toContain('Không tìm thấy dữ liệu yêu cầu');
    expect(translateErrorMessage('', 401)).toContain('đăng nhập');
    expect(translateErrorMessage('', 403)).toContain('không có quyền');
  });
});

describe('extractFieldErrors', () => {
  it('extracts field errors with path and msg format', () => {
    const errors = [
      { path: 'email', msg: 'Email không hợp lệ.' },
      { path: 'phone', msg: 'Số điện thoại không đúng.' },
    ];
    expect(extractFieldErrors(errors)).toEqual({
      email: 'Email không hợp lệ.',
      phone: 'Số điện thoại không đúng.',
    });
  });

  it('extracts field errors with field and message format', () => {
    const errors = [
      { field: 'full_name', message: 'Họ tên bắt buộc.' },
    ];
    expect(extractFieldErrors(errors)).toEqual({
      full_name: 'Họ tên bắt buộc.',
    });
  });

  it('returns empty object when no errors', () => {
    expect(extractFieldErrors(null)).toEqual({});
    expect(extractFieldErrors([])).toEqual({});
  });
});

describe('formatFriendlyError', () => {
  it('formats an ApiError object into friendly Vietnamese and field errors', () => {
    const error = {
      message: 'Validation failed',
      status: 422,
      errors: [{ path: 'email', msg: 'Email không hợp lệ.' }],
    };
    const result = formatFriendlyError(error);
    expect(result.message).toContain('Dữ liệu nhập vào chưa hợp lệ');
    expect(result.fieldErrors.email).toBe('Email không hợp lệ.');
  });
});
