import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';

const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const ok = (data, extra = {}) => respond({ success: true, data, ...extra });
const promo = {
  id: 7,
  code: 'FLY10',
  discount_type: 'percent',
  discount_value: '10.00',
  valid_from: '2026-10-01T00:00:00.000Z',
  valid_to: '2026-10-30T23:59:59.000Z',
  max_uses: 100,
  used_count: 4,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};
const page = (data, current = 1, limit = 20, total = data.length) => ({
  data,
  pagination: {
    total,
    page: current,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: current * limit < total,
    hasPrevPage: current > 1,
  },
});

function renderAdmin(path, onRequest, role = 'admin') {
  sessionStorage.setItem('airline_refresh_token', 'refresh-token');
  const fetchImpl = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/refresh-token')) return ok({ accessToken: 'access-token' });
    if (url.endsWith('/auth/me')) return ok({ id: 1, email: `${role}@example.com`, role: { name: role } });
    const result = await onRequest(url, options);
    return result instanceof Response ? result : ok(result);
  });
  render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></AuthProvider>);
  return fetchImpl;
}

describe('Promotion administration', () => {
  it('loads paginated promotions and sends only supported active_only query', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions', (url) => {
      if (url.includes('/promotions?')) return page([promo], 1, 20, 25);
      throw new Error(`Unexpected request ${url}`);
    });

    expect(await screen.findByRole('heading', { name: 'Quản lý khuyến mại' })).toBeInTheDocument();
    expect((await screen.findAllByText('FLY10')).length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/promotions?page=1&limit=20'))).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /chỉ xem khuyến mại trong thời hạn/i }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/promotions?page=1&limit=20&active_only=true'))).toBe(true));
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('search='))).toBe(false);
  });

  it('paginates from API metadata and filters search only on the loaded page', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions', (url) => {
      if (url.includes('/promotions?')) {
        const current = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return page(current === 1 ? [promo, { ...promo, id: 8, code: 'SUMMER20' }] : [{ ...promo, id: 9, code: 'WEEKEND' }], current, 20, 25);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    expect((await screen.findAllByText('SUMMER20')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Đi tới trang 2' }));
    expect((await screen.findAllByText('WEEKEND')).length).toBeGreaterThan(0);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm mã trên trang đang xem' }), 'week');
    expect(screen.getAllByText('WEEKEND').length).toBeGreaterThan(0);
    expect(screen.getByText(/chỉ lọc dữ liệu của trang hiện tại/i)).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('search='))).toBe(false);
  });

  it('shows loading and a retryable API error', async () => {
    const fetchImpl = renderAdmin('/admin/promotions', (url) => {
      if (url.includes('/promotions?')) return respond({ success: false, message: 'Promotion service unavailable' }, 503);
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Promotion service unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/promotions?'))).toHaveLength(2));
  });

  it('shows an explicit loading state while the list request is pending', async () => {
    let resolveList;
    renderAdmin('/admin/promotions', (url) => {
      if (url.includes('/promotions?')) return new Promise((resolve) => { resolveList = resolve; });
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByText('Đang tải danh sách khuyến mại…')).toBeInTheDocument();
    resolveList(page([promo]));
    expect(await screen.findByRole('heading', { name: 'Quản lý khuyến mại' })).toBeInTheDocument();
  });

  it('shows a distinct empty state when the API has no promotions', async () => {
    renderAdmin('/admin/promotions', (url) => {
      if (url.includes('/promotions?')) return page([], 1, 20, 0);
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chưa có khuyến mại nào' })).toBeInTheDocument();
  });

  it('shows promotion detail and keeps used_count display-only', async () => {
    renderAdmin('/admin/promotions/7', (url) => {
      if (url.endsWith('/promotions/7')) return promo;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chi tiết khuyến mại' })).toBeInTheDocument();
    expect(screen.getByText('FLY10')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByLabelText(/lượt đã sử dụng/i)).not.toBeInTheDocument();
  });

  it('creates a promotion with supported fields only and never sends used_count', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/new', (url, options) => {
      if (url.endsWith('/promotions') && options.method === 'POST') return { id: 11, ...JSON.parse(options.body) };
      if (url.endsWith('/promotions/11')) return { id: 11, ...promo, code: 'WELCOME10' };
      throw new Error(`Unexpected request ${options.method || 'GET'} ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Tạo khuyến mại' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mã khuyến mại'), ' welcome10 ');
    await user.selectOptions(screen.getByLabelText('Loại giảm giá'), 'percent');
    await user.type(screen.getByLabelText('Giá trị giảm'), '10');
    await user.type(screen.getByLabelText('Có hiệu lực từ'), '2026-10-10T08:00');
    await user.type(screen.getByLabelText('Có hiệu lực đến'), '2026-10-30T23:59');
    await user.type(screen.getByLabelText('Giới hạn lượt sử dụng'), '50');
    await user.click(screen.getByRole('button', { name: 'Tạo khuyến mại' }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/promotions') && options.method === 'POST')).toBe(true));
    const [, request] = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/promotions') && options.method === 'POST');
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ code: 'WELCOME10', discount_type: 'percent', discount_value: 10, max_uses: 50 });
    expect(body.valid_from).toMatch(/^2026-10-10T/);
    expect(body.valid_to).toMatch(/^2026-10-30T/);
    expect(body).not.toHaveProperty('used_count');
  });

  it('validates percentage, date order, and optional max uses before POST', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/new', (url) => {
      if (url.includes('/promotions?')) return page([]);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Tạo khuyến mại' });
    await user.type(screen.getByLabelText('Mã khuyến mại'), 'BIGDISCOUNT');
    await user.selectOptions(screen.getByLabelText('Loại giảm giá'), 'percent');
    await user.type(screen.getByLabelText('Giá trị giảm'), '101');
    await user.type(screen.getByLabelText('Có hiệu lực từ'), '2026-10-30T00:00');
    await user.type(screen.getByLabelText('Có hiệu lực đến'), '2026-10-10T00:00');
    await user.type(screen.getByLabelText('Giới hạn lượt sử dụng'), '1.5');
    await user.click(screen.getByRole('button', { name: 'Tạo khuyến mại' }));
    expect(await screen.findByText('Phần trăm giảm không được vượt quá 100%.')).toBeInTheDocument();
    expect(screen.getByText('Thời gian kết thúc phải sau thời gian bắt đầu.')).toBeInTheDocument();
    expect(screen.getByText('Giới hạn phải là số nguyên không âm hoặc để trống.')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/promotions') && options.method === 'POST')).toBe(false);
  });

  it('updates promotion fields but does not include used_count in PUT payload', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/7/edit', (url, options) => {
      if (url.endsWith('/promotions/7') && options.method === 'PUT') return { ...promo, ...JSON.parse(options.body) };
      if (url.endsWith('/promotions/7')) return promo;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa khuyến mại' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Giá trị giảm'));
    await user.type(screen.getByLabelText('Giá trị giảm'), '15');
    await user.click(screen.getByRole('button', { name: 'Lưu khuyến mại' }));
    expect(await screen.findByText('Khuyến mại đã được cập nhật.')).toBeInTheDocument();
    const [, request] = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/promotions/7') && options.method === 'PUT');
    expect(JSON.parse(request.body)).toMatchObject({ discount_value: 15, code: 'FLY10' });
    expect(JSON.parse(request.body)).not.toHaveProperty('used_count');
    expect(screen.queryByLabelText(/lượt đã sử dụng/i)).not.toBeInTheDocument();
  });

  it('surfaces 409 and 422 API messages without discarding form values', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/new', (url, options) => {
      if (url.endsWith('/promotions') && options.method === 'POST') return respond({ success: false, message: 'Promotion code already exists', errors: [{ field: 'code', message: 'code must be unique' }] }, 409);
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Tạo khuyến mại' });
    await user.type(screen.getByLabelText('Mã khuyến mại'), 'FLY10');
    await user.selectOptions(screen.getByLabelText('Loại giảm giá'), 'amount');
    await user.type(screen.getByLabelText('Giá trị giảm'), '50000');
    await user.type(screen.getByLabelText('Có hiệu lực từ'), '2026-10-10T08:00');
    await user.type(screen.getByLabelText('Có hiệu lực đến'), '2026-10-30T23:59');
    await user.click(screen.getByRole('button', { name: 'Tạo khuyến mại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Promotion code already exists');
    expect(screen.getByText('code must be unique')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã khuyến mại')).toHaveValue('FLY10');
    expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/promotions') && options.method === 'POST')).toBe(true);
  });

  it('maps 422 field validation from the API onto the form', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/new', (url, options) => {
      if (url.endsWith('/promotions') && options.method === 'POST') return respond({ success: false, message: 'Validation failed', errors: [{ field: 'code', message: 'Code must be at most 30 characters.' }] }, 422);
      throw new Error(`Unexpected request ${options.method || 'GET'} ${url}`);
    });
    await screen.findByRole('heading', { name: 'Tạo khuyến mại' });
    await user.type(screen.getByLabelText('Mã khuyến mại'), 'VALIDCODE');
    await user.selectOptions(screen.getByLabelText('Loại giảm giá'), 'amount');
    await user.type(screen.getByLabelText('Giá trị giảm'), '50000');
    await user.type(screen.getByLabelText('Có hiệu lực từ'), '2026-10-10T08:00');
    await user.type(screen.getByLabelText('Có hiệu lực đến'), '2026-10-30T23:59');
    await user.click(screen.getByRole('button', { name: 'Tạo khuyến mại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
    expect(screen.getByText('Code must be at most 30 characters.')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/promotions') && options.method === 'POST')).toBe(true);
  });

  it('deletes only after confirmation and displays API error when deletion fails', async () => {
    const user = userEvent.setup();
    const fetchImpl = renderAdmin('/admin/promotions/7', (url, options) => {
      if (url.endsWith('/promotions/7') && options.method === 'DELETE') return respond({ success: false, message: 'Promotion is referenced by a booking' }, 409);
      if (url.endsWith('/promotions/7')) return promo;
      throw new Error(`Unexpected request ${url}`);
    });
    await screen.findByRole('heading', { name: 'Chi tiết khuyến mại' });
    await user.click(screen.getByRole('button', { name: 'Xóa khuyến mại' }));
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận xóa khuyến mại' });
    expect(fetchImpl.mock.calls.some(([url, options]) => url.endsWith('/promotions/7') && options.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Xóa khuyến mại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Promotion is referenced by a booking');
  });

  it('blocks staff from promotion routes and hides the admin navigation', async () => {
    renderAdmin('/admin/promotions', () => { throw new Error('Staff must be rejected before promotions API calls.'); }, 'staff');
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Khuyến mại' })).not.toBeInTheDocument();
  });
});
