import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPaymentDetailPage, AdminPaymentsPage, AdminRevenuePage, PaymentInitiatePage } from './PaymentPages';

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
  });

  it('rejects reversed revenue dates before making the request', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    const user = userEvent.setup();
    render(<MemoryRouter><AdminRevenuePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Xem doanh thu' }));
    expect(await screen.findByText('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
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

  it('filters the admin payment list using the supported API query fields', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    mocks.request.mockResolvedValue({ data: [{ id: 9, booking_id: 7, payment_method: 'vnpay', amount: 2500000, status: 'success', booking: { booking_code: 'BK123' } }], pagination: { page: 1, totalPages: 1, total: 1 } });
    render(<MemoryRouter initialEntries={['/admin/payments?status=success&payment_method=vnpay&booking_id=7']}><AdminPaymentsPage /></MemoryRouter>);
    expect((await screen.findAllByText('BK123')).length).toBeGreaterThan(0);
    expect(mocks.request).toHaveBeenCalledWith('/payments?page=1&limit=20&status=success&payment_method=vnpay&booking_id=7');
  });

  it('requires confirmation and labels booking refund as internal-only', async () => {
    mocks.user = { id: 1, role: 'admin' }; mocks.status = 'authenticated';
    let refunded = false;
    mocks.request.mockImplementation(async (path) => {
      if (path === '/payments/9') return { id: 9, booking_id: 7, payment_method: 'payos', amount: 2500000, status: refunded ? 'refunded' : 'success', paid_at: '2026-10-08T08:00:00Z', booking: { booking_code: 'BK123', status: refunded ? 'cancelled' : 'confirmed', guest_email: 'guest@example.com' } };
      if (path === '/payments/bookings/7/refund') { refunded = true; return { refundedAmount: 2500000 }; }
      throw new Error(`Unexpected request ${path}`);
    });
    const user = userEvent.setup();
    routes(<AdminPaymentDetailPage />, '/admin/payments/:id', '/admin/payments/9');
    expect(await screen.findByText('Thông tin thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/không khẳng định đã hoàn tiền qua ngân hàng/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xử lý refund nội bộ' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('không gọi hoàn tiền thật qua gateway');
    await user.click(screen.getByRole('button', { name: 'Xác nhận refund' }));
    await screen.findByText('Đã refund');
    expect(mocks.request).toHaveBeenCalledWith('/payments/bookings/7/refund', { method: 'POST', body: {} });
  });
});
