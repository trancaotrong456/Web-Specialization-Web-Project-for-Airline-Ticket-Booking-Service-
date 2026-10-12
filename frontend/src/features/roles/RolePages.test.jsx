import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { RoleDetailPage } from './RoleDetailPage';
import { RolesPage } from './RolesPage';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data) => response({ success: true, data });
const admin = { id: 1, email: 'admin@example.com', full_name: 'Admin', role: { id: 3, name: 'admin' } };
const roles = [
  { id: 1, name: 'customer', description: 'Khách hàng' },
  { id: 2, name: 'staff', description: 'Nhân viên' },
  { id: 3, name: 'admin', description: 'Quản trị viên' },
  { id: 4, name: 'support', description: 'Hỗ trợ khách hàng' },
];

const createFetch = ({ createConflict = false, deleteConflict = false } = {}) => vi.fn(async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url.endsWith('/auth/refresh-token')) return ok({ accessToken: 'access' });
  if (url.endsWith('/auth/me')) return ok(admin);
  if (url.endsWith('/roles') && method === 'GET') return ok(roles);
  if (url.endsWith('/roles') && method === 'POST') {
    if (createConflict) return response({ success: false, message: 'Role name already exists' }, 409);
    return ok({ id: 5, ...JSON.parse(options.body) });
  }
  const roleId = Number(url.split('/').pop());
  const role = roles.find((item) => item.id === roleId);
  if (url.includes('/roles/') && method === 'GET') return ok(role);
  if (url.includes('/roles/') && method === 'PUT') return ok({ ...role, ...JSON.parse(options.body) });
  if (url.includes('/roles/') && method === 'DELETE') {
    if (deleteConflict) return response({ success: false, message: 'Cannot delete a role that is assigned to users' }, 409);
    return ok({ id: roleId });
  }
  throw new Error(`Unexpected ${method} ${url}`);
});

const renderRoles = (fetchImpl, entry = '/admin/roles') => {
  sessionStorage.setItem('airline_refresh_token', 'refresh');
  return render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/admin/roles" element={<RolesPage />} />
    <Route path="/admin/roles/:id" element={<RoleDetailPage />} />
  </Routes></MemoryRouter></AuthProvider>);
};

describe('admin role management', () => {
  it('lists roles and creates a lowercase trimmed custom role with only supported fields', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoles(fetchImpl);
    expect(await screen.findByRole('heading', { name: 'Quản lý vai trò' })).toBeInTheDocument();
    expect(screen.getByText('customer')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên vai trò mới'), '  SUPPORT_LEAD  ');
    await user.type(screen.getByLabelText('Mô tả vai trò mới'), 'Điều phối hỗ trợ');
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }));
    expect(await screen.findByText('Vai trò đã được tạo.')).toBeInTheDocument();
    const call = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/roles') && options.method === 'POST');
    expect(JSON.parse(call[1].body)).toEqual({ name: 'support_lead', description: 'Điều phối hỗ trợ' });
  });

  it('validates role names using the API format before creating', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoles(fetchImpl);
    await screen.findByText('customer');
    const name = screen.getByLabelText('Tên vai trò mới');
    await user.type(name, 'support lead');
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }));

    expect(await screen.findByText('Tên vai trò chỉ gồm chữ thường, số, dấu gạch ngang hoặc gạch dưới; bắt đầu bằng chữ thường và dài 2–50 ký tự.')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/roles') && options.method === 'POST')).toBe(false);
  });

  it('shows clear duplicate-name feedback without clearing the form', async () => {
    const user = userEvent.setup();
    renderRoles(createFetch({ createConflict: true }));
    await screen.findByText('customer');
    await user.type(screen.getByLabelText('Tên vai trò mới'), 'support');
    await user.click(screen.getByRole('button', { name: 'Thêm vai trò' }));
    expect(await screen.findByText('Tên vai trò đã tồn tại.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên vai trò mới')).toHaveValue('support');
  });

  it('renames and deletes a custom role after confirmation', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoles(fetchImpl, '/admin/roles/4');
    expect(await screen.findByRole('heading', { name: 'Chi tiết vai trò' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Tên vai trò'));
    await user.type(screen.getByLabelText('Tên vai trò'), 'Customer_Support');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Vai trò đã được cập nhật.')).toBeInTheDocument();
    const update = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/roles/4') && options.method === 'PUT');
    expect(JSON.parse(update[1].body).name).toBe('customer_support');

    await user.click(screen.getByRole('button', { name: 'Xóa vai trò' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(await screen.findByRole('heading', { name: 'Quản lý vai trò' })).toBeInTheDocument();
  });

  it('protects system roles and explains an assigned-role delete conflict', async () => {
    const user = userEvent.setup();
    renderRoles(createFetch(), '/admin/roles/1');
    expect(await screen.findByText('Đây là vai trò hệ thống; không thể đổi tên hoặc xóa.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa vai trò' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tên vai trò')).not.toBeInTheDocument();

    const conflictFetch = createFetch({ deleteConflict: true });
    renderRoles(conflictFetch, '/admin/roles/4');
    await screen.findAllByRole('heading', { name: 'Chi tiết vai trò' });
    const buttons = screen.getAllByRole('button', { name: 'Xóa vai trò' });
    await user.click(buttons.at(-1));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(await screen.findByText('Không thể xóa vai trò đang được gán cho người dùng.')).toBeInTheDocument();
  });
});
