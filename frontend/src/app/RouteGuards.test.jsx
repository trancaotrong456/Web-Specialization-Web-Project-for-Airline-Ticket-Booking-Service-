import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminRoute } from './AdminRoute';
import { AuthProvider } from './AuthProvider';
import { AppRoutes } from './AppRouter';
import { ProtectedRoute } from './ProtectedRoute';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const success = (data) => jsonResponse({ success: true, data });

const authenticatedFetch = (role) => vi.fn(async (url) => {
  if (url.endsWith('/auth/refresh-token')) return success({ accessToken: `${role}-access` });
  if (url.endsWith('/auth/me')) return success({ id: 1, email: `${role}@example.com`, role: { name: role } });
  if (url.includes('/users?')) return jsonResponse({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  throw new Error(`Unexpected request: ${url}`);
});

const renderRoutes = ({ initialEntry, fetchImpl, token, children }) => {
  if (token) window.sessionStorage.setItem('airline_refresh_token', token);
  return render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {children}
      </MemoryRouter>
    </AuthProvider>
  );
};

describe('authentication route guards', () => {
  it('keeps protected content hidden while the stored session is loading', () => {
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    renderRoutes({
      initialEntry: '/profile',
      fetchImpl,
      token: 'stored-refresh',
      children: (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<h1>Hồ sơ</h1>} />
          </Route>
        </Routes>
      ),
    });

    expect(screen.getByRole('status')).toHaveTextContent('Đang xác thực');
    expect(screen.queryByRole('heading', { name: 'Hồ sơ' })).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor to login and preserves the requested location', async () => {
    renderRoutes({
      initialEntry: '/profile',
      fetchImpl: vi.fn(),
      children: (
        <Routes>
          <Route path="/login" element={<h1>Đăng nhập</h1>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<h1>Hồ sơ</h1>} />
          </Route>
        </Routes>
      ),
    });

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('allows an authenticated customer to open the profile route', async () => {
    renderRoutes({
      initialEntry: '/profile',
      fetchImpl: authenticatedFetch('customer'),
      token: 'stored-refresh',
      children: (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<h1>Hồ sơ của tôi</h1>} />
          </Route>
        </Routes>
      ),
    });

    expect(await screen.findByRole('heading', { name: 'Hồ sơ của tôi' })).toBeInTheDocument();
  });

  it('shows 403 without rendering admin content for a customer', async () => {
    renderRoutes({
      initialEntry: '/admin/users',
      fetchImpl: authenticatedFetch('customer'),
      token: 'stored-refresh',
      children: (
        <Routes>
          <Route path="/forbidden" element={<h1>Không có quyền truy cập</h1>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<h1>Danh sách người dùng</h1>} />
            </Route>
          </Route>
        </Routes>
      ),
    });

    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Danh sách người dùng' })).not.toBeInTheDocument();
  });

  it('allows an administrator to open admin content', async () => {
    renderRoutes({
      initialEntry: '/admin/users',
      fetchImpl: authenticatedFetch('admin'),
      token: 'stored-refresh',
      children: (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<h1>Danh sách người dùng</h1>} />
            </Route>
          </Route>
        </Routes>
      ),
    });

    expect(await screen.findByRole('heading', { name: 'Danh sách người dùng' })).toBeInTheDocument();
  });

  it.each([
    ['admin', 'Quản lý người dùng'],
    ['customer', 'Hồ sơ cá nhân'],
  ])('redirects an authenticated %s away from public auth pages', async (role, destination) => {
    renderRoutes({
      initialEntry: '/login',
      fetchImpl: authenticatedFetch(role),
      token: 'stored-refresh',
      children: <AppRoutes />,
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: destination })).toBeInTheDocument();
    });
  });
});
