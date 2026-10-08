import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const flight = {
  id: 5,
  airline_id: 1,
  departure_airport_id: 2,
  arrival_airport_id: 3,
  departure_time: '2026-11-05T06:30:00.000Z',
  arrival_time: '2026-11-05T08:30:00.000Z',
  total_seats: 180,
  available_seats: 146,
  status: 'scheduled',
  airline: { id: 1, name: 'Vietnam Airlines', iata_code: 'VN', logo_url: null },
  departureAirport: { id: 2, name: 'Tân Sơn Nhất', iata_code: 'SGN', city: 'Hồ Chí Minh' },
  arrivalAirport: { id: 3, name: 'Nội Bài', iata_code: 'HAN', city: 'Hà Nội' },
  fareClasses: [{ id: 9, class_name: 'Phổ thông', price: '1200000.00', seat_quota: 150 }],
};

function renderAs(role, path, onRequest) {
  sessionStorage.setItem('airline_refresh_token', 'refresh-token');
  const fetchImpl = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'access-token' });
    if (url.endsWith('/auth/me')) return json({ id: 4, email: `${role}@example.com`, role: { name: role } });
    const result = await onRequest(url, options);
    if (result instanceof Response) return result;
    return json(result);
  });
  render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></AuthProvider>);
  return fetchImpl;
}

