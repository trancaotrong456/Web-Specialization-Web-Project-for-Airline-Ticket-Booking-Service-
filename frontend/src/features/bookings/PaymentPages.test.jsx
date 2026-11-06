import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPaymentDetailPage, AdminPaymentsPage, AdminRevenuePage, PaymentInitiatePage, PaymentResultPage } from './PaymentPages';
import { setServerTimeOffset } from '../../lib/apiClient';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: null, status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, user: mocks.user, status: mocks.status }) }));

const booking = { id: 7, booking_code: 'BK123', status: 'holding', total_amount: 2500000, hold_expires_at: '2026-10-12T11:00:00Z', passengers: [{}], flight: { departure_time: '2026-10-12T10:00:00Z', departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } } };
const routes = (page, pattern, entry) => render(<MemoryRouter initialEntries={[entry]}><Routes><Route path={pattern} element={page} /></Routes></MemoryRouter>);

describe('payment pages', () => {
  beforeEach(() => { mocks.request.mockReset(); mocks.user = null; mocks.status = 'anonymous'; });

  it('initiates payOS using the guest email and renders only the server-provided QR', async () => {
    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return booking;
      if (path === '/payments/initiate') return { payment_url: null, qr_code: 'data:image/png;base64,serverQr', transaction_ref: 'txn-1', mode: 'demo', demo_notice: 'Academic simulation only.', demo_webhook: { body: { orderCode: 1, signature: 'signed' } } };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<PaymentInitiatePage />, '/bookings/:id/payment', '/bookings/7/payment');
    expect((await screen.findAllByText('BK123')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: /payOS · VietQR/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục thanh toán' }));
    expect(await screen.findByRole('img', { name: 'Mã QR do payOS trả về' })).toHaveAttribute('src', 'data:image/png;base64,serverQr');
    expect(mocks.request).toHaveBeenCalledWith('/payments/initiate', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ booking_id: 7, payment_method: 'payos', guest_email: 'guest@example.com' }) }));
    expect(mocks.request.mock.calls.find(([path]) => path === '/payments/initiate')[1].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('keeps the QR visible and offers a safe checkout link without automatic redirect', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return booking;
      if (path === '/payments/initiate') return { payment_url: 'https://pay.example.test/checkout', qr_code: 'data:image/png;base64,serverQr', transaction_ref: 'txn-2' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<PaymentInitiatePage />, '/bookings/:id/payment', '/bookings/7/payment');
    await screen.findByText('BK123');
    await user.click(screen.getByRole('radio', { name: /payOS · VietQR/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục thanh toán' }));
    expect(await screen.findByRole('img', { name: 'Mã QR do payOS trả về' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang thanh toán payOS' })).toHaveAttribute('href', 'https://pay.example.test/checkout');
    expect(window.location.pathname).not.toBe('/checkout');
  });

  it('shows a fallback when both QR and checkout URL are unavailable', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return booking;
      if (path === '/payments/initiate') return { payment_url: null, qr_code: null, transaction_ref: 'txn-3' };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<PaymentInitiatePage />, '/bookings/:id/payment', '/bookings/7/payment');
    await screen.findByText('BK123');
    await user.click(screen.getByRole('radio', { name: /payOS · VietQR/ }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục thanh toán' }));
    expect(await screen.findByText('Chưa có mã QR hoặc liên kết thanh toán khả dụng. Vui lòng thử lại sau.')).toBeInTheDocument();
    expect(screen.getByText('txn-3')).toBeInTheDocument();
  });

  it('shows every itinerary leg in the payment summary and keeps the server total', async () => {
    mocks.request.mockResolvedValue({
      ...booking,
      total_amount: 3750000,
      itinerarySegments: [
        { id: 20, leg_order: 1, flight: { departure_time: '2026-10-12T10:00:00Z', departureAirport: { iata_code: 'HAN' }, arrivalAirport: { iata_code: 'SGN' } } },
        { id: 22, leg_order: 3, flight: { departure_time: '2026-10-14T10:00:00Z', departureAirport: { iata_code: 'DAD' }, arrivalAirport: { iata_code: 'CXR' } } },
        { id: 21, leg_order: 2, flight: { departure_time: '2026-10-13T10:00:00Z', departureAirport: { iata_code: 'SGN' }, arrivalAirport: { iata_code: 'DAD' } } },
      ],
    });
    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');

    routes(<PaymentInitiatePage />, '/bookings/:id/payment', '/bookings/7/payment');

    const itinerary = await screen.findByRole('list');
    expect(within(itinerary).getAllByRole('listitem')).toHaveLength(2);
    const legs = within(itinerary).getAllByRole('listitem');
    expect(legs[0]).toHaveTextContent('SGN → DAD');
    expect(legs[1]).toHaveTextContent('DAD → CXR');
    expect(screen.getByText(/3\.750\.000/)).toBeInTheDocument();
  });

  it('accurately calculates remaining hold time when client clock is ahead of server', async () => {
    // Giả sử đồng hồ server đang là 2026-10-12T10:50:00Z
    // Client chạy nhanh hơn 15 phút: client Date.now() = 2026-10-12T11:05:00Z (quá hạn hold_expires_at 11:00 nếu không bù trừ)
    // Server time offset = serverTime - clientTime = 10:50 - 11:05 = -15 phút (-900,000ms)
    // Thời gian còn lại thực tế theo server: 11:00 - 10:50 = 10 phút (600s) -> "10:00"
    setServerTimeOffset(-15 * 60 * 1000);
    const clientNow = new Date('2026-10-12T11:05:00Z').getTime();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(clientNow);

    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');
    mocks.request.mockResolvedValue(booking);

    routes(<PaymentInitiatePage />, '/bookings/:id/payment', '/bookings/7/payment');

    expect(await screen.findByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('HẾT HẠN GIỮ CHỖ')).not.toBeInTheDocument();

    nowSpy.mockRestore();
    setServerTimeOffset(0);
  });

  it('uses the submitted-report booking status label on payment result', async () => {
    mocks.request.mockResolvedValue({ booking, payment: { active_attempt: { payment_method: 'payos', status: 'pending', amount: booking.total_amount, transaction_ref: 'txn-result', paid_at: null }, previous_attempts: [], manual_review_required: false, status_confidence: 'authoritative' }, checked_at: '2026-10-12T10:00:00Z' });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&demo=1');
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(screen.getByText(/Thanh toán đang chờ xác nhận từ hệ thống/)).toBeInTheDocument();
  });

  it('hides the payOS webhook notice after authoritative success', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/payments/payos/return?')) return { orderCode: '1001', status: 'PAID', processed: false };
      if (path.startsWith('/payments/bookings/7/status?')) return {
        booking: { ...booking, status: 'confirmed' },
        payment: { active_attempt: { payment_method: 'payos', status: 'success', amount: booking.total_amount, transaction_ref: '1001', paid_at: '2026-10-12T10:00:00Z' }, previous_attempts: [], manual_review_required: false, status_confidence: 'authoritative' },
        checked_at: '2026-10-12T10:00:00Z',
      };
      throw new Error(`Unexpected request ${path}`);
    });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&orderCode=1001&status=PAID');
    expect(await screen.findByText(/Thanh toán thành công và đặt chỗ đã được xác nhận/)).toBeInTheDocument();
    expect(screen.queryByText(/cần được xác nhận qua webhook/)).not.toBeInTheDocument();
  });

  it('keeps the payOS webhook notice while authoritative status is pending', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/payments/payos/return?')) return { orderCode: '1001', status: 'PAID', processed: false };
      if (path.startsWith('/payments/bookings/7/status?')) return {
        booking: { ...booking, status: 'pending_payment' },
        payment: { active_attempt: { payment_method: 'payos', status: 'pending', amount: booking.total_amount, transaction_ref: '1001', paid_at: null }, previous_attempts: [], manual_review_required: false, status_confidence: 'authoritative' },
        checked_at: '2026-10-12T10:00:00Z',
      };
      throw new Error(`Unexpected request ${path}`);
    });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&orderCode=1001&status=PAID');
    expect(await screen.findByText(/cần được xác nhận qua webhook/)).toBeInTheDocument();
  });

  it('uses authoritative payment status and shows manual review without false confirmation', async () => {
    mocks.request.mockResolvedValue({
      booking: { ...booking, status: 'expired' },
      payment: { active_attempt: { payment_method: 'payos', status: 'success', amount: booking.total_amount, transaction_ref: 'late-1', paid_at: '2026-10-12T10:00:00Z' }, previous_attempts: [], manual_review_required: true, status_confidence: 'authoritative' },
      checked_at: '2026-10-12T10:00:00Z',
    });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&status=PAID');
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(screen.getByText(/không còn đủ điều kiện/i)).toBeInTheDocument();
    expect(screen.getByText(/cần được hỗ trợ kiểm tra thủ công/i)).toBeInTheDocument();
    expect(screen.queryByText(/Đã xác nhận/)).not.toBeInTheDocument();
  });

  it('treats VNPay browser return as a hint and reads the authorized status endpoint', async () => {
    const calls = [];
    mocks.request.mockImplementation(async (path) => {
      calls.push(path);
      if (path.startsWith('/payments/vnpay/return?')) return { isSuccess: true, isValidChecksum: true, bookingId: 7 };
      if (path.startsWith('/payments/bookings/7/status?')) return { booking: { ...booking, status: 'confirmed' }, payment: { active_attempt: { payment_method: 'vnpay', status: 'success', amount: booking.total_amount, transaction_ref: 'TXN-1', paid_at: '2026-10-12T10:00:00Z' }, previous_attempts: [], manual_review_required: false, status_confidence: 'authoritative' }, checked_at: '2026-10-12T10:00:00Z' };
      throw new Error(`Unexpected request ${path}`);
    });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&vnp_TxnRef=TXN-1&vnp_ResponseCode=00');
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(screen.getByText(/Thanh toán thành công và đặt chỗ đã được xác nhận/)).toBeInTheDocument();
    expect(calls.some((path) => path.startsWith('/payments/bookings/7/status?'))).toBe(true);
  });

  it('handles payOS cancel as informational and never shows false refund confirmation', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/payments/payos/return?')) return { orderCode: '1001', status: 'CANCELLED', processed: false };
      if (path.startsWith('/payments/bookings/7/status?')) return { booking: { ...booking, status: 'holding' }, payment: { active_attempt: { payment_method: 'payos', status: 'failed', amount: booking.total_amount, transaction_ref: '1001', paid_at: null }, previous_attempts: [], manual_review_required: false, status_confidence: 'authoritative' }, checked_at: '2026-10-12T10:00:00Z' };
      throw new Error(`Unexpected request ${path}`);
    });
    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7&orderCode=1001&cancel=true&status=CANCELLED');
    expect(await screen.findByText('BK123')).toBeInTheDocument();
    expect(screen.getByText(/Thanh toán chưa thành công/)).toBeInTheDocument();
    expect(screen.queryByText(/hoàn tiền thành công/i)).not.toBeInTheDocument();
  });

  it('shows PDF download button on payment result for confirmed bookings and sends guest_email', async () => {
    sessionStorage.setItem('booking_guest_email_7', 'guest@example.com');
    const confirmedBooking = { ...booking, status: 'confirmed' };
    const pdfBlob = new Blob(['%PDF-ticket-data'], { type: 'application/pdf' });
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return confirmedBooking;
      if (path.startsWith('/bookings/7/ticket')) return pdfBlob;
      throw new Error(`Unexpected request ${path}`);
    });
    const createUrl = vi.fn(() => 'blob:ticket');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });

    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7');
    const downloadButton = await screen.findByRole('button', { name: 'Tải vé PDF' });
    expect(downloadButton).toBeInTheDocument();
    await userEvent.setup().click(downloadButton);
    expect(mocks.request).toHaveBeenCalledWith('/bookings/7/ticket?guest_email=guest%40example.com', { responseType: 'blob' });
  });

  it('displays a clear notice when ticket download is rejected due to authorization (403)', async () => {
    const confirmedBooking = { ...booking, status: 'confirmed' };
    const forbiddenError = new Error('Access denied to this booking');
    forbiddenError.status = 403;
    mocks.request.mockImplementation(async (path) => {
      if (path.startsWith('/bookings/7?')) return confirmedBooking;
      if (path.startsWith('/bookings/7/ticket')) throw forbiddenError;
      throw new Error(`Unexpected request ${path}`);
    });

    routes(<PaymentResultPage />, '/payments/result', '/payments/result?booking_id=7');
    const downloadButton = await screen.findByRole('button', { name: 'Tải vé PDF' });
    await userEvent.setup().click(downloadButton);
    expect(await screen.findByText('Bạn không có quyền tải vé này. Khách vãng lai cần email đã dùng khi đặt chỗ để xác thực.')).toBeInTheDocument();
  });

  it('rejects reversed revenue dates before making the request', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    const user = userEvent.setup();
    render(<MemoryRouter><AdminRevenuePage /></MemoryRouter>);
    mocks.request.mockClear();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Xem doanh thu' }));
    expect(await screen.findByText('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')).toBeInTheDocument();
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes('/payments/revenue'))).toBe(false);
  });

  it('requests revenue using only from_date, to_date and group_by', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ from_date: '2026-10-01', to_date: '2026-10-09', group_by: 'month', total_revenue: 8000, data: [{ month: '2026-10', revenue: 8000 }] });
    const user = userEvent.setup();
    render(<MemoryRouter><AdminRevenuePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-09' } });
    await user.selectOptions(screen.getByLabelText('Gom nhóm'), 'month');
    await user.click(screen.getByRole('button', { name: 'Xem doanh thu' }));
    expect(await screen.findByText('Tổng doanh thu trong kỳ')).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith('/payments/revenue?from_date=2026-10-01&to_date=2026-10-09&group_by=month');
  });

  it('provides quick preset buttons (Hôm nay, 7 ngày, Tháng này, Tháng trước) and SVG chart', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ from_date: '2026-10-01', to_date: '2026-10-25', group_by: 'day', total_revenue: 15000000, data: [{ date: '2026-10-25', revenue: 15000000 }] });
    render(<MemoryRouter><AdminRevenuePage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Hôm nay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 ngày' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tháng này' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tháng trước' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Biểu đồ/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất CSV/i })).toBeInTheDocument();
  });

  it('filters the admin payment list using the supported API query fields', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [{ id: 9, booking_id: 7, payment_method: 'vnpay', amount: 2500000, status: 'success', booking: { booking_code: 'BK123' } }], pagination: { page: 1, totalPages: 1, total: 1 } });
    render(<MemoryRouter initialEntries={['/admin/payments?status=success&payment_method=vnpay&booking_id=7']}><AdminPaymentsPage /></MemoryRouter>);
    expect((await screen.findAllByText('BK123')).length).toBeGreaterThan(0);
    expect(mocks.request).toHaveBeenCalledWith('/payments?page=1&limit=20&status=success&payment_method=vnpay&booking_id=7');
  });

  it('uses report labels for payment status filter options while keeping enum values', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    render(<MemoryRouter><AdminPaymentsPage /></MemoryRouter>);

    const statusFilter = await screen.findByLabelText('Lọc trạng thái thanh toán');
    expect(screen.getByRole('option', { name: 'Thanh toán thành công' })).toHaveValue('success');
    expect(within(statusFilter).queryByRole('option', { name: 'success' })).not.toBeInTheDocument();
  });

  it('keeps payOS refund manual and does not offer a false internal refund action', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    let refunded = false;
    mocks.request.mockImplementation(async (path) => {
      if (path === '/payments/9') return { id: 9, booking_id: 7, payment_method: 'payos', amount: 2500000, status: refunded ? 'refunded' : 'success', paid_at: '2026-10-08T08:00:00Z', booking: { booking_code: 'BK123', status: refunded ? 'cancelled' : 'confirmed', guest_email: 'guest@example.com' } };
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<AdminPaymentDetailPage />, '/admin/payments/:id', '/admin/payments/9');
    expect(await screen.findByText('Thông tin thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/payOS chưa có adapter hoàn tiền ngân hàng/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hoàn tiền/i })).not.toBeInTheDocument();
    expect(refunded).toBe(false);
  });

  it('uses the dedicated VNPay refund endpoint after confirmation', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    let refunded = false;
    mocks.request.mockImplementation(async (path, options) => {
      if (path === '/payments/9') return { id: 9, booking_id: 7, payment_method: 'vnpay', amount: 2500000, status: refunded ? 'refunded' : 'success', booking: { booking_code: 'BK123', status: refunded ? 'cancelled' : 'confirmed' } };
      if (path === '/payments/9/vnpay/refund') { refunded = true; return { status: 'success' }; }
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<AdminPaymentDetailPage />, '/admin/payments/:id', '/admin/payments/9');
    await screen.findByText('Thông tin thanh toán');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu hoàn VNPay' }));
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu hoàn' }));
    await screen.findByText('Đã hoàn tiền');
    expect(mocks.request).toHaveBeenCalledWith('/payments/9/vnpay/refund', { method: 'POST', body: {} });
  });
});
