import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';
import { findNearestSupportedAirport } from './airportCoordinates';

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const tomorrowLocal = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function mockGeolocation(position) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  const getCurrentPosition = vi.fn((success) => success({
    coords: { ...position, accuracy: position.accuracy ?? 500 },
  }));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
  return {
    getCurrentPosition,
    restore() {
      if (original) Object.defineProperty(navigator, 'geolocation', original);
      else delete navigator.geolocation;
    },
  };
}

const airports = [
  { id: 1, iata_code: 'HAN', name: 'Noi Bai International Airport', city: 'Hanoi', country: 'Vietnam' },
  { id: 2, iata_code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country: 'Vietnam' },
  { id: 3, iata_code: 'DAD', name: 'Da Nang International Airport', city: 'Da Nang', country: 'Vietnam' },
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

function createFetch({ flightResponse, airportResponse = airports, flightFailsOnce = false } = {}) {
  let failedFlight = false;
  return vi.fn(async (url) => {
    if (url.endsWith('/airports') || url.includes('/airports?')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const page = Number(params.get('page') || 1);
      const limit = Number(params.get('limit') || 20);
      return response({ success: true, data: airportResponse, pagination: { page, limit, total: airportResponse.length, totalPages: 1 } });
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
    expect(document.querySelector('.home-hero')).toHaveClass('home-hero--full-bleed');
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Điểm đi' }));
    expect(await screen.findByRole('option', { name: /HAN.*Hanoi/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Khứ hồi/i })).not.toBeInTheDocument();
    expect(screen.getByText(/hành trình một chiều/i)).toBeInTheDocument();
  });

  it.each([
    ['TP. Hồ Chí Minh', 'Hà Nội', 'HAN', 2, 1, { latitude: 10.8188, longitude: 106.652 }],
    ['Hà Nội', 'Đà Nẵng', 'DAD', 1, 3, { latitude: 21.2212, longitude: 105.807 }],
    ['Đà Nẵng', 'TP. Hồ Chí Minh', 'SGN', 3, 2, { latitude: 16.0439, longitude: 108.199 }],
  ])('uses GPS near %s to fly to %s (%s)', async (nearCity, destinationCity, destinationCode, originId, destinationId, position) => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    const geolocation = mockGeolocation(position);
    try {
      renderRoutes('/', fetchImpl);

      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
      const departureDate = screen.getByLabelText('Departure date');
      const passengers = screen.getByRole('spinbutton', { name: 'Passengers' });
      const date = tomorrowLocal();
      await user.clear(departureDate);
      await user.type(departureDate, date);
      await user.clear(passengers);
      await user.type(passengers, '3');

      await user.click(screen.getByRole('button', { name: `Tìm chuyến bay đến ${destinationCity} (${destinationCode})` }));

      await waitFor(() => {
        const searchCall = fetchImpl.mock.calls.find(([url]) => url.includes('/flights/search?'));
        expect(searchCall).toBeDefined();
        const params = new URL(searchCall[0], 'http://localhost').searchParams;
        expect(params.get('departure_airport_id')).toBe(String(originId));
        expect(params.get('arrival_airport_id')).toBe(String(destinationId));
        expect(params.get('departure_date')).toBe(date);
        expect(params.get('min_seats')).toBe('3');
        expect(params.get('page')).toBe('1');
        expect(params.get('limit')).toBe('20');
      });
      expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(geolocation.getCurrentPosition.mock.calls[0][2]).toMatchObject({ timeout: 10000, maximumAge: 0 });
      expect(await screen.findByRole('heading', { name: /Chuyến bay phù hợp/i })).toBeInTheDocument();
    } finally {
      geolocation.restore();
    }
  });

  it('supports activating a destination card with Space and uses its API airport id in flight search', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    const danang = screen.getByRole('button', { name: 'Tìm chuyến bay đến Đà Nẵng (DAD)' });
    danang.focus();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('DAD · Da Nang'));

    await user.click(screen.getByRole('combobox', { name: 'Điểm đi' }));
    await user.click(await screen.findByRole('option', { name: /HAN.*Hanoi/i }));
    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));

    await waitFor(() => {
      const searchRequest = fetchImpl.mock.calls.find(([url]) => url.includes('/flights/search?'));
      expect(searchRequest).toBeDefined();
      const params = new URL(searchRequest[0], 'http://localhost').searchParams;
      expect(params.get('departure_airport_id')).toBe('1');
      expect(params.get('arrival_airport_id')).toBe('3');
    });
  });

  it('falls back to manual origin selection when the nearest airport is the destination', async () => {
    const user = userEvent.setup();
    const geolocation = mockGeolocation({ latitude: 21.2212, longitude: 105.807 });
    try {
      renderRoutes('/', createFetch());

      const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
      await user.click(origin);
      await user.click(await screen.findByRole('option', { name: /HAN.*Hanoi/i }));
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));

      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveValue(''));
      expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('HAN · Hanoi');
      expect(screen.getByRole('alert')).toHaveTextContent('Sân bay gần vị trí của bạn trùng điểm đến');
      expect(origin).toHaveFocus();
    } finally {
      geolocation.restore();
    }
  });

  it('explains when a suggested destination is not present in the Airport API', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch({ airportResponse: airports.slice(0, 2) });
    renderRoutes('/', fetchImpl);

    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Đà Nẵng (DAD)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy sân bay DAD trong dữ liệu hiện có.');
    expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('');
  });

  it('supports activating a destination card with Enter', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const hanoi = screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' });
    hanoi.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('HAN · Hanoi'));
  });

  it('ignores a late result from an earlier destination card activation', async () => {
    const user = userEvent.setup();
    let resolveHan;
    let resolveSgn;
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/airports?')) {
        const search = new URL(url, 'http://localhost').searchParams.get('search');
        if (search === 'HAN') return new Promise((resolve) => { resolveHan = () => resolve(response({ success: true, data: [airports[0]] })); });
        if (search === 'SGN') return new Promise((resolve) => { resolveSgn = () => resolve(response({ success: true, data: [airports[1]] })); });
        return Promise.resolve(response({ success: true, data: airports }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderRoutes('/', fetchImpl);

    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));
    await waitFor(() => expect(resolveHan).toBeTypeOf('function'));
    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến TP. Hồ Chí Minh (SGN)' }));
    await waitFor(() => expect(resolveSgn).toBeTypeOf('function'));

    resolveSgn();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('SGN · Ho Chi Minh City'));
    resolveHan();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('SGN · Ho Chi Minh City'));
  });

  it('falls back to manual origin selection when geolocation is too inaccurate', async () => {
    const user = userEvent.setup();
    const geolocation = mockGeolocation({ latitude: 10.8188, longitude: 106.652, accuracy: 25_001 });
    const fetchImpl = createFetch();
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Vị trí chưa đủ chính xác');
      expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('HAN · Hanoi');
      expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveFocus();
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
    } finally {
      geolocation.restore();
    }
  });

  it('falls back to the form when the browser denies location access', async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success, failure) => failure({ code: 1 }) },
    });
    const fetchImpl = createFetch();
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Đà Nẵng (DAD)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Vị trí không khả dụng');
      expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('DAD · Da Nang');
      expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveFocus();
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, 'geolocation', original);
      else delete navigator.geolocation;
    }
  });

  it('does not start a flight search when Airport API data fails during origin resolution', async () => {
    const user = userEvent.setup();
    const geolocation = mockGeolocation({ latitude: 10.8188, longitude: 106.652 });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/airports?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        if (params.get('limit') === '100') return response({ message: 'Airport API unavailable.' }, 503);
        return response({ success: true, data: airports, pagination: { page: 1, limit: Number(params.get('limit')), total: airports.length, totalPages: 1 } });
      }
      if (url.includes('/flights/search?')) return response({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác định sân bay gần bạn');
      expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('HAN · Hanoi');
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
    } finally {
      geolocation.restore();
    }
  });

  it('uses API airport records from later pages when resolving a nearby origin', async () => {
    const user = userEvent.setup();
    const geolocation = mockGeolocation({ latitude: 10.8188, longitude: 106.652 });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/airports?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        const search = params.get('search');
        const page = Number(params.get('page'));
        if (search) return response({ success: true, data: [airports[0]], pagination: { page, limit: 20, total: 1, totalPages: 1 } });
        return response({ success: true, data: page === 1 ? [airports[0]] : [airports[1]], pagination: { page, limit: 100, total: 2, totalPages: 2 } });
      }
      if (url.includes('/flights/search?')) return response({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));

      await waitFor(() => {
        const searchCall = fetchImpl.mock.calls.find(([url]) => url.includes('/flights/search?'));
        expect(searchCall).toBeDefined();
        expect(new URL(searchCall[0], 'http://localhost').searchParams.get('departure_airport_id')).toBe('2');
      });
      expect(fetchImpl.mock.calls.some(([url]) => new URL(url, 'http://localhost').searchParams.get('page') === '2')).toBe(true);
    } finally {
      geolocation.restore();
    }
  });

  it('ignores an older GPS result when the user activates a newer destination card', async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    const successCallbacks = [];
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success) => successCallbacks.push(success) },
    });
    const fetchImpl = createFetch();
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Hà Nội (HAN)' }));
      await waitFor(() => expect(successCallbacks).toHaveLength(1));
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Đà Nẵng (DAD)' }));
      await waitFor(() => expect(successCallbacks).toHaveLength(2));

      successCallbacks[1]({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 500 } });
      await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(true));
      successCallbacks[0]({ coords: { latitude: 21.2212, longitude: 105.807, accuracy: 500 } });
      await waitFor(() => {
        const searches = fetchImpl.mock.calls.filter(([url]) => url.includes('/flights/search?'));
        expect(searches).toHaveLength(1);
        const params = new URL(searches[0][0], 'http://localhost').searchParams;
        expect(params.get('departure_airport_id')).toBe('2');
        expect(params.get('arrival_airport_id')).toBe('3');
      });
    } finally {
      if (original) Object.defineProperty(navigator, 'geolocation', original);
      else delete navigator.geolocation;
    }
  });

  it('does not override manual airport selection while a GPS suggestion is pending', async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    let resolvePosition;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success) => { resolvePosition = success; } },
    });
    const fetchImpl = createFetch();
    try {
      renderRoutes('/', fetchImpl);
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay đến Đà Nẵng (DAD)' }));
      await waitFor(() => expect(resolvePosition).toBeTypeOf('function'));
      await user.click(screen.getByRole('combobox', { name: 'Điểm đi' }));
      await user.click(await screen.findByRole('option', { name: /HAN.*Hanoi/i }));
      resolvePosition({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 500 } });

      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveValue('HAN · Hanoi'));
      expect(screen.getByRole('combobox', { name: 'Điểm đến' })).toHaveValue('DAD · Da Nang');
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, 'geolocation', original);
      else delete navigator.geolocation;
    }
  });

  it('uses only supported airports present in API data and rejects locations outside the supported radius', () => {
    const near = findNearestSupportedAirport({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 500 } }, airports);
    expect(near?.airport).toBe(airports[1]);
    expect(findNearestSupportedAirport({ coords: { latitude: 0, longitude: 0, accuracy: 500 } }, airports)).toBeNull();
    expect(findNearestSupportedAirport({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 25_001 } }, airports)).toBeNull();
    expect(findNearestSupportedAirport({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 500 } }, [
      { ...airports[1], country: 'Việt Nam' },
    ])?.airport).toEqual({ ...airports[1], country: 'Việt Nam' });
    expect(findNearestSupportedAirport({ coords: { latitude: 10.8188, longitude: 106.652, accuracy: 500 } }, [
      { ...airports[1], country: 'Thailand' },
    ])).toBeNull();
  });

  it('closes the selected airport dropdown and keeps the selected airport label', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    await user.click(origin);
    await user.click(await screen.findByRole('option', { name: /HAN.*Hanoi/i }));

    expect(origin).toHaveValue('HAN · Hanoi');
    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Điểm đi options' })).not.toBeInTheDocument();
  });

  it('keeps only the destination dropdown open when switching from origin', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    const destination = screen.getByRole('combobox', { name: 'Điểm đến' });
    await user.click(origin);
    expect(origin).toHaveAttribute('aria-expanded', 'true');

    await user.click(destination);
    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(destination).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
  });

  it('focuses the other airport input when its mobile hit area is covered by the open list', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    const destination = screen.getByRole('combobox', { name: 'Điểm đến' });
    await user.click(origin);
    const coveredPoint = { left: 1000, right: 1100, top: 1000, bottom: 1100, width: 100, height: 100, x: 1000, y: 1000, toJSON: () => ({}) };
    vi.spyOn(destination, 'getBoundingClientRect').mockReturnValue(coveredPoint);

    fireEvent.pointerDown(screen.getByRole('option', { name: /HAN.*Hanoi/i }), { clientX: 1050, clientY: 1050 });

    expect(document.activeElement).toBe(destination);
    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(destination).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
  });

  it('closes the open airport dropdown on an outside pointer click', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    await user.click(origin);
    await user.click(screen.getByRole('heading', { name: /Bay đến nơi/i }));

    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape and reopens when the focused input is clicked again', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    await user.click(origin);
    await user.keyboard('{Escape}');
    expect(origin).toHaveAttribute('aria-expanded', 'false');

    await user.click(origin);
    expect(origin).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
  });

  it('supports selecting an airport with the combobox keyboard controls', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    await user.click(origin);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(origin).toHaveValue('HAN · Hanoi');
    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps searching airports through the existing API as the query changes', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch({ airportResponse: [airports[1]] });
    renderRoutes('/', fetchImpl);

    await user.type(screen.getByRole('combobox', { name: 'Điểm đi' }), 'Ho Chi Minh');

    await waitFor(() => {
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/airports?') && url.includes('search=Ho+Chi+Minh'))).toBe(true);
    });
    expect(await screen.findByRole('option', { name: /SGN.*Ho Chi Minh City/i })).toBeInTheDocument();
  });

  it('ignores an older airport search response that arrives after a newer query', async () => {
    const user = userEvent.setup();
    let resolveHan;
    let resolveSgn;
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/airports?')) {
        const search = new URL(url, 'http://localhost').searchParams.get('search');
        if (search === 'HAN') return new Promise((resolve) => { resolveHan = () => resolve(response({ success: true, data: [airports[0]] })); });
        if (search === 'SGN') return new Promise((resolve) => { resolveSgn = () => resolve(response({ success: true, data: [airports[1]] })); });
        return Promise.resolve(response({ success: true, data: airports }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderRoutes('/', fetchImpl);

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    await user.type(origin, 'HAN');
    await waitFor(() => expect(resolveHan).toBeTypeOf('function'));
    await user.clear(origin);
    await user.type(origin, 'SGN');
    await waitFor(() => expect(resolveSgn).toBeTypeOf('function'));

    resolveSgn();
    expect(await screen.findByRole('option', { name: /SGN.*Ho Chi Minh City/i })).toBeInTheDocument();
    resolveHan();
    await waitFor(() => expect(screen.queryByRole('option', { name: /HAN.*Hanoi/i })).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: /SGN.*Ho Chi Minh City/i })).toBeInTheDocument();
  });

  it('swaps selected airports and closes the dropdown', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    const destination = screen.getByRole('combobox', { name: 'Điểm đến' });
    await user.click(origin);
    await user.click(await screen.findByRole('option', { name: /HAN.*Hanoi/i }));
    await user.click(destination);
    await user.click(await screen.findByRole('option', { name: /SGN.*Ho Chi Minh City/i }));
    await user.click(destination);
    await user.click(screen.getByRole('button', { name: 'Đổi điểm đi và điểm đến' }));

    expect(origin).toHaveValue('SGN · Ho Chi Minh City');
    expect(destination).toHaveValue('HAN · Hanoi');
    expect(origin).toHaveAttribute('aria-expanded', 'false');
    expect(destination).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('preserves the swap action when an open mobile dropdown covers its hit area', async () => {
    const user = userEvent.setup();
    renderRoutes('/', createFetch());

    const origin = screen.getByRole('combobox', { name: 'Điểm đi' });
    const destination = screen.getByRole('combobox', { name: 'Điểm đến' });
    await user.click(origin);
    await user.click(screen.getByRole('option', { name: /HAN.*Hanoi/i }));
    await user.click(destination);
    await user.click(screen.getByRole('option', { name: /SGN.*Ho Chi Minh City/i }));
    await user.click(origin);

    const swap = screen.getByRole('button', { name: 'Đổi điểm đi và điểm đến' });
    vi.spyOn(swap, 'getBoundingClientRect').mockReturnValue({ left: 1000, right: 1100, top: 1000, bottom: 1100, width: 100, height: 100, x: 1000, y: 1000, toJSON: () => ({}) });
    fireEvent.pointerDown(screen.getByRole('option', { name: /HAN.*Hanoi/i }), { clientX: 1050, clientY: 1050 });

    expect(origin).toHaveValue('SGN · Ho Chi Minh City');
    expect(destination).toHaveValue('HAN · Hanoi');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('uses only local illustrative destination photography on the homepage', async () => {
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    expect(await screen.findByRole('heading', { name: /Khám phá các điểm đến/i })).toBeInTheDocument();
    const destinationImages = [...document.querySelectorAll('.destination-art')]
      .map((element) => element.style.backgroundImage);
    expect(destinationImages).toHaveLength(3);
    expect(destinationImages.every((image) => image.startsWith('url(') && image.includes('/images/destinations/'))).toBe(true);
    expect(destinationImages.some((image) => image.startsWith('url(https://'))).toBe(false);
  });

  it('validates and serializes search values into the results URL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00+07:00'));
    try {
      const user = userEvent.setup();
      const fetchImpl = createFetch();
      renderRoutes('/', fetchImpl);

      await user.click(screen.getByRole('combobox', { name: 'Điểm đi' }));
      await user.click(screen.getByRole('option', { name: /HAN.*Hanoi/i }));
      await user.click(screen.getByRole('combobox', { name: 'Điểm đến' }));
      await user.click(screen.getByRole('option', { name: /SGN.*Ho Chi Minh City/i }));
      await user.clear(screen.getByLabelText(/departure/i));
      await user.type(screen.getByLabelText(/departure/i), '2026-10-10');
      await user.clear(screen.getByLabelText(/passengers/i));
      await user.type(screen.getByLabelText(/passengers/i), '2');
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));

      expect(await screen.findByRole('heading', { name: /Chuyến bay phù hợp/i })).toBeInTheDocument();
      const searchUrl = fetchImpl.mock.calls.map(([url]) => url).find((url) => url.includes('/flights/search?'));
      expect(searchUrl).toBeTruthy();
      const params = new URL(searchUrl, 'http://localhost').searchParams;
      expect(params.get('departure_airport_id')).toBe('1');
      expect(params.get('arrival_airport_id')).toBe('2');
      expect(params.get('departure_date')).toBe('2026-10-10');
      expect(params.get('min_seats')).toBe('2');
      expect(params.has('trip_type')).toBe(false);
      expect(params.has('return_date')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a departure date before the frozen current date without searching', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00+07:00'));
    try {
      const user = userEvent.setup();
      const fetchImpl = createFetch();
      renderRoutes('/', fetchImpl);

      await user.click(screen.getByRole('combobox', { name: 'Điểm đi' }));
      await user.click(screen.getByRole('option', { name: /HAN.*Hanoi/i }));
      await user.click(screen.getByRole('combobox', { name: 'Điểm đến' }));
      await user.click(screen.getByRole('option', { name: /SGN.*Ho Chi Minh City/i }));
      await user.clear(screen.getByLabelText(/departure/i));
      await user.type(screen.getByLabelText(/departure/i), '2026-10-09');
      await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Ngày khởi hành không được ở quá khứ.');
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/flights/search?'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows inline validation and does not call flight search when required airports are missing', async () => {
    const user = userEvent.setup();
    const fetchImpl = createFetch();
    renderRoutes('/', fetchImpl);

    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));
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
    const pageRows = [...flights, ...Array.from({ length: 19 }, (_, index) => ({ ...flights[0], id: index + 30, airline: { name: `Test Airline ${index}` }, fareClasses: [] }))];
    const fetchImpl = createFetch({ flightResponse: pageRows });
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=2&page=1&limit=20&trip_type=round_trip&return_date=2026-10-15', fetchImpl);

    expect(await screen.findByText('Serene Air')).toBeInTheDocument();
    expect(screen.getAllByText('HAN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SGN').length).toBeGreaterThan(0);
    expect(screen.getByText(/1\.250\.000/)).toBeInTheDocument();
    const firstRequest = fetchImpl.mock.calls.find(([url]) => url.includes('/flights/search?'))[0];
    expect(firstRequest).not.toContain('trip_type');
    expect(firstRequest).not.toContain('return_date');

    await user.click(screen.getByRole('button', { name: 'Sang trang tiếp theo' }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    const secondRequest = fetchImpl.mock.calls.map(([url]) => url).find((url) => url.includes('/flights/search?') && url.includes('page=2'));
    expect(secondRequest).not.toContain('trip_type');
    expect(secondRequest).not.toContain('return_date');
  });

  it('reports the number of flights on the current page instead of trusting inconsistent total metadata', async () => {
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20', createFetch());

    expect(await screen.findByText('1 chuyến bay trên trang này')).toBeInTheDocument();
  });

  it('does not claim an unreliable total page count and recovers from an empty next page', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({ ...flights[0], id: index + 1 }));
    const fetchImpl = vi.fn(async (url) => {
      const requestedPage = Number(new URL(url, 'http://localhost').searchParams.get('page'));
      return response({ success: true, data: requestedPage === 1 ? fullPage : [], pagination: { page: requestedPage, limit: 20, total: 21, totalPages: 2 } });
    });
    const user = userEvent.setup();
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20', fetchImpl);

    expect(await screen.findByText('20 chuyến bay trên trang này')).toBeInTheDocument();
    expect(screen.queryByText(/\/\s*2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sang trang tiếp theo' }));

    expect(await screen.findByText('Trang này không có chuyến bay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quay lại trang trước' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Quay lại trang trước' }));
    expect(await screen.findByText('20 chuyến bay trên trang này')).toBeInTheDocument();
  });

  it('keeps a local carrier mark when a remote airline logo cannot load', async () => {
    const flightResponse = [{ ...flights[0], airline: { ...flights[0].airline, logo_url: 'https://invalid.example/logo.png' } }];
    renderRoutes('/flights/search?departure_airport_id=1&arrival_airport_id=2&departure_date=2026-10-10&min_seats=1&page=1&limit=20', createFetch({ flightResponse }));

    const logo = await screen.findByAltText('');
    fireEvent.error(logo);
    expect(logo).not.toBeVisible();
    expect(document.querySelector('.carrier-mark')).toBeVisible();
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
