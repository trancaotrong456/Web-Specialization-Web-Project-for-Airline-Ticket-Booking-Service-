import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FlightCalendarView } from './FlightCalendarView';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';

const mockFlights = [
  {
    id: 101,
    airline_id: 1,
    departure_airport_id: 2,
    arrival_airport_id: 3,
    departure_time: new Date().toISOString(), // Today
    arrival_time: new Date(Date.now() + 7200000).toISOString(),
    total_seats: 180,
    available_seats: 120,
    status: 'scheduled',
    airline: { id: 1, name: 'Vietnam Airlines', iata_code: 'VN' },
    departureAirport: { id: 2, name: 'Tân Sơn Nhất', iata_code: 'SGN', city: 'Hồ Chí Minh' },
    arrivalAirport: { id: 3, name: 'Nội Bài', iata_code: 'HAN', city: 'Hà Nội' },
    fareClasses: [
      { id: 1, class_name: 'Phổ thông', price: '1500000', seat_quota: 120 },
      { id: 2, class_name: 'Thương gia', price: '3500000', seat_quota: 20 },
    ],
  },
  {
    id: 102,
    airline_id: 2,
    departure_airport_id: 2,
    arrival_airport_id: 4,
    departure_time: new Date().toISOString(), // Today
    arrival_time: new Date(Date.now() + 3600000).toISOString(),
    total_seats: 150,
    available_seats: 0,
    status: 'delayed',
    airline: { id: 2, name: 'Vietjet Air', iata_code: 'VJ' },
    departureAirport: { id: 2, name: 'Tân Sơn Nhất', iata_code: 'SGN', city: 'Hồ Chí Minh' },
    arrivalAirport: { id: 4, name: 'Đà Nẵng', iata_code: 'DAD', city: 'Đà Nẵng' },
    fareClasses: [],
  },
];

describe('FlightCalendarView component', () => {
  it('renders Month View by default with week day headers, summary stats and today indicator', () => {
    render(
      <MemoryRouter>
        <FlightCalendarView flights={mockFlights} statusOptions={[{ value: 'scheduled', label: 'Theo lịch' }]} />
      </MemoryRouter>
    );

    expect(screen.getByRole('group', { name: 'Chế độ xem lịch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /theo tháng/i })).toHaveClass('is-active');
    expect(screen.getByText(/Thứ Hai \(T2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Chủ Nhật \(CN\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tổng cộng:/i)).toBeInTheDocument();
    expect(screen.getByText(/SGN→HAN/i)).toBeInTheDocument();
  });

  it('switches to Week View when clicking "Theo tuần"', async () => {
    render(
      <MemoryRouter>
        <FlightCalendarView flights={mockFlights} />
      </MemoryRouter>
    );

    const weekBtn = screen.getByRole('button', { name: /theo tuần/i });
    await userEvent.click(weekBtn);

    expect(weekBtn).toHaveClass('is-active');
    expect(screen.getAllByText(/chuyến bay/i).length).toBeGreaterThan(0);
    expect(screen.getByText('VN #101')).toBeInTheDocument();
    expect(screen.getByText('VJ #102')).toBeInTheDocument();
  });

  it('navigates previous, next, and returns to today', async () => {
    render(
      <MemoryRouter>
        <FlightCalendarView flights={mockFlights} />
      </MemoryRouter>
    );

    const prevBtn = screen.getByRole('button', { name: 'Tháng trước' });
    const nextBtn = screen.getByRole('button', { name: 'Tháng sau' });
    const todayBtn = screen.getByRole('button', { name: 'Đi đến hôm nay' });

    await userEvent.click(nextBtn);
    await userEvent.click(prevBtn);
    await userEvent.click(todayBtn);

    expect(todayBtn).toBeInTheDocument();
  });

  it('opens Flight Detail Modal when a flight chip is clicked', async () => {
    render(
      <MemoryRouter>
        <FlightCalendarView flights={mockFlights} />
      </MemoryRouter>
    );

    const flightChip = screen.getByText(/SGN→HAN/i);
    await userEvent.click(flightChip);

    expect(await screen.findByRole('heading', { name: /Chi tiết chuyến bay #101/i })).toBeInTheDocument();
    expect(screen.getByText(/Vietnam Airlines/i)).toBeInTheDocument();
    expect(screen.getByText('Hồ Chí Minh')).toBeInTheDocument();
    expect(screen.getByText(/120 ghế/i)).toBeInTheDocument();
    expect(screen.getByText('Phổ thông')).toBeInTheDocument();

    const closeBtn = screen.getAllByRole('button', { name: 'Đóng' })[0];
    await userEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Chi tiết chuyến bay #101/i })).not.toBeInTheDocument();
    });
  });

  it('opens Day Flights List Modal when clicking on a day with flights in Month View', async () => {
    render(
      <MemoryRouter>
        <FlightCalendarView flights={mockFlights} />
      </MemoryRouter>
    );

    const dayBadge = screen.getByText('2 chuyến');
    await userEvent.click(dayBadge);

    expect(await screen.findByRole('heading', { name: /Lịch bay ngày/i })).toBeInTheDocument();
    expect(screen.getByText(/Tổng cộng có/i)).toBeInTheDocument();
  });

  it('triggers onStatusFilterChange when filter select is changed', async () => {
    const onFilterChange = vi.fn();
    render(
      <MemoryRouter>
        <FlightCalendarView
          flights={mockFlights}
          statusFilter=""
          onStatusFilterChange={onFilterChange}
          statusOptions={[{ value: 'delayed', label: 'Hoãn chuyến' }]}
        />
      </MemoryRouter>
    );

    const select = screen.getByLabelText(/Lọc:/i);
    await userEvent.selectOptions(select, 'delayed');
    expect(onFilterChange).toHaveBeenCalledWith('delayed');
  });
});

describe('FlightListPage view toggle integration', () => {
  const json = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

  it('supports toggling between Table view and Calendar view', async () => {
    sessionStorage.setItem('airline_refresh_token', 'refresh-token');
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'token' });
      if (url.endsWith('/auth/me')) return json({ id: 1, email: 'admin@airline-booking.local', role: { name: 'admin' } });
      if (url.includes('/flights?')) return json({ data: mockFlights, pagination: { total: 2, page: 1, limit: 10, totalPages: 1 } });
      throw new Error(`Unexpected url ${url}`);
    });

    render(
      <AuthProvider fetchImpl={fetchImpl}>
        <MemoryRouter initialEntries={['/admin/flights']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    );

    // Initial table view
    expect(await screen.findByRole('tab', { name: /Danh sách/i })).toHaveClass('is-active');
    expect(screen.getByRole('table', { name: 'Danh sách chuyến bay' })).toBeInTheDocument();

    // Switch to calendar
    const calendarTab = screen.getByRole('tab', { name: /Lịch Calendar/i });
    await userEvent.click(calendarTab);

    // In calendar view
    expect(await screen.findByRole('group', { name: 'Chế độ xem lịch' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Danh sách chuyến bay' })).not.toBeInTheDocument();
  });
});
