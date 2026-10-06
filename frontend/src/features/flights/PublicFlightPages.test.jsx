import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const airports = [
  { id: 1, iata_code: 'HAN', name: 'Noi Bai International Airport', city: 'Hanoi', country: 'Vietnam' },
  { id: 2, iata_code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country: 'Vietnam' },
];

const flights = [{
  id: 17,
  departure_time: '2026-10-10T08:00:00.000Z',
  arrival_time: '2026-10-10T10:00:00.000Z',
  total_seats: 180,
  available_seats: 12,
  airline: { name: 'Serene Air', iata_code: 'SA' },
  departureAirport: { iata_code: 'HAN', city: 'Hanoi', name: 'Noi Bai' },
  arrivalAirport: { iata_code: 'SGN', city: 'Ho Chi Minh City', name: 'Tan Son Nhat' },
  fareClasses: [{ id: 3, class_name: 'Economy', price: 1250000, seat_quota: 12 }],
}];

function createFetch({ flightResponse, airportResponse = airports, airportFails = false, flightFailsOnce = false } = {}) {
  let failedFlight = false;
  return vi.fn(async (url) => {
    if (url.endsWith('/airports') || url.includes('/airports?')) {
      if (airportFails) return response({ message: 'Không thể tải danh sách sân bay.' }, 503);
      return response({ success: true, data: airportResponse, pagination: { page: 1, limit: 20, total: airportResponse.length, totalPages: 1 } });
    }
    if (url.includes('/flights/search?')) {
      if (flightFailsOnce && !failedFlight) {
        failedFlight = true;
        return response({ message: 'Search is temporarily unavailable.' }, 503);
      }
      if (flightResponse instanceof Error) return response({ message: flightResponse.message }, 503);
      return response({ success: true, data: flightResponse ?? flights, pagination: { page: Number(new URL(url, 'http://localhost').searchParams.get('page')), limit: 20, total: 21, totalPages: 2 } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderRoutes(initialEntry, fetchImpl) {
  return render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={[initialEntry]}><AppRoutes /></MemoryRouter>
    </AuthProvider>
  );
}

describe('public flight discovery pages', () => {
  it('opens a real search form at / and loads airport choices', async () => {
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    expect(await screen.findByRole('heading', { name: /Bay đến nơi/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Điểm đi' }));
    expect(await screen.findByRole('option', { name: /HAN.*Hanoi/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Khứ hồi/i })).toBeChecked();
  });

  it('validates and serializes search values into the results URL', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    await user.click(screen.getByRole('combobox', { name: 'Điểm đi' }));
    await user.click(screen.getByRole('option', { name: /HAN.*Hanoi/i }));
    await user.click(screen.getByRole('combobox', { name: 'Điểm đến' }));
    await user.click(screen.getByRole('option', { name: /SGN.*Ho Chi Minh City/i }));
    await user.clear(screen.getByLabelText(/departure/i));
    await user.type(screen.getByLabelText(/departure/i), '2026-10-10');
    await user.clear(screen.getByLabelText(/return/i));
    await user.type(screen.getByLabelText(/return/i), '2026-10-15');
    await user.clear(screen.getByLabelText(/passengers/i));
    await user.type(screen.getByLabelText(/passengers/i), '2');
    await user.click(screen.getByRole('button', { name: /Tìm chuyến bay/i }));

    expect(await screen.findByRole('heading', { name: /Chuyến bay phù hợp/i })).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(true);
    const searchUrl = fetchImpl.mock.calls.map(([url]) => url).find((url) => url.includes('/flights/search?'));
    const params = new URL(searchUrl, 'http://localhost').searchParams;
    expect(params.get('departure_airport_id')).toBe('1');
    expect(params.get('arrival_airport_id')).toBe('2');
    expect(params.get('departure_date')).toBe('2026-10-10');
    expect(params.get('min_seats')).toBe('2');
    expect(params.has('trip_type')).toBe(false);
    expect(params.has('return_date')).toBe(false);
  });

  it('shows inline validation and does not call flight search when required airports are missing', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    await user.click(screen.getByRole('button', { name: /Tìm chuyến bay/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn điểm đi và điểm đến');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
  });

  it('keeps the results loading state visible until the search request resolves', () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/flights/search?')) return new Promise(() => {});
      return Promise.resolve(response({ success: true, data: flights, pagination: { page: 1, totalPages: 1, total: 1 } }));
    });
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20&trip_type=one_way', fetchImpl);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tìm chuyến bay');
  });

  it('loads flight results from URL params and paginates without losing search context', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=2&page=1&limit=20&trip_type=round_trip&return_date=2026-10-15', fetchImpl);

    expect(await screen.findByText('Serene Air')).toBeInTheDocument();
    expect(screen.getByText('HAN')).toBeInTheDocument();
    expect(screen.getByText('SGN')).toBeInTheDocument();
    expect(screen.getByText(/1\.250\.000/)).toBeInTheDocument();
    const firstRequest = fetchImpl.mock.calls.find(([url]) => url.includes('/flights/search?'))[0];
    expect(firstRequest).not.toContain('trip_type');
    expect(firstRequest).not.toContain('return_date');

    await user.click(screen.getByRole('button', { name: /Đi tới trang 2/i }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    const secondRequest = fetchImpl.mock.calls.map(([url]) => url).find((url) => url.includes('/flights/search?') && url.includes('page=2'));
    expect(secondRequest).not.toContain('trip_type');
    expect(secondRequest).not.toContain('return_date');
  });

  it('does not display a zero fare when the API returns no fare classes', async () => {
    const noFareData = [{ ...flights[0], fareClasses: undefined }];
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20&trip_type=one_way', createFetch({ flightResponse: noFareData }));

    expect(await screen.findByText('Chưa có thông tin giá')).toBeInTheDocument();
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument();
  });

  it('shows a clear empty state and a retryable error state', async () => {
    const empty = createFetch({ flightResponse: [] });
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20', empty);
    expect(await screen.findByText(/Không có chuyến bay phù hợp/i)).toBeInTheDocument();

    const failed = createFetch({ flightFailsOnce: true });
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20', failed);
    expect(await screen.findByText('Search is temporarily unavailable.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Serene Air')).toBeInTheDocument();
  });
});
