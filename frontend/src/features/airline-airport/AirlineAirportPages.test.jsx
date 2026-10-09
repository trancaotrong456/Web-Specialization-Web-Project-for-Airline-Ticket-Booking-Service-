import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const page = (data, currentPage = 1, limit = 20, total = data.length) => ({
  data,
  pagination: { total, page: currentPage, limit, totalPages: Math.max(1, Math.ceil(total / limit)), hasNextPage: currentPage * limit < total, hasPrevPage: currentPage > 1 },
});

const airline = { id: 3, name: 'Vietnam Airlines', iata_code: 'VN', logo_url: 'https://airline.test/vn.png', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' };
const airport = { id: 8, iata_code: 'SGN', name: 'Tân Sơn Nhất', city: 'Hồ Chí Minh', country: 'Việt Nam', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

function renderAs(role, path, onRequest) {
  sessionStorage.setItem('airline_refresh_token', 'refresh-token');
  const fetchImpl = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'access-token' });
    if (url.endsWith('/auth/me')) return json({ id: 4, email: `${role}@example.com`, role: { name: role } });
    const result = await onRequest(url, options);
    return result instanceof Response ? result : json(result);
  });
  render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></AuthProvider>);
  return fetchImpl;
}

describe('Airline and Airport administration', () => {
  it('loads Airline list from the real search and pagination contract', async () => {
    const fetch = renderAs('admin', '/admin/airlines?search=vietnam&page=2&limit=10', (url) => {
      if (url.includes('/airlines?')) return page([airline], 2, 10, 21);
      throw new Error(`Unexpected request ${url}`);
    });

    expect(await screen.findByRole('heading', { name: 'Quản lý hãng hàng không' })).toBeInTheDocument();
    expect((await screen.findAllByText('Vietnam Airlines')).length).toBeGreaterThan(0);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/airlines?page=2&limit=10&search=vietnam'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Đi tới trang 3' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/airlines?page=3&limit=10&search=vietnam'))).toBe(true));
  });

  it('previews Airline logo and shows a fallback when the image URL fails', async () => {
    renderAs('admin', '/admin/airlines/3/edit', (url) => {
      if (url.endsWith('/airlines/3')) return airline;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa hãng hàng không' })).toBeInTheDocument();
    const preview = screen.getByRole('img', { name: 'Xem trước logo hãng hàng không' });
    expect(preview).toHaveAttribute('src', 'https://airline.test/vn.png');
    fireEvent.error(preview);
    expect(await screen.findByText('VN')).toBeInTheDocument();
  });

  it('creates Airline with normalized IATA code and optional logo URL only', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airlines/new', (url, options) => {
      if (url.endsWith('/airlines') && options.method === 'POST') return { ...airline, id: 9 };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Thêm hãng hàng không' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên hãng hàng không'), 'Pacific Air');
    await user.type(screen.getByLabelText('Mã IATA'), 'pa');
    await user.type(screen.getByLabelText('Logo URL (không bắt buộc)'), 'https://airline.test/pa.png');
    await user.click(screen.getByRole('button', { name: 'Tạo hãng hàng không' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airlines') && options.method === 'POST')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/airlines') && candidate.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'Pacific Air', iata_code: 'PA', logo_url: 'https://airline.test/pa.png' });
  });

  it('updates Airline fields through the documented PUT endpoint', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airlines/3/edit', (url, options) => {
      if (url.endsWith('/airlines/3') && options.method === 'PUT') return { ...airline, name: 'Pacific Air', iata_code: 'PA' };
      if (url.endsWith('/airlines/3')) return airline;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa hãng hàng không' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Tên hãng hàng không'));
    await user.type(screen.getByLabelText('Tên hãng hàng không'), 'Pacific Air');
    await user.clear(screen.getByLabelText('Mã IATA'));
    await user.type(screen.getByLabelText('Mã IATA'), 'pa');
    await user.click(screen.getByRole('button', { name: 'Lưu hãng hàng không' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airlines/3') && options.method === 'PUT')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/airlines/3') && candidate.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ name: 'Pacific Air', iata_code: 'PA', logo_url: 'https://airline.test/vn.png' });
  });

  it('does not submit an Airline with an invalid IATA code', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airlines/new', (url) => {
      if (url.includes('/airlines?')) return page([]);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Thêm hãng hàng không' });
    await user.type(screen.getByLabelText('Tên hãng hàng không'), 'Pacific Air');
    await user.type(screen.getByLabelText('Mã IATA'), 'P');
    await user.click(screen.getByRole('button', { name: 'Tạo hãng hàng không' }));
    expect(await screen.findByText('Mã IATA phải gồm 2–3 chữ cái hoặc chữ số.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airlines') && options.method === 'POST')).toBe(false);
  });

  it('keeps Airline delete separate and preserves the existing-flight conflict message', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airlines/3', (url, options) => {
      if (url.endsWith('/airlines/3') && options.method === 'DELETE') return new Response(JSON.stringify({ message: 'Cannot delete airline with existing flights' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/airlines/3')) return airline;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chi tiết hãng hàng không' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xóa hãng hàng không' }));
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận xóa hãng hàng không' });
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airlines/3') && options.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Xóa hãng hàng không' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete airline with existing flights');
  });

  it('deletes Airline only after confirmation and returns to the list', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airlines/3', (url, options) => {
      if (url.endsWith('/airlines/3') && options.method === 'DELETE') return { id: 3, message: 'Airline deleted' };
      if (url.endsWith('/airlines/3')) return airline;
      if (url.includes('/airlines?')) return page([]);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Chi tiết hãng hàng không' });
    await user.click(screen.getByRole('button', { name: 'Xóa hãng hàng không' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa hãng hàng không' }));
    expect(await screen.findByRole('heading', { name: 'Quản lý hãng hàng không' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airlines/3') && options.method === 'DELETE')).toBe(true);
  });

  it('searches Airport list and creates only validated Airport fields', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airports?search=ho&page=1&limit=20', (url, options) => {
      if (url.includes('/airports?')) return page([airport]);
      if (url.endsWith('/airports') && options.method === 'POST') return { ...airport, id: 12 };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Quản lý sân bay' })).toBeInTheDocument();
    expect((await screen.findAllByText('Tân Sơn Nhất')).length).toBeGreaterThan(0);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/airports?page=1&limit=20&search=ho'))).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Thêm sân bay' }));
    expect(await screen.findByRole('heading', { name: 'Thêm sân bay' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mã IATA'), 's');
    await user.type(screen.getByLabelText('Tên sân bay'), 'Sân bay mới');
    await user.type(screen.getByLabelText('Thành phố'), 'Hà Nội');
    await user.click(screen.getByRole('button', { name: 'Tạo sân bay' }));
    expect(await screen.findByText('Mã IATA phải gồm đúng 3 chữ cái hoặc chữ số.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airports') && options.method === 'POST')).toBe(false);
    await user.clear(screen.getByLabelText('Mã IATA'));
    await user.type(screen.getByLabelText('Mã IATA'), 'han');
    await user.click(screen.getByRole('button', { name: 'Tạo sân bay' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airports') && options.method === 'POST')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/airports') && candidate.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({ iata_code: 'HAN', name: 'Sân bay mới', city: 'Hà Nội', country: null });
  });

  it('paginates Airport search results using the API pagination response', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airports?search=ho&page=1&limit=10', (url) => {
      if (url.includes('/airports?')) return page([airport], url.includes('page=2') ? 2 : 1, 10, 15);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Quản lý sân bay' });
    await user.click(screen.getByRole('button', { name: 'Đi tới trang 2' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/airports?page=2&limit=10&search=ho'))).toBe(true));
  });

  it('updates Airport fields through the documented PUT endpoint', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airports/8/edit', (url, options) => {
      if (url.endsWith('/airports/8') && options.method === 'PUT') return { ...airport, name: 'Cảng hàng không Tân Sơn Nhất', country: 'Việt Nam' };
      if (url.endsWith('/airports/8')) return airport;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa sân bay' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Tên sân bay'));
    await user.type(screen.getByLabelText('Tên sân bay'), 'Cảng hàng không Tân Sơn Nhất');
    await user.click(screen.getByRole('button', { name: 'Lưu sân bay' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airports/8') && options.method === 'PUT')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/airports/8') && candidate.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ iata_code: 'SGN', name: 'Cảng hàng không Tân Sơn Nhất', city: 'Hồ Chí Minh', country: 'Việt Nam' });
  });

  it('shows backend duplicate Airport field details from HTTP 409', async () => {
    const user = userEvent.setup();
    renderAs('admin', '/admin/airports/new', (url, options) => {
      if (url.endsWith('/airports') && options.method === 'POST') return new Response(JSON.stringify({ message: 'Duplicate entry error', errors: [{ field: 'iata_code', message: 'iata_code already exists' }] }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Thêm sân bay' });
    await user.type(screen.getByLabelText('Mã IATA'), 'DAD');
    await user.type(screen.getByLabelText('Tên sân bay'), 'Đà Nẵng');
    await user.type(screen.getByLabelText('Thành phố'), 'Đà Nẵng');
    await user.click(screen.getByRole('button', { name: 'Tạo sân bay' }));
    expect(await screen.findByText('iata_code already exists')).toBeInTheDocument();
  });

  it('shows Airport foreign-key delete failure as HTTP 400 without deleting or hiding the detail', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airports/8', (url, options) => {
      if (url.endsWith('/airports/8') && options.method === 'DELETE') return new Response(JSON.stringify({ message: 'Invalid referenced resource ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/airports/8')) return airport;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chi tiết sân bay' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xóa sân bay' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Xác nhận xóa sân bay' })).getByRole('button', { name: 'Xóa sân bay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid referenced resource ID');
    expect(screen.getByRole('heading', { name: 'Chi tiết sân bay' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airports/8') && options.method === 'DELETE')).toBe(true);
  });

  it('deletes Airport only after confirmation and returns to the list', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/airports/8', (url, options) => {
      if (url.endsWith('/airports/8') && options.method === 'DELETE') return { message: 'Airport deleted' };
      if (url.endsWith('/airports/8')) return airport;
      if (url.includes('/airports?')) return page([]);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Chi tiết sân bay' });
    await user.click(screen.getByRole('button', { name: 'Xóa sân bay' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa sân bay' }));
    expect(await screen.findByRole('heading', { name: 'Quản lý sân bay' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/airports/8') && options.method === 'DELETE')).toBe(true);
  });

  it('blocks customers from Airline and Airport admin routes and hides their navigation', async () => {
    renderAs('customer', '/admin/airlines', () => { throw new Error('Customers must be rejected before admin API calls.'); });
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Hãng hàng không' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sân bay' })).not.toBeInTheDocument();
  });

  it('blocks staff from Airline and Airport admin routes', async () => {
    renderAs('staff', '/admin/airports', () => { throw new Error('Staff must be rejected before the admin API is called.'); });
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Hãng hàng không' })).not.toBeInTheDocument();
  });
});