describe('Flight and Fare Class management screens', () => {
  it('loads Flight List with only page, limit, and status filters and supports pagination', async () => {
    const fetch = renderAs('admin', '/admin/flights?page=2&limit=10&status=scheduled', (url) => {
      if (url.includes('/flights?')) return { data: [flight], pagination: { total: 21, page: 2, limit: 10, totalPages: 3, hasNextPage: true, hasPrevPage: true } };
      throw new Error(`Unexpected request ${url}`);
    });

    expect(await screen.findByRole('heading', { name: 'Quản lý chuyến bay' })).toBeInTheDocument();
    expect((await screen.findAllByText('VN • Vietnam Airlines')).length).toBeGreaterThan(0);
    const flightRequest = fetch.mock.calls.find(([url]) => url.includes('/flights?'))[0];
    expect(flightRequest).toContain('/flights?page=2&limit=10&status=scheduled');
    expect(flightRequest).not.toContain('search=');
    await userEvent.click(screen.getByRole('button', { name: 'Đi tới trang 3' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/flights?page=3&limit=10&status=scheduled'))).toBe(true));
  });

  it('shows flight management navigation to staff but not to customers', async () => {
    const noFlights = (url) => url.includes('/flights?')
      ? { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }
      : (() => { throw new Error(`Unexpected request ${url}`); })();
    sessionStorage.setItem('airline_refresh_token', 'staff-refresh');
    const { unmount } = render(<AuthProvider fetchImpl={vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'staff-token' });
      if (url.endsWith('/auth/me')) return json({ id: 2, email: 'staff@example.com', role: { name: 'staff' } });
      if (url.includes('/flights?')) return json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      throw new Error(`Unexpected request ${url}`);
    })}><MemoryRouter initialEntries={['/admin/flights']}><AppRoutes /></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole('link', { name: 'Vận hành chuyến bay' })).toHaveAttribute('href', '/admin/flights');
    unmount();
    sessionStorage.clear();
    renderAs('customer', '/admin/flights', noFlights);
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chuyến bay' })).not.toBeInTheDocument();
  });

  it('blocks staff from directly opening Flight Create while keeping the route available to admins', async () => {
    renderAs('staff', '/admin/flights/new', () => { throw new Error('Staff must be redirected before data requests.'); });
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tạo chuyến bay' })).not.toBeInTheDocument();
  });

  it('renders staff Flight actions without create or delete controls', async () => {
    renderAs('staff', '/admin/flights/5', (url) => {
      if (url.endsWith('/flights/5')) return flight;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: /VN-5|Chi tiết chuyến bay/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chỉnh sửa chuyến bay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy chuyến bay' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa chuyến bay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tạo chuyến bay' })).not.toBeInTheDocument();
  });

  it('sends only the editable flight fields on update', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/flights/5/edit', (url, options) => {
      if (url.endsWith('/flights/5') && options.method === 'PUT') return flight;
      if (url.endsWith('/flights/5')) return flight;
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa chuyến bay' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true));
    const [, options] = fetch.mock.calls.find(([, candidate]) => candidate.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({
      departure_time: '2026-11-05T06:30:00.000Z',
      arrival_time: '2026-11-05T08:30:00.000Z',
      status: 'scheduled',
    });
    expect(options.body).not.toContain('available_seats');
    expect(screen.queryByLabelText('Số ghế còn trống')).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes('/airlines?') || url.includes('/airports?'))).toBe(false);
  });

  it('creates a Flight with API-provided airline and airport options and only approved fields', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/flights/new', (url, options) => {
      if (url.endsWith('/airlines?page=1&limit=100')) return { data: [{ id: 1, name: 'Vietnam Airlines', iata_code: 'VN' }], pagination: { total: 1, page: 1, limit: 100, totalPages: 1 } };
      if (url.endsWith('/airports?page=1&limit=100')) return { data: [{ id: 2, name: 'Tân Sơn Nhất', iata_code: 'SGN' }, { id: 3, name: 'Nội Bài', iata_code: 'HAN' }], pagination: { total: 2, page: 1, limit: 100, totalPages: 1 } };
      if (url.endsWith('/flights') && options.method === 'POST') return { ...flight, id: 15 };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Tạo chuyến bay' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Hãng hàng không'), '1');
    await user.selectOptions(screen.getByLabelText('Sân bay đi'), '2');
    await user.selectOptions(screen.getByLabelText('Sân bay đến'), '3');
    await user.type(screen.getByLabelText('Thời gian khởi hành'), '2026-11-05T06:30');
    await user.type(screen.getByLabelText('Thời gian đến'), '2026-11-05T08:30');
    await user.type(screen.getByLabelText('Tổng số ghế'), '180');
    await user.click(screen.getByRole('button', { name: 'Tạo chuyến bay' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/flights') && options.method === 'POST')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/flights') && candidate.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({ airline_id: 1, departure_airport_id: 2, arrival_airport_id: 3, departure_time: '2026-11-04T23:30:00.000Z', arrival_time: '2026-11-05T01:30:00.000Z', total_seats: 180, status: 'scheduled' });
  });

  it('requires explicit confirmation before canceling and calls only cancel endpoint', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('staff', '/admin/flights/5', (url) => {
      if (url.endsWith('/flights/5/cancel')) return flight;
      if (url.endsWith('/flights/5')) return flight;
      throw new Error(`Unexpected request ${url}`);
    });
    await user.click(await screen.findByRole('button', { name: 'Hủy chuyến bay' }));
    expect(screen.getByRole('dialog', { name: 'Xác nhận hủy chuyến bay' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/flights/5/cancel'))).toBe(false);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy chuyến' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/flights/5/cancel') && options.method === 'PUT')).toBe(true));
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/flights/5') && options.method === 'DELETE')).toBe(false);
  });

  it('keeps Delete separate and explains 409 without auto-canceling', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/flights/5', (url, options) => {
      if (url.endsWith('/flights/5') && options.method === 'DELETE') return new Response(JSON.stringify({ message: 'Không thể xóa chuyến bay vì đã có lịch sử đặt vé.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/flights/5')) return flight;
      throw new Error(`Unexpected request ${url}`);
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa chuyến bay' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Xác nhận xóa chuyến bay' })).getByRole('button', { name: 'Xóa chuyến bay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa chuyến bay vì đã có lịch sử đặt vé. Bạn có thể hủy chuyến để giữ nguyên lịch sử.');
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/flights/5/cancel'))).toBe(false);
  });

  it('loads Fare Classes only for the selected Flight and hides deletion from staff', async () => {
    const fetch = renderAs('staff', '/admin/flights/5/fare-classes', (url) => {
      if (url.endsWith('/flights/5')) return flight;
      if (url.endsWith('/fare-classes/flight/5')) return [{ id: 9, flight_id: 5, class_name: 'Phổ thông', price: '1200000.00', seat_quota: 150 }];
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: /Hạng vé.*VN-5|Hạng vé chuyến bay/ })).toBeInTheDocument();
    expect(await screen.findByText('Phổ thông')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/fare-classes'))).toBe(false);
    expect(screen.getByRole('link', { name: 'Thêm hạng vé' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa hạng vé' })).not.toBeInTheDocument();
  });

  it('creates a Fare Class using the parent Flight and its allowed fields', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('staff', '/admin/flights/5/fare-classes/new', (url, options) => {
      if (url.endsWith('/flights/5')) return flight;
      if (url.endsWith('/fare-classes') && options.method === 'POST') return { id: 12, flight_id: 5, class_name: 'Thương gia', price: 2400000, seat_quota: 20 };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Thêm hạng vé' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên hạng vé'), 'Thương gia');
    await user.type(screen.getByLabelText('Giá vé'), '2400000');
    await user.type(screen.getByLabelText('Số ghế phân bổ'), '20');
    await user.click(screen.getByRole('button', { name: 'Tạo hạng vé' }));
    await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/fare-classes') && options.method === 'POST')).toBe(true));
    const [, options] = fetch.mock.calls.find(([url, candidate]) => url.endsWith('/fare-classes') && candidate.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({ flight_id: 5, class_name: 'Thương gia', price: 2400000, seat_quota: 20 });
  });

  it('keeps Fare Class flight immutable on edit and allows its authorized delete', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/fare-classes/9/edit', (url, options) => {
      if (url.endsWith('/fare-classes/9') && options.method === 'PUT') return { id: 9, flight_id: 5, class_name: 'Phổ thông linh hoạt', price: 1350000, seat_quota: 140, flight };
      if (url.endsWith('/fare-classes/9')) return { id: 9, flight_id: 5, class_name: 'Phổ thông', price: 1200000, seat_quota: 150, flight };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa hạng vé' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Chuyến bay')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Tên hạng vé'));
    await user.type(screen.getByLabelText('Tên hạng vé'), 'Phổ thông linh hoạt');
    await user.click(screen.getByRole('button', { name: 'Lưu hạng vé' }));
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true));
    const [, options] = fetch.mock.calls.find(([, candidate]) => candidate.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ class_name: 'Phổ thông linh hoạt', price: 1200000, seat_quota: 150 });
    expect(options.body).not.toContain('flight_id');
  });

  it('shows Fare Class detail to staff with edit access but no delete action', async () => {
    renderAs('staff', '/admin/fare-classes/9', (url) => {
      if (url.endsWith('/fare-classes/9')) return { id: 9, flight_id: 5, class_name: 'Phổ thông', price: 1200000, seat_quota: 150, flight };
      throw new Error(`Unexpected request ${url}`);
    });
    expect(await screen.findByRole('heading', { name: 'Chi tiết hạng vé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chỉnh sửa hạng vé' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa hạng vé' })).not.toBeInTheDocument();
  });

  it('requires Fare Class delete confirmation and preserves the backend 409 message', async () => {
    const user = userEvent.setup();
    const fetch = renderAs('admin', '/admin/fare-classes/9', (url, options) => {
      if (url.endsWith('/fare-classes/9') && options.method === 'DELETE') return new Response(JSON.stringify({ message: 'Không thể xóa hạng vé đã có đơn đặt chỗ.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/fare-classes/9')) return { id: 9, flight_id: 5, class_name: 'Phổ thông', price: 1200000, seat_quota: 150, flight };
      throw new Error(`Unexpected request ${url}`);
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa hạng vé' }));
    expect(screen.getByRole('dialog', { name: 'Xác nhận xóa hạng vé' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/fare-classes/9') && options.method === 'DELETE')).toBe(false);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa hạng vé' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa hạng vé đã có đơn đặt chỗ.');
  });
});
