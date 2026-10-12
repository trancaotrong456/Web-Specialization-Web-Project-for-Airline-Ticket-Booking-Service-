import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { UsersPage } from './UsersPage';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const admin = { id: 1, email: 'admin@example.com', full_name: 'Admin', role: { id: 3, name: 'admin' } };
const rows = [
  { id: 2, full_name: 'Nguyễn Văn An', email: 'an@example.com', phone: '0912345678', status: 'active', role: { id: 1, name: 'customer' } },
  { id: 3, full_name: 'Trần Bình', email: 'binh@example.com', phone: null, status: 'locked', role: { id: 2, name: 'staff' } },
];

const createFetch = ({ users = rows, failFirst = false, total = 42 } = {}) => {
  let failed = false;
  return vi.fn(async (url) => {
    if (url.endsWith('/auth/refresh-token')) return response({ success: true, data: { accessToken: 'access' } });
    if (url.endsWith('/auth/me')) return response({ success: true, data: admin });
    if (url.includes('/users?')) {
      if (failFirst && !failed) { failed = true; return response({ success: false, message: 'Tạm thời không thể tải dữ liệu' }, 500); }
      return response({ success: true, data: users, pagination: { total, page: Number(new URL(url, 'http://x').searchParams.get('page')), limit: 20, totalPages: Math.ceil(total / 20) } });
    }
    throw new Error(`Unexpected ${url}`);
  });
};

const renderPage = (fetchImpl, initial = '/admin/users') => {
  sessionStorage.setItem('airline_refresh_token', 'refresh');
  return render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[initial]}><UsersPage /></MemoryRouter></AuthProvider>);
};

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Browser Back</button><button onClick={() => navigate(1)}>Browser Forward</button><button onClick={() => navigate('/admin/users?search=an&page=2')}>External URL</button><output data-testid="location-search">{location.search}</output><UsersPage /></>;
}

describe('admin users list', () => {
  it('restores search on Back/Forward and never writes stale input over the restored URL', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    sessionStorage.setItem('airline_refresh_token', 'refresh');
    render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={['/admin/users?search=first', '/admin/users?search=second']} initialIndex={1}><HistoryControls /></MemoryRouter></AuthProvider>);
    expect(await screen.findByLabelText('Tìm kiếm người dùng')).toHaveValue('second');
    await user.click(screen.getByRole('button', { name: 'Browser Back' }));
    expect(await screen.findByLabelText('Tìm kiếm người dùng')).toHaveValue('first');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.getByTestId('location-search')).toHaveTextContent('?search=first');
    await user.click(screen.getByRole('button', { name: 'Browser Forward' }));
    expect(await screen.findByLabelText('Tìm kiếm người dùng')).toHaveValue('second');
    await user.type(screen.getByLabelText('Tìm kiếm người dùng'), '-typed');
    expect(screen.getByLabelText('Tìm kiếm người dùng')).toHaveValue('second-typed');
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('search=second-typed'));
  });

  it('cancels a pending typed search when external navigation restores even the same query', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    sessionStorage.setItem('airline_refresh_token', 'refresh');
    render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={['/admin/users?search=an&page=1']}><HistoryControls /></MemoryRouter></AuthProvider>);
    await user.type(await screen.findByLabelText('Tìm kiếm người dùng'), '-unfinished');
    await user.click(screen.getByRole('button', { name: 'External URL' }));
    expect(await screen.findByLabelText('Tìm kiếm người dùng')).toHaveValue('an');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.getByTestId('location-search')).toHaveTextContent('?search=an&page=2');
  });
  it('loads page 1, renders a table and mobile-labelled user cards, and paginates', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderPage(fetchImpl);

    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Danh sách người dùng' })).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Văn An').length).toBeGreaterThan(1);
    expect(screen.getByLabelText('Thẻ người dùng Nguyễn Văn An')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/users?page=1&limit=20'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Đi tới trang 2' }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
  });

  it('debounces search, resets page for a status filter, and keeps filters in the URL state', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderPage(fetchImpl, '/admin/users?page=2');
    await screen.findAllByText('Nguyễn Văn An');

    await user.type(screen.getByLabelText('Tìm kiếm người dùng'), 'an@example.com');
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('search=an%40example.com') && url.includes('page=1'))).toBe(true), { timeout: 1500 });
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'locked');
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('status=locked') && url.includes('page=1'))).toBe(true));
  });

  it('distinguishes an empty database from filtered no-results and supports retry after an error', async () => {
    const user = userEvent.setup();
    const failing = createFetch({ failFirst: true });
    renderPage(failing);
    expect(await screen.findByText('Tạm thời không thể tải dữ liệu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect((await screen.findAllByText('Nguyễn Văn An')).length).toBeGreaterThan(0);

    const empty = createFetch({ users: [], total: 0 });
    renderPage(empty);
    expect(await screen.findByText('Chưa có người dùng nào.')).toBeInTheDocument();

    const noResults = createFetch({ users: [], total: 0 });
    renderPage(noResults, '/admin/users?search=khongco');
    expect(await screen.findByText('Không tìm thấy người dùng phù hợp.')).toBeInTheDocument();
  });
});
