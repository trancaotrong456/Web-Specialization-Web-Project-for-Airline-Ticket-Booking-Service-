import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';
import { TripFlightResults } from './FlightResultsPage';

vi.mock('../../lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connect: vi.fn(), connected: true }) }));

const flightFor = (id, from, to, date) => ({
  id, departure_time: `${date}T08:00:00Z`, arrival_time: `${date}T10:00:00Z`, available_seats: 8, status: 'scheduled',
  departure_airport_id: from === 'HAN' ? 1 : 2, arrival_airport_id: to === 'HAN' ? 1 : 2,
  airline: { name: 'Vietnam Airlines' },
  departureAirport: { iata_code: from, city: from },
  arrivalAirport: { iata_code: to, city: to },
  fareClasses: [{ id: id + 100, price: 1000000 }],
});

function CurrentLocation() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
const jsonResponse = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('TripFlightResults', () => {
  it('searches each real leg, requires a fare per leg, and carries the itinerary into booking', async () => {
    const user = userEvent.setup();
    const outbound = flightFor(17, 'HAN', 'SGN', '2027-02-01');
    const inbound = flightFor(18, 'SGN', 'HAN', '2027-02-05');
    const api = {
      searchFlights: vi.fn().mockResolvedValueOnce({ data: [outbound] }).mockResolvedValueOnce({ data: [inbound] }),
      fareClassesForFlight: vi.fn().mockResolvedValue({ data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] }),
    };
    render(<MemoryRouter><TripFlightResults api={api} tripType="round_trip" passengerCount="2" legs={[
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2027-02-01' },
      { departure_airport_id: '2', arrival_airport_id: '1', departure_date: '2027-02-05' },
    ]} filterValues={{ airline_id: '9', min_price: '500000', fare_class: 'Phổ thông', sort_by: 'price_low' }} /><CurrentLocation /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' }));
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục chọn chặng sau' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' }));
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục nhập hành khách' }));

    await screen.findByText(/\/bookings\/new\?/);
    const route = new URL(screen.getByText(/\/bookings\/new\?/).textContent, 'http://localhost');
    expect(api.searchFlights).toHaveBeenNthCalledWith(1, expect.objectContaining({ departure_airport_id: '1', arrival_airport_id: '2', min_seats: '2', airline_id: '9', min_price: '500000', fare_class: 'Phổ thông', sort_by: 'price_low' }));
    expect(api.searchFlights).toHaveBeenNthCalledWith(2, expect.objectContaining({ departure_airport_id: '2', arrival_airport_id: '1', min_seats: '2', airline_id: '9', min_price: '500000', fare_class: 'Phổ thông', sort_by: 'price_low' }));
    expect(JSON.parse(route.searchParams.get('itinerary_legs'))).toEqual([{ flight_id: 17, fare_class_id: 5 }, { flight_id: 18, fare_class_id: 5 }]);
  });

  it('renders the multi-leg result flow from the homepage URL on the actual /flights/search route', async () => {
    const dateOne = '2027-02-01'; const dateTwo = '2027-02-05';
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/flights/search?')) {
        const search = new URL(String(url), 'http://localhost').searchParams;
        const flight = search.get('departure_airport_id') === '1'
          ? flightFor(17, 'HAN', 'SGN', dateOne)
          : flightFor(18, 'SGN', 'HAN', dateTwo);
        return jsonResponse({ success: true, data: [flight], pagination: { page: 1, totalPages: 1 } });
      }
      return jsonResponse({ success: true, data: [{ id: 105, class_name: 'Phổ thông', price: 1000000 }] });
    });
    const legs = [
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: dateOne },
      { departure_airport_id: '2', arrival_airport_id: '1', departure_date: dateTwo },
    ];
    const search = new URLSearchParams({ trip_type: 'round_trip', passengers: '1', legs: JSON.stringify(legs) });
    render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={[`/flights/search?${search}`]}><AppRoutes /></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole('heading', { name: 'Chọn chuyến cho chặng 1/2' })).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('departure_airport_id=1'), expect.anything());
  });

  it('ignores an older fare response after the user selects a different flight', async () => {
    const user = userEvent.setup();
    const oldFareRequest = deferred();
    const newFareRequest = deferred();
    const api = {
      searchFlights: vi.fn().mockResolvedValue({ data: [
        flightFor(17, 'HAN', 'SGN', '2027-02-01'),
        flightFor(18, 'HAN', 'SGN', '2027-02-01'),
      ] }),
      fareClassesForFlight: vi.fn((id) => Number(id) === 17 ? oldFareRequest.promise : newFareRequest.promise),
    };
    render(<MemoryRouter><TripFlightResults api={api} tripType="round_trip" passengerCount="1" legs={[
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2027-02-01' },
      { departure_airport_id: '2', arrival_airport_id: '1', departure_date: '2027-02-05' },
    ]} /></MemoryRouter>);

    const chooseButtons = await screen.findAllByRole('button', { name: 'Chọn chuyến bay' });
    await user.click(chooseButtons[0]);
    await user.click(chooseButtons[1]);
    expect(api.fareClassesForFlight).toHaveBeenNthCalledWith(1, 17);
    expect(api.fareClassesForFlight).toHaveBeenNthCalledWith(2, 18);
    newFareRequest.resolve({ data: [{ id: 180, class_name: 'Hạng của chuyến mới', price: 2000000 }] });
    const newFareOption = await screen.findByRole('radio', { name: /Hạng của chuyến mới/ });
    await user.click(newFareOption);
    await act(async () => {
      oldFareRequest.resolve({ data: [{ id: 170, class_name: 'Hạng cũ không được chọn', price: 1000000 }] });
      await oldFareRequest.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('radio', { name: /Hạng của chuyến mới/ })).toBeChecked();
    expect(screen.queryByText('Hạng cũ không được chọn')).not.toBeInTheDocument();
  });

  it.each([
    ['round_trip', [
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2027-02-01' },
      { departure_airport_id: '3', arrival_airport_id: '1', departure_date: '2027-02-05' },
    ]],
    ['multi_city', [
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2027-02-01' },
      { departure_airport_id: '3', arrival_airport_id: '4', departure_date: '2027-02-05' },
    ]],
  ])('rejects invalid %s route shapes before requesting flights', (tripType, legs) => {
    const api = { searchFlights: vi.fn(), fareClassesForFlight: vi.fn() };
    render(<MemoryRouter><TripFlightResults api={api} tripType={tripType} passengerCount="1" legs={legs} /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Thông tin hành trình chưa hợp lệ');
    expect(api.searchFlights).not.toHaveBeenCalled();
  });

  it('rejects a flight that departs before the minimum connection time', async () => {
    const user = userEvent.setup();
    const first = flightFor(17, 'HAN', 'SGN', '2027-02-01');
    first.arrival_time = '2027-02-01T10:00:00Z';
    const tooSoon = flightFor(18, 'SGN', 'HAN', '2027-02-01');
    tooSoon.departure_time = '2027-02-01T10:30:00Z';
    const api = {
      searchFlights: vi.fn().mockResolvedValueOnce({ data: [first] }).mockResolvedValueOnce({ data: [tooSoon] }),
      fareClassesForFlight: vi.fn().mockResolvedValue({ data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] }),
    };
    render(<MemoryRouter><TripFlightResults api={api} tripType="round_trip" passengerCount="1" legs={[
      { departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2027-02-01' },
      { departure_airport_id: '2', arrival_airport_id: '1', departure_date: '2027-02-01' },
    ]} /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' }));
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục chọn chặng sau' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ít nhất 60 phút/i);
    expect(screen.queryByRole('radio', { name: /Phổ thông/ })).not.toBeInTheDocument();
  });
});
