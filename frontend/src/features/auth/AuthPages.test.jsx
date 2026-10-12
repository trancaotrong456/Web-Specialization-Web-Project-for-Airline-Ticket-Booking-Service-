import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const success = (data) => jsonResponse({ success: true, data });

const pages = {
  '/login': <LoginPage />,
  '/register': <RegisterPage />,
  '/forgot-password': <ForgotPasswordPage />,
  '/reset-password': <ResetPasswordPage />,
};

const renderPage = (path, fetchImpl = vi.fn()) => render(
  <AuthProvider fetchImpl={fetchImpl}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {Object.entries(pages).map(([route, element]) => (
          <Route key={route} path={route} element={element} />
        ))}
        <Route path="/profile" element={<h1>Hồ sơ của tôi</h1>} />
        <Route path="/admin/users" element={<h1>Quản lý người dùng</h1>} />
      </Routes>
    </MemoryRouter>
  </AuthProvider>
);

describe('public authentication pages', () => {
  it('shows the requested aviation-focused login copy', () => {
    renderPage('/login');
    expect(screen.getByText('Hành trình của bạn bắt đầu từ đây.')).toBeInTheDocument();
    expect(screen.getByText('Đăng nhập để tiếp tục quản lý tài khoản và hành trình của bạn.')).toBeInTheDocument();
    expect(screen.getByText('SGN')).toBeInTheDocument();
    expect(screen.getByText('HAN')).toBeInTheDocument();
  });

  it('shows distinct registration copy and benefits without login copy', () => {
    renderPage('/register');
    expect(screen.getByText('Bắt đầu hành trình cùng Airline Booking')).toBeInTheDocument();
    expect(screen.getByText('Tạo tài khoản để trải nghiệm hệ thống thuận tiện và liền mạch hơn.')).toBeInTheDocument();
    expect(screen.getByText('Bảo mật tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Quản lý thông tin thuận tiện')).toBeInTheDocument();
    expect(screen.queryByText('Đăng nhập để quản lý hồ sơ...')).not.toBeInTheDocument();
  });

  it('shows aviation-focused recovery copy and home navigation', () => {
    renderPage('/forgot-password');
    expect(screen.getByText('Lấy lại quyền truy cập, tiếp tục hành trình.')).toBeInTheDocument();
    expect(screen.getByText('Nhập email đã đăng ký để nhận hướng dẫn khôi phục mật khẩu.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quên mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Về trang chủ/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute('href', '/login');
  });
  it('validates required login fields before making a request', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn();
    renderPage('/login', fetchImpl);

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('normalizes login email, forwards remember-me, and reveals password on request', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn().mockResolvedValue(success({
      user: { id: 1, email: 'admin@example.com', role: 'admin' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }));
    renderPage('/login', fetchImpl);

    await user.type(screen.getByLabelText('Email'), '  ADMIN@EXAMPLE.COM  ');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.click(screen.getByLabelText('Ghi nhớ đăng nhập'));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(requestBody).toEqual({ email: 'admin@example.com', password: 'secret123' });
    expect(window.localStorage.getItem('airline_refresh_token')).toBe('refresh-token');
  });

  it('disables the login submission while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveRequest;
    const fetchImpl = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    renderPage('/login', fetchImpl);
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByRole('button', { name: 'Đang đăng nhập…' })).toBeDisabled();
    resolveRequest(success({
      user: { id: 1, email: 'admin@example.com', role: 'admin' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }));
    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
  });

  it('rejects invalid optional phone and mismatched registration passwords', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn();
    renderPage('/register', fetchImpl);
    await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn An');
    await user.type(screen.getByLabelText('Email'), 'an@example.com');
    await user.type(screen.getByLabelText('Số điện thoại'), '12345');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'different123');

    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(screen.getByText('Số điện thoại Việt Nam không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shows backend field errors on registration without losing input', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      message: 'Validation failed',
      errors: [{ path: 'email', msg: 'Email is already registered' }],
    }, 409));
    renderPage('/register', fetchImpl);
    await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn An');
    await user.type(screen.getByLabelText('Email'), 'AN@EXAMPLE.COM');
    await user.type(screen.getByLabelText('Số điện thoại'), '0912345678');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'secret123');

    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Email is already registered')).toBeInTheDocument();
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn An');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      email: 'an@example.com',
      password: 'secret123',
      full_name: 'Nguyễn Văn An',
      phone: '0912345678',
    });
  });

  it('shows the same generic confirmation after a forgot-password request', async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn().mockResolvedValue(success({
      message: 'If the email is registered, password reset instructions will be sent.',
    }));
    renderPage('/forgot-password', fetchImpl);
    await user.type(screen.getByLabelText('Email'), 'UNKNOWN@EXAMPLE.COM');

    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

    expect(await screen.findByText('Nếu email đã được đăng ký, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư.')).toBeInTheDocument();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ email: 'unknown@example.com' });
  });

  it('blocks reset submission when the URL has no reset token', async () => {
    renderPage('/reset-password');

    expect(screen.getByRole('alert')).toHaveTextContent(/hết hạn/);
    expect(screen.getByRole('button', { name: 'Đặt lại mật khẩu' })).toBeDisabled();
  });

  it('submits the URL token and new password when resetting a password', async () => {
    const user = userEvent.setup();
    const token = 'a'.repeat(64);
    const fetchImpl = vi.fn().mockResolvedValue(success({
      message: 'Password reset successfully. Please log in again.',
    }));
    renderPage(`/reset-password?token=${token}`, fetchImpl);
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'newsecret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'newsecret123');

    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText('Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.')).toBeInTheDocument();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      token,
      new_password: 'newsecret123',
    });
  });
});
