import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBookingsPage, BookingCreatePage, BookingDetailPage, BookingLookupPage, MyBookingsPage } from './BookingPages';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: null, status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, user: mocks.user, status: mocks.status }) }));

const flight = { id: 17, departure_time: '2026-10-12T10:00:00Z', arrival_time: '2026-10-12T12:00:00Z', available_seats: 20, airline: { name: 'Airline' }, departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } };
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
  });

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

  it('loads staff booking management using backend search/status filters', async () => {
    mocks.user = { id: 3, role: 'staff' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [{ id: 8, booking_code: 'BKSTAFF', status: 'holding', guest_email: 'guest@example.com', flight }], pagination: { page: 1, totalPages: 1, total: 1 } });
    renderPage(<AdminBookingsPage />, '/admin/bookings?status=holding&search=BKSTAFF');
    expect((await screen.findAllByText('BKSTAFF')).length).toBeGreaterThan(0);
    expect(mocks.request).toHaveBeenCalledWith('/bookings/admin/all?page=1&limit=10&status=holding&search=BKSTAFF');
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
});
