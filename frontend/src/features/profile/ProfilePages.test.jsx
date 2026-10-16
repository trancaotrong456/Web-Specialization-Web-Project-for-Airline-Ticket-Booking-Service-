import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { LoginPage } from '../auth/LoginPage';
import { ProfilePage } from './ProfilePage';
import { SecurityPage } from './SecurityPage';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const success = (data) => jsonResponse({ success: true, data });

const profile = {
  id: 12,
  email: 'an@example.com',
  full_name: 'Nguyễn Văn An',
  phone: '0912345678',
  role: { id: 1, name: 'customer' },
};

const createProfileFetch = ({ updateResponse, passwordResponse, logoutResponse } = {}) => vi.fn(async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url.endsWith('/auth/refresh-token')) return success({ accessToken: 'access-token' });
  if (url.endsWith('/auth/me') && method === 'GET') return success(profile);
  if (url.endsWith('/auth/me') && method === 'PUT') {
    return updateResponse || success({ ...profile, ...JSON.parse(options.body) });
  }
  if (url.endsWith('/auth/change-password')) {
    return passwordResponse || success({ message: 'Password changed successfully' });
  }
  if (url.endsWith('/auth/logout')) return logoutResponse || success({ message: 'Logged out successfully' });
  throw new Error(`Unexpected request: ${method} ${url}`);
});

const renderProfileRoute = (path, fetchImpl) => {
  window.sessionStorage.setItem('airline_refresh_token', 'refresh-token');
  return render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/security" element={<SecurityPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
};

describe('profile and security pages', () => {
  it('shows read-only email and sends only editable profile fields', async () => {
    const user = userEvent.setup();
    const fetchImpl = createProfileFetch();
    renderProfileRoute('/profile', fetchImpl);

    expect(await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('an@example.com');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    await user.clear(screen.getByLabelText('Họ và tên'));
    await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn An');
    await user.clear(screen.getByLabelText('Số điện thoại'));
    await user.type(screen.getByLabelText('Số điện thoại'), '0987654321');

    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Thông tin hồ sơ đã được cập nhật.')).toBeInTheDocument();
    const updateCall = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/auth/me') && options.method === 'PUT');
    expect(JSON.parse(updateCall[1].body)).toEqual({
      full_name: 'Nguyễn An',
      phone: '0987654321',
    });
  });

  it('renders backend field errors and keeps the edited profile values', async () => {
    const user = userEvent.setup();
    const updateResponse = jsonResponse({
      success: false,
      message: 'Validation failed',
      errors: [{ path: 'phone', msg: 'Must be a valid phone number' }],
    }, 422);
    renderProfileRoute('/profile', createProfileFetch({ updateResponse }));
    expect(await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Số điện thoại'));
    await user.type(screen.getByLabelText('Số điện thoại'), '0911111111');

    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Must be a valid phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0911111111');
  });

  it('validates current, new, and confirmation passwords locally', async () => {
    const user = userEvent.setup();
    const fetchImpl = createProfileFetch();
    renderProfileRoute('/profile/security', fetchImpl);
    expect(await screen.findByRole('heading', { name: 'Bảo mật tài khoản' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu mới.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'oldsecret');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'newsecret');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'different');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/auth/change-password'))).toBe(false);
  });

  it('forces a clean logout after a successful password change', async () => {
    const user = userEvent.setup();
    const fetchImpl = createProfileFetch();
    renderProfileRoute('/profile/security', fetchImpl);
    expect(await screen.findByRole('heading', { name: 'Bảo mật tài khoản' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'oldsecret');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'newsecret');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'newsecret');

    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('airline_refresh_token')).toBeNull();
    const passwordCall = fetchImpl.mock.calls.find(([url]) => url.endsWith('/auth/change-password'));
    expect(JSON.parse(passwordCall[1].body)).toEqual({
      current_password: 'oldsecret',
      new_password: 'newsecret',
    });
  });

  it('logs out from the account header and removes local credentials', async () => {
    const user = userEvent.setup();
    const fetchImpl = createProfileFetch();
    renderProfileRoute('/profile', fetchImpl);
    expect(await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Nguyễn Văn An/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/auth/logout'))).toBe(true));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('airline_refresh_token')).toBeNull();
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/auth/logout'))).toBe(true));
  });
});
