import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBookingsPage, BookingCreatePage, BookingDetailPage, BookingLookupPage, MyBookingsPage } from './BookingPages';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: null, status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, user: mocks.user, status: mocks.status }) }));

const flight = { id: 17, departure_airport_id: 1, arrival_airport_id: 2, departure_time: '2026-10-12T10:00:00Z', arrival_time: '2026-10-12T12:00:00Z', available_seats: 20, airline: { name: 'Airline' }, departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const renderPage = (page, path = '/') => render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);
const renderBookingDetail = () => render(<MemoryRouter initialEntries={['/bookings/7']}><Routes><Route path="/bookings/:id" element={<BookingDetailPage />} /></Routes></MemoryRouter>);

describe('booking customer pages', () => {
  beforeEach(() => { mocks.user = null; mocks.status = 'anonymous'; mocks.request.mockReset(); });

  it('looks up a guest booking with canonical guest_email', async () => {
    mocks.request.mockResolvedValue({ id: 7, booking_code: 'BK123', status: 'holding', flight });
    renderPage(<BookingLookupPage />);
    await userEvent.setup().type(screen.getByLabelText('Mã đặt chỗ'), 'BK123');
    await userEvent.setup().type(screen.getByLabelText('Email liên hệ'), 'guest@example.com');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tra cứu đặt chỗ' }));
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith('/bookings/lookup/BK123?guest_email=guest%40example.com');
  });

  it('renders the legacy primary flight and each additional segment exactly once', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ id: 7, booking_code: 'BK123', status: 'holding', total_amount: 1000,
      flight: { ...flight, departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } },
      fareClass: { class_name: 'Economy' }, passengers: [], payments: [],
      itinerarySegments: [
        { id: 70, leg_order: 1, flight: { ...flight, departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } }, fareClass: { class_name: 'Economy' } },
        { id: 71, leg_order: 2, flight: { ...flight, departureAirport: { iata_code: 'SGN' }, arrivalAirport: { iata_code: 'DAD' } }, fareClass: { class_name: 'Business' } },
      ],
    });
    renderBookingDetail();
    const itinerary = await screen.findByRole('list');
    expect(within(itinerary).getAllByRole('listitem')).toHaveLength(2);
    expect(within(itinerary).getAllByRole('listitem')[0]).toHaveTextContent('HAN → SGN');
    expect(within(itinerary).getAllByRole('listitem')[1]).toHaveTextContent('SGN → DAD');
  });

  it('shows all itinerary legs and payment/refund states on a customer booking detail', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ id: 7, booking_code: 'BK-MULTI', status: 'cancelled', total_amount: 1200000,
      flight, fareClass: { class_name: 'Economy' }, passengers: [{ id: 4, passenger_name: 'An' }],
      itinerarySegments: [{ id: 72, leg_order: 2, flight: { ...flight, departure_airport_id: 2, arrival_airport_id: 3, departureAirport: { iata_code: 'SGN' }, arrivalAirport: { iata_code: 'DAD' } }, fareClass: { class_name: 'Business' } }],
      payments: [{ id: 9, payment_method: 'vnpay', status: 'refunded', amount: 1200000, paid_at: '2026-10-16T10:00:00Z' }],
    });
    renderBookingDetail();
    expect(await screen.findByRole('list', { name: 'Chi tiết các chặng' })).toHaveTextContent('HAN → SGN');
    expect(screen.getByRole('list', { name: 'Chi tiết các chặng' })).toHaveTextContent('SGN → DAD');
    expect(screen.getByText('Thanh toán và hoàn tiền')).toBeInTheDocument();
    expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument();
    expect(screen.queryByText('Lịch sử trạng thái')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy đặt chỗ' })).not.toBeInTheDocument();
  });

  it('shows real status history and payment details only on Admin booking detail', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ id: 7, booking_code: 'BK-ADMIN', status: 'confirmed', total_amount: 1200000, flight,
      user: { full_name: 'Demo Customer', email: 'customer@example.test' }, passengers: [],
      payments: [{ id: 9, payment_method: 'payos', status: 'success', amount: 1200000, paid_at: '2026-10-16T10:00:00Z' }],
      statusHistory: [{ id: 1, from_status: 'holding', to_status: 'pending_payment', source: 'payment_initiated', created_at: '2026-10-16T09:00:00Z' }, { id: 2, from_status: 'pending_payment', to_status: 'confirmed', source: 'payment_payos_success', created_at: '2026-10-16T10:00:00Z' }],
    });
    render(<MemoryRouter initialEntries={['/admin/bookings/7']}><Routes><Route path="/admin/bookings/:id" element={<BookingDetailPage admin />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Lịch sử trạng thái')).toBeInTheDocument();
    expect(screen.getByText('Bắt đầu thanh toán')).toBeInTheDocument();
    expect(screen.getByTitle('payment_initiated')).toHaveTextContent('Bắt đầu thanh toán');
    expect(screen.getByText('Thanh toán payOS thành công')).toBeInTheDocument();
    expect(screen.getByTitle('payment_payos_success')).toHaveTextContent('Thanh toán payOS thành công');
    expect(screen.getByText('Demo Customer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute('href', '/admin/payments/9');
  });

  it.each([1, 2, 3])('preserves a %i-passenger search through fare selection without creating a booking', async (count) => {
    mocks.user = { id: 2, role: 'customer' };
    mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [] };
      if (path === '/flights/17') return flight;
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />, `/bookings/new?flight_id=17&passengers=${count}`);
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getAllByLabelText('Họ tên')).toHaveLength(count);
    expect(screen.getByRole('complementary', { name: 'Tóm tắt hành trình' })).toHaveTextContent(String(count));
    expect(screen.getByText('Giá tham khảo trước ưu đãi')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Tóm tắt hành trình' })).toHaveTextContent(new RegExp(`${(count * 1000000).toLocaleString('vi-VN')}\\s*₫`));
    expect(mocks.request.mock.calls.some(([path]) => path === '/bookings')).toBe(false);
  });

  it('submits optional server-configured ancillaries per passenger without client-supplied prices', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [] };
      if (path === '/flights/17') return flight;
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Economy', price: '1000.00' }] };
      if (path === '/ancillaries?flight_id=17&fare_class_id=5') return { data: [{ id: 80, offer_name: '20 kg', unit_price: '250.50', capacity: 10, reserved_quantity: 0, service: { name: 'Hành lý' }, refund_policy: 'non_refundable' }] };
      if (path === '/bookings') return { id: 70, status: 'holding' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />, '/bookings/new?flight_id=17&passengers=2');
    await user.click(await screen.findByRole('radio', { name: /Economy/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    const choices = await screen.findAllByRole('checkbox');
    expect(choices).toHaveLength(2);
    await user.click(choices[0]); await user.click(choices[1]);
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng 20 kg cho hành khách 1, chặng 1' }));
    const nameInputs = screen.getAllByLabelText(/Họ tên/);
    await user.type(nameInputs[0], 'First Passenger'); await user.type(nameInputs[1], 'Second Passenger');
    await user.click(screen.getByRole('button', { name: 'Tạo đặt chỗ và tiếp tục thanh toán' }));
    await waitFor(() => {
      const createCall = mocks.request.mock.calls.find(([path]) => path === '/bookings');
      expect(createCall[1].body.ancillary_selections).toEqual([
        { offer_id: 80, leg_order: 1, passenger_index: 0, quantity: 2 },
        { offer_id: 80, leg_order: 1, passenger_index: 1, quantity: 1 },
      ]);
      expect(JSON.stringify(createCall[1].body)).not.toContain('unit_price');
    });
  }, 15000); // Timeout 15s: luồng chọn dịch vụ bổ sung và nhập thông tin nhiều hành khách

  it('loads a selected multi-leg itinerary and submits one booking containing every real flight and fare', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    const returnFlight = { ...flight, id: 18, departure_airport_id: 2, arrival_airport_id: 1, departure_time: '2026-10-15T10:00:00Z', arrival_time: '2026-10-15T12:00:00Z', departureAirport: { iata_code: 'SGN' }, arrivalAirport: { iata_code: 'HAN' } };
    mocks.request.mockImplementation(async (path, options) => {
      if (path.startsWith('/airports?')) return { data: [] };
      if (path === '/flights/17') return flight;
      if (path === '/flights/18') return returnFlight;
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] };
      if (path === '/fare-classes/flight/18') return { data: [{ id: 6, class_name: 'Thương gia', price: 2500000 }] };
      if (path === '/bookings') return { id: 104, booking_code: 'BK104' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />, '/bookings/new?trip_type=round_trip&passengers=2&itinerary_legs=%5B%7B%22flight_id%22%3A17%2C%22fare_class_id%22%3A5%7D%2C%7B%22flight_id%22%3A18%2C%22fare_class_id%22%3A6%7D%5D');
    expect(await screen.findByText(/Chặng 2: SGN → HAN/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Họ tên')).toHaveLength(2);
    expect(screen.getByRole('complementary', { name: 'Tóm tắt hành trình' })).toHaveTextContent('7.000.000');
    const nameFields = screen.getAllByLabelText('Họ tên');
    await user.type(nameFields[0], 'Nguyen Van A');
    await user.type(nameFields[1], 'Nguyen Van B');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({
        flight_id: 17, fare_class_id: 5,
        trip_type: 'round_trip', itinerary_legs: [{ flight_id: 17, fare_class_id: 5 }, { flight_id: 18, fare_class_id: 6 }],
      }),
    })));
  });

  it('ignores stale fare-class responses after selecting a different booking flight', async () => {
    const firstFare = deferred(); const secondFare = deferred();
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [{ id: 1, iata_code: 'HAN' }, { id: 2, iata_code: 'SGN' }] };
      if (path.startsWith('/flights/search?')) return { data: [flight, { ...flight, id: 18, arrivalAirport: { iata_code: 'DAD' } }] };
      if (path === '/fare-classes/flight/17') return firstFare.promise;
      if (path === '/fare-classes/flight/18') return secondFare.promise;
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />);
    await screen.findByLabelText('Sân bay đi');
    await user.selectOptions(screen.getByLabelText('Sân bay đi'), '1');
    await user.selectOptions(screen.getByLabelText('Sân bay đến'), '2');
    await user.type(screen.getByLabelText('Ngày khởi hành'), '2027-02-01');
    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));
    const chooseButtons = await screen.findAllByRole('button', { name: 'Chọn chuyến bay' });
    await user.click(chooseButtons[0]); await user.click(chooseButtons[1]);
    secondFare.resolve({ data: [{ id: 6, class_name: 'Hạng chuyến mới', price: 2000000 }] });
    const newFareOption = await screen.findByRole('radio', { name: /Hạng chuyến mới/ });
    await user.click(newFareOption);
    await act(async () => {
      firstFare.resolve({ data: [{ id: 5, class_name: 'Hạng chuyến cũ', price: 1000000 }] });
      await firstFare.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('radio', { name: /Hạng chuyến mới/ })).toBeChecked();
    expect(screen.queryByText('Hạng chuyến cũ')).not.toBeInTheDocument();
  });

  it('keeps passenger details and stays on the form when the server rejects depleted fare inventory', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [] };
      if (path === '/flights/17') return flight;
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000, seat_quota: 20 }] };
      if (path === '/bookings') throw new Error('Not enough seats in selected fare class. Only 0 remaining');
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/bookings/new?flight_id=17&passengers=1']}><Routes>
      <Route path="/bookings/new" element={<BookingCreatePage />} />
      <Route path="*" element={<p>Unexpected success navigation</p>} />
    </Routes></MemoryRouter>);
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    expect(screen.getByText(/20 ghế phân bổ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.type(screen.getByLabelText('Họ tên'), 'Nguyen Van A');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    expect(await screen.findByText('Not enough seats in selected fare class. Only 0 remaining')).toBeInTheDocument();
    expect(screen.getByLabelText('Họ tên')).toHaveValue('Nguyen Van A');
    expect(screen.getByRole('button', { name: /Tạo đặt chỗ/ })).toBeEnabled();
    expect(screen.queryByText('Unexpected success navigation')).not.toBeInTheDocument();
    expect(mocks.request.mock.calls.filter(([path]) => path === '/bookings')).toHaveLength(1);
  });

  it('lets each passenger select an API-backed seat for a configured flight and submits it with booking', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path, options) => {
      if (path.startsWith('/airports?')) return { data: [] };
      if (path === '/flights/17') return flight;
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] };
      if (path === '/seat-selection/flights/17/map') return { supported: true, row_count: 1, column_count: 2, aisle_after: [1], seats: [{ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', fare_class_id: 5, status: 'available', special_properties: [] }, { seat_no: '1B', row_number: 1, column_number: 2, zone: 'business', fare_class_id: 9, status: 'available', special_properties: [] }] };
      if (path === '/bookings') return { id: 105, booking_code: 'BK105' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />, '/bookings/new?flight_id=17&passengers=1');
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    const availableSeat = await screen.findByRole('button', { name: '1A, trống' });
    expect(document.querySelectorAll('.seat-aisle')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '1B, không thuộc hạng vé' })).toHaveStyle({ gridColumn: '3' });
    await user.click(availableSeat);
    expect(screen.getByRole('button', { name: '1B, không thuộc hạng vé' })).toBeDisabled();
    await user.type(screen.getByLabelText('Họ tên'), 'Nguyen Van A');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ seat_selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }] }) })));
  });

  it('requires a valid guest email before sending booking creation', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [{ id: 1, iata_code: 'HAN', city: 'Hà Nội' }, { id: 2, iata_code: 'SGN', city: 'TP. Hồ Chí Minh' }] };
      if (path.startsWith('/flights/search?')) return { data: [flight], pagination: { page: 1, totalPages: 1 } };
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000, seat_quota: 20 }] };
      if (path === '/bookings') return { id: 99, booking_code: 'BK99' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />);
    await screen.findByLabelText('Sân bay đi');
    await user.selectOptions(screen.getByLabelText('Sân bay đi'), '1');
    await user.selectOptions(screen.getByLabelText('Sân bay đến'), '2');
    await user.type(screen.getByLabelText('Ngày khởi hành'), '2026-10-12');
    await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' }));
    await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getByRole('complementary', { name: 'Tóm tắt hành trình' })).toHaveTextContent('Airline');
    expect(screen.getByRole('complementary', { name: 'Tóm tắt hành trình' })).toHaveTextContent('Phổ thông');
    expect(screen.queryByText(/chọn ghế|hành lý|suất ăn/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Họ tên'), 'Nguyen Van A');
    await user.type(screen.getByLabelText('Email liên hệ'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    expect(await screen.findByText(/email hợp lệ/i)).toBeInTheDocument();
    expect(mocks.request.mock.calls.some(([path]) => path === '/bookings')).toBe(false);
  }, 15000); // Timeout 15s: luồng tìm chuyến bay, chọn hạng vé và nhập email khách vãng lai qua userEvent

  it('creates an authenticated booking without guest_email', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/airports?')) return { data: [{ id: 1, iata_code: 'HAN' }, { id: 2, iata_code: 'SGN' }] };
      if (path.startsWith('/flights/search?')) return { data: [flight] };
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] };
      if (path === '/bookings') return { id: 102, booking_code: 'BK102' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />);
    await screen.findByLabelText('Sân bay đi');
    await user.selectOptions(screen.getByLabelText('Sân bay đi'), '1'); await user.selectOptions(screen.getByLabelText('Sân bay đến'), '2');
    await user.type(screen.getByLabelText('Ngày khởi hành'), '2026-10-12'); await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' })); await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' })); await user.type(screen.getByLabelText('Họ tên'), 'Nguyen Van A');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings', expect.objectContaining({ method: 'POST', body: expect.not.objectContaining({ guest_email: expect.anything() }) })));
  });

  it('validates a promotion before including promotion_code in booking creation', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockImplementation(async (path, options) => {
      if (path.startsWith('/airports?')) return { data: [{ id: 1, iata_code: 'HAN' }, { id: 2, iata_code: 'SGN' }] };
      if (path.startsWith('/flights/search?')) return { data: [flight] };
      if (path === '/fare-classes/flight/17') return { data: [{ id: 5, class_name: 'Phổ thông', price: 1000000 }] };
      if (path === '/promotions/validate/SKY10') return { id: 8, code: 'SKY10', discount_type: 'percent', discount_value: '10.00' };
      if (path === '/bookings') return { id: 103, booking_code: 'BK103', total_amount: 900000 };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderPage(<BookingCreatePage />);
    await screen.findByLabelText('Sân bay đi');
    await user.selectOptions(screen.getByLabelText('Sân bay đi'), '1'); await user.selectOptions(screen.getByLabelText('Sân bay đến'), '2');
    await user.type(screen.getByLabelText('Ngày khởi hành'), '2026-10-12'); await user.click(screen.getByRole('button', { name: 'Tìm chuyến bay' }));
    await user.click(await screen.findByRole('button', { name: 'Chọn chuyến bay' })); await user.click(await screen.findByRole('radio', { name: /Phổ thông/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.type(screen.getByLabelText('Mã khuyến mại (không bắt buộc)'), 'sky10');
    await user.click(screen.getByRole('button', { name: 'Kiểm tra mã' }));
    expect(await screen.findByText(/Mã SKY10 hợp lệ/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Họ tên'), 'Nguyen Van A');
    await user.click(screen.getByRole('button', { name: /Tạo đặt chỗ/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({ promotion_code: 'SKY10' }),
    })));
  });

  it('loads My Bookings with pagination and the selected status', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [{ id: 7, booking_code: 'BK123', status: 'confirmed', total_amount: 4000, flight }], pagination: { page: 2, totalPages: 3, total: 21 } });
    renderPage(<MyBookingsPage />, '/bookings/my?page=2&status=confirmed');
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith('/bookings/my-bookings?page=2&limit=10&status=confirmed');
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('searches only the authenticated customer booking list by booking code', async () => {
    mocks.user = { id: 2, role: 'customer' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    const user = userEvent.setup();
    renderPage(<MyBookingsPage />, '/bookings/my');
    await user.type(await screen.findByLabelText('Tìm mã đặt chỗ'), 'BK-2026');
    await user.click(screen.getByRole('button', { name: 'Tìm' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings/my-bookings?page=1&limit=10&search=BK-2026'));
  });

  it('loads staff booking management using backend search/status filters', async () => {
    mocks.user = { id: 3, role: 'staff' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [{ id: 8, booking_code: 'BKSTAFF', status: 'holding', guest_email: 'guest@example.com', flight }], pagination: { page: 1, totalPages: 1, total: 1 } });
    renderPage(<AdminBookingsPage />, '/admin/bookings?status=holding&search=BKSTAFF');
    expect((await screen.findAllByText('BKSTAFF')).length).toBeGreaterThan(0);
    expect(mocks.request).toHaveBeenCalledWith('/bookings/admin/all?page=1&limit=10&status=holding&search=BKSTAFF');
    expect(screen.queryByRole('link', { name: 'Chi tiết' })).not.toBeInTheDocument();
  });

  it('lets Admin filter booking management by booking code, customer and flight', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    const user = userEvent.setup();
    renderPage(<AdminBookingsPage />, '/admin/bookings');
    await user.type(await screen.findByLabelText('Mã đặt chỗ'), 'BK-44');
    await user.type(screen.getByLabelText('Khách hàng'), 'an@example.com');
    await user.type(screen.getByLabelText('ID chuyến bay'), '19');
    await user.click(screen.getByRole('button', { name: 'Tìm' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings/admin/all?page=1&limit=10&booking_code=BK-44&customer=an%40example.com&flight_id=19'));
  });

  it('uses report labels for booking status filter options while keeping enum values', async () => {
    mocks.user = { id: 3, role: 'staff' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    renderPage(<AdminBookingsPage />, '/admin/bookings');

    const statusFilter = await screen.findByLabelText('Trạng thái đặt chỗ');
    expect(screen.getByRole('option', { name: 'Đang xử lý thanh toán' })).toHaveValue('pending_payment');
    expect(within(statusFilter).queryByRole('option', { name: 'pending_payment' })).not.toBeInTheDocument();
  });

  it('shows a cancellation confirmation only for a holding guest booking and sends guest_email', async () => {
    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');
    mocks.request.mockImplementation(async (path, options) => {
      if (path.startsWith('/bookings/7?')) return { id: 7, booking_code: 'BK123', status: options ? 'cancelled' : 'holding', total_amount: 1000, flight, passengers: [] };
      if (path === '/bookings/7/cancel') return { message: 'Booking cancelled successfully' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    renderBookingDetail();
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy đặt chỗ' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Chỉ đặt chỗ đang được giữ chỗ');
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/bookings/7/cancel', { method: 'PUT', body: { guest_email: 'guest@example.com' } }));
  });

  it('downloads ticket only for a confirmed booking as a PDF blob', async () => {
    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');
    const pdf = new Blob(['%PDF-ticket'], { type: 'application/pdf' });
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return { id: 7, booking_code: 'BK123', status: 'confirmed', flight, passengers: [] };
      if (path.startsWith('/bookings/7/ticket?')) return pdf;
      throw new Error(`Unexpected request ${path}`);
    });
    const createUrl = vi.fn(() => 'blob:ticket'); const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    renderBookingDetail();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Tải vé PDF' }));
    expect(mocks.request).toHaveBeenCalledWith('/bookings/7/ticket?guest_email=guest%40example.com', { responseType: 'blob' });
    expect(createUrl).toHaveBeenCalledWith(pdf);
  });

  it('provides quick status filter chips and displays remaining hold time for holding bookings', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    const holdExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    mocks.request.mockResolvedValue({
      data: [{ id: 8, booking_code: 'BK-HOLD', status: 'holding', hold_expires_at: holdExpires, flight }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    });
    const user = userEvent.setup();
    renderPage(<AdminBookingsPage />, '/admin/bookings');

    const confirmedChip = await screen.findByRole('button', { name: 'Đã xác nhận' });
    expect(confirmedChip).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tất cả' })).toBeInTheDocument();
    expect(screen.getAllByText(/Còn 1[45]:/).length).toBeGreaterThan(0);

    await user.click(confirmedChip);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining('status=confirmed')));
  });

  it('renders a visual status history timeline for admin booking detail', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({
      id: 7,
      booking_code: 'BK123',
      status: 'confirmed',
      flight,
      passengers: [],
      statusHistory: [
        { id: 101, from_status: null, to_status: 'holding', source: 'customer_web', created_at: '2026-10-25T10:00:00Z' },
        { id: 102, from_status: 'holding', to_status: 'confirmed', source: 'payos_webhook', created_at: '2026-10-25T10:05:00Z', actor: { full_name: 'Cổng payOS' } },
      ],
    });
    renderPage(<BookingDetailPage admin />, '/admin/bookings/7');
    expect(await screen.findByText('Lịch sử trạng thái')).toBeInTheDocument();
    expect(screen.getAllByText('Giữ chỗ / Chờ thanh toán').length).toBeGreaterThan(0);
    expect(screen.getByText('Webhook payOS')).toBeInTheDocument();
    expect(screen.getByTitle('payos_webhook')).toHaveTextContent('Webhook payOS');
    expect(screen.getByText('Đặt chỗ qua website')).toBeInTheDocument();
    expect(screen.getByTitle('customer_web')).toHaveTextContent('Đặt chỗ qua website');
  });
});
