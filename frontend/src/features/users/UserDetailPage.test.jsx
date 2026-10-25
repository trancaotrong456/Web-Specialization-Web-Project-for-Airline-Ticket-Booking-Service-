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

const createFetch = ({ actor = admin, user = target, actionError, roleOptions = roles } = {}) => vi.fn(async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url.endsWith('/auth/refresh-token')) return response({ success: true, data: { accessToken: 'access' } });
  if (url.endsWith('/auth/me')) return response({ success: true, data: actor });
  if (url.endsWith(`/users/${user.id}`) && method === 'GET') return response({ success: true, data: user });
  if (actionError && method === 'PATCH') return response({ success: false, message: actionError.message }, actionError.status);
  if (url.endsWith(`/users/${user.id}`) && method === 'PATCH') {
    const profile = JSON.parse(options.body);
    return response({ success: true, data: { ...user, ...profile } });
  }
  if (url.endsWith('/roles')) return response({ success: true, data: roleOptions });
  if (actionError && method !== 'GET') return response({ success: false, message: actionError.message }, actionError.status);
  if (url.endsWith(`/users/${user.id}/status`)) return response({ success: true, data: { id: user.id, status: JSON.parse(options.body).status } });
  if (url.endsWith(`/users/${user.id}/role`)) return response({ success: true, data: { ...user, role: roleOptions.find((role) => role.id === JSON.parse(options.body).role_id) } });
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
  it('allows an admin to edit only profile fields and refreshes the displayed details', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderDetail(fetchImpl);
    await screen.findByText('user@example.com');

    await user.click(screen.getByRole('button', { name: 'Chỉnh sửa thông tin' }));
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn An');
    expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0912345678');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Họ và tên'));
    await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Minh Anh');
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(await screen.findByText('Thông tin người dùng đã được cập nhật.')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Minh Anh')).toBeInTheDocument();
    const update = fetchImpl.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(update[1].body)).toEqual({ full_name: 'Nguyễn Minh Anh', phone: '0912345678' });
  });

  it('keeps edits after an API validation error and cancels without changing displayed details', async () => {
    const user = userEvent.setup();
    renderDetail(createFetch({ actionError: { status: 422, message: 'Số điện thoại không hợp lệ.' } }));
    await screen.findByText('user@example.com');
    await user.click(screen.getByRole('button', { name: 'Chỉnh sửa thông tin' }));
    await user.clear(screen.getByLabelText('Họ và tên'));
    await user.type(screen.getByLabelText('Họ và tên'), 'Tên đang sửa');
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));

    expect(await screen.findByText('Số điện thoại không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Tên đang sửa');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
  });

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

  it('offers only supported RBAC roles and does not submit unchanged assignments', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch({ roleOptions: [...roles, { id: 7, name: 'support' }] });
    renderDetail(fetchImpl);
    await screen.findByText('user@example.com');

    expect(screen.queryByRole('option', { name: 'support' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật vai trò' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Vai trò'), '2');
    expect(screen.getByRole('button', { name: 'Cập nhật vai trò' })).toBeEnabled();
  });

  it('requires selecting a supported role when editing an existing custom role', async () => {
    renderDetail(createFetch({
      user: { ...target, role: { id: 7, name: 'support' } },
      roleOptions: [...roles, { id: 7, name: 'support' }],
    }));
    await screen.findByText('user@example.com');
    expect(screen.getByLabelText('Vai trò')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Cập nhật vai trò' })).toBeDisabled();
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
