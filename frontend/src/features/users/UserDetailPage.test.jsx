import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { UserDetailPage } from './UserDetailPage';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const admin = { id: 1, email: 'admin@example.com', full_name: 'Admin', status: 'active', role: { id: 3, name: 'admin' } };
const target = { id: 9, email: 'user@example.com', full_name: 'Nguyễn Văn An', phone: '0912345678', status: 'active', role: { id: 1, name: 'customer' } };
const roles = [{ id: 1, name: 'customer' }, { id: 2, name: 'staff' }, { id: 3, name: 'admin' }];

const createFetch = ({ actor = admin, user = target, actionError } = {}) => vi.fn(async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url.endsWith('/auth/refresh-token')) return response({ success: true, data: { accessToken: 'access' } });
  if (url.endsWith('/auth/me')) return response({ success: true, data: actor });
  if (url.endsWith(`/users/${user.id}`) && method === 'GET') return response({ success: true, data: user });
  if (url.endsWith('/roles')) return response({ success: true, data: roles });
  if (actionError && method !== 'GET') return response({ success: false, message: actionError.message }, actionError.status);
  if (url.endsWith(`/users/${user.id}/status`)) return response({ success: true, data: { id: user.id, status: JSON.parse(options.body).status } });
  if (url.endsWith(`/users/${user.id}/role`)) return response({ success: true, data: { ...user, role: roles.find((role) => role.id === JSON.parse(options.body).role_id) } });
  if (url.endsWith(`/users/${user.id}`) && method === 'DELETE') return response({ success: true, data: { message: 'deleted' } });
  throw new Error(`Unexpected ${method} ${url}`);
});

const renderDetail = (fetchImpl, id = 9) => {
  sessionStorage.setItem('airline_refresh_token', 'refresh');
  return render(
    <AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[`/admin/users/${id}`]}><Routes>
      <Route path="/admin/users/:id" element={<UserDetailPage />} />
      <Route path="/admin/users" element={<h1>Quản lý người dùng</h1>} />
    </Routes></MemoryRouter></AuthProvider>
  );
};

describe('admin user detail', () => {
  it('loads detail and roles, then confirms status, role and delete actions', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderDetail(fetchImpl);
    expect(await screen.findByRole('heading', { name: 'Chi tiết người dùng' })).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));
    expect(await screen.findByText('Đã khóa tài khoản người dùng.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Vai trò'), '2');
    await user.click(screen.getByRole('button', { name: 'Cập nhật vai trò' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận đổi vai trò' }));
    expect(await screen.findByText('Vai trò người dùng đã được cập nhật.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xóa người dùng' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
  });

  it('keeps old data after an API conflict and explains the error in Vietnamese', async () => {
    const user = userEvent.setup();
    renderDetail(createFetch({ actionError: { status: 409, message: 'Conflict' } }));
    await screen.findByText('user@example.com');
    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));
    expect(await screen.findByText('Không thể hoàn tất vì dữ liệu đang được sử dụng hoặc đã thay đổi.')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
  });

  it('hides self-lock, self-role and self-delete controls', async () => {
    renderDetail(createFetch({ actor: admin, user: admin }), 1);
    expect(await screen.findByText('Bạn đang xem tài khoản quản trị của chính mình.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Khóa tài khoản|Xóa người dùng|Cập nhật vai trò/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('admin@example.com')).toBeInTheDocument());
  });
});
