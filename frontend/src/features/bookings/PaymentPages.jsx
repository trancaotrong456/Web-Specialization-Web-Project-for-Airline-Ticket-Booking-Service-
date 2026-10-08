import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { createBookingsApi } from './bookingsApi';

const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
const time = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const rowsOf = (result) => Array.isArray(result) ? result : result?.data || [];
const emailKey = (id) => `booking_guest_email_${id}`;
const PAYMENT_CONTEXT_KEY = 'airline_payment_return_context';

function PaymentShell({ children }) { return <div className="public-page booking-page"><AppHeader /><main className="booking-main">{children}</main><footer className="site-footer"><span>Serene Flightways</span><span>Thanh toán được xác nhận từ trạng thái hệ thống.</span></footer></div>; }
function Heading({ eyebrow = 'THANH TOÁN', title, description, actions }) { return <header className="booking-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="booking-heading-actions">{actions}</div> : null}</header>; }
const errorText = (error, fallback) => error?.message || fallback;

function usePaymentApi() { const { request } = useAuth(); return useMemo(() => createBookingsApi(request), [request]); }

export function PaymentInitiatePage() {
  const api = usePaymentApi(); const { id } = useParams(); const location = useLocation(); const navigate = useNavigate(); const { user, status } = useAuth();
  const guestEmail = location.state?.guestEmail || sessionStorage.getItem(emailKey(id)) || '';
  const [booking, setBooking] = useState(location.state?.booking || null); const [method, setMethod] = useState('vnpay'); const [state, setState] = useState({ loading: !location.state?.booking, submitting: false, error: '', result: null });
  useEffect(() => {
    if (booking || status === 'loading') return;
    let active = true;
    api.bookingDetail(id, user ? undefined : guestEmail).then((data) => { if (active) { setBooking(data); setState((current) => ({ ...current, loading: false })); } })
      .catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: errorText(error, 'Không thể tải đặt chỗ để thanh toán.') })); });
    return () => { active = false; };
  }, [api, booking, guestEmail, id, status, user]);
  const startPayment = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, submitting: true, error: '', result: null }));
    const returnUrl = `${window.location.origin}/payments/result`;
    try {
      const result = await api.initiatePayment({ booking_id: Number(id), payment_method: method, return_url: returnUrl, ...(!user ? { guest_email: guestEmail } : {}) });
      setState({ loading: false, submitting: false, error: '', result });
      sessionStorage.setItem(PAYMENT_CONTEXT_KEY, JSON.stringify({ bookingId: id, guestEmail, paymentMethod: method }));
      if (result?.payment_url) window.location.assign(result.payment_url);
    } catch (error) { setState((current) => ({ ...current, submitting: false, error: errorText(error, 'Không thể bắt đầu thanh toán.') })); }
  };
  const simulatePayos = async () => {
    if (!state.result?.demo_webhook?.body) return;
    setState((current) => ({ ...current, submitting: true, error: '' }));
    try { await api.payosDemoWebhook(state.result.demo_webhook.body); navigate(`/payments/result?booking_id=${encodeURIComponent(id)}&demo=1`, { state: { bookingId: id, guestEmail } }); }
    catch (error) { setState((current) => ({ ...current, submitting: false, error: errorText(error, 'Không thể xử lý mô phỏng payOS.') })); }
  };
  if (state.loading || status === 'loading') return <PaymentShell><LoadingView label="Đang tải đặt chỗ…" /></PaymentShell>;
  if (state.error && !booking) return <PaymentShell><Heading title="Không thể tiếp tục thanh toán" /><section className="surface-card booking-panel"><Notice type="error">{state.error}</Notice><Link className="button button-outline" to="/bookings/lookup">Tra cứu đặt chỗ</Link></section></PaymentShell>;
  return <PaymentShell><Heading title="Thanh toán đặt chỗ" description="Chọn cổng thanh toán khả dụng cho đặt chỗ đang giữ." actions={<Link className="button button-outline" to={`/bookings/${id}`} state={{ guestEmail }}>Chi tiết đặt chỗ</Link>} />
    {state.error ? <Notice type="error">{state.error}</Notice> : null}
    <div className="payment-layout"><section className="surface-card booking-panel"><h2>Tóm tắt</h2><dl className="booking-facts"><div><dt>Mã đặt chỗ</dt><dd>{booking?.booking_code || `#${id}`}</dd></div><div><dt>Chặng bay</dt><dd>{booking?.flight?.departureAirport?.iata_code || '—'} → {booking?.flight?.arrivalAirport?.iata_code || '—'}</dd></div><div><dt>Khởi hành</dt><dd>{time(booking?.flight?.departure_time)}</dd></div><div><dt>Số hành khách</dt><dd>{booking?.passengers?.length || '—'}</dd></div><div><dt>Thành tiền</dt><dd><strong>{money(booking?.total_amount)}</strong></dd></div><div><dt>Giữ chỗ đến</dt><dd>{time(booking?.hold_expires_at)}</dd></div></dl></section>
      <section className="surface-card booking-panel"><h2>Phương thức thanh toán</h2><form onSubmit={startPayment}><div className="payment-method-options"><label className={method === 'vnpay' ? 'is-selected' : ''}><input type="radio" name="payment-method" value="vnpay" checked={method === 'vnpay'} onChange={() => setMethod('vnpay')} /><span><strong>VNPay</strong><small>Cổng thanh toán sandbox của đồ án.</small></span></label><label className={method === 'payos' ? 'is-selected' : ''}><input type="radio" name="payment-method" value="payos" checked={method === 'payos'} onChange={() => setMethod('payos')} /><span><strong>payOS · VietQR</strong><small>Hiển thị QR/link do máy chủ trả về; chế độ demo không chuyển tiền thật.</small></span></label></div><button className="button button-primary" type="submit" disabled={state.submitting || booking?.status !== 'holding'}>{state.submitting ? 'Đang kết nối…' : 'Tiếp tục thanh toán'}</button>{booking?.status !== 'holding' ? <p className="field-hint">Đặt chỗ hiện không ở trạng thái giữ chỗ để bắt đầu thanh toán.</p> : null}</form>
        {state.result?.qr_code ? <div className="payment-qr-result"><Notice>payOS trả về dữ liệu thanh toán ở chế độ {state.result.mode || 'gateway'}. Kiểm tra thông tin đích chuyển trước khi thao tác.</Notice><img src={state.result.qr_code} alt="Mã QR do payOS trả về" /><p>Mã giao dịch: <code>{state.result.transaction_ref}</code></p>{state.result.demo_notice ? <p className="demo-disclaimer">{state.result.demo_notice}</p> : null}{state.result.demo_webhook?.body ? <button className="button button-secondary" type="button" disabled={state.submitting} onClick={() => void simulatePayos()}>{state.submitting ? 'Đang cập nhật trạng thái…' : 'Mô phỏng xác nhận demo'}</button> : null}</div> : null}
      </section></div>
  </PaymentShell>;
}

export function PaymentResultPage() {
  const api = usePaymentApi(); const location = useLocation(); const [params] = useSearchParams(); const { status } = useAuth();
  const returnContext = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(PAYMENT_CONTEXT_KEY) || '{}'); } catch { return {}; } }, []);
  const bookingId = location.state?.bookingId || params.get('booking_id') || returnContext.bookingId || '';
  const guestEmail = location.state?.guestEmail || returnContext.guestEmail || (bookingId ? sessionStorage.getItem(emailKey(bookingId)) : '') || '';
  const gateway = params.has('vnp_TxnRef') ? 'vnpay' : params.has('orderCode') ? 'payos' : params.get('demo') ? 'demo' : '';
  const [state, setState] = useState({ loading: true, error: '', gatewayResult: null, booking: null });
  const load = useCallback(async () => {
    if (status === 'loading') return;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      let gatewayResult = null;
      if (gateway === 'vnpay') gatewayResult = await api.vnpayReturn(Object.fromEntries(params.entries()));
      else if (gateway === 'payos') gatewayResult = await api.payosReturn(Object.fromEntries(params.entries()));
      let resolvedId = gatewayResult?.bookingId || bookingId;
      let booking = null;
      if (resolvedId) booking = await api.bookingDetail(resolvedId, guestEmail || undefined);
      setState({ loading: false, error: '', gatewayResult, booking });
    } catch (error) { setState({ loading: false, error: errorText(error, 'Chưa thể xác minh kết quả thanh toán.'), gatewayResult: null, booking: null }); }
  }, [api, bookingId, gateway, guestEmail, params, status]);
  useEffect(() => { void load(); }, [load]);
  return <PaymentShell><Heading eyebrow="KẾT QUẢ THANH TOÁN" title="Kiểm tra trạng thái đặt chỗ" description="Thông tin trả về từ trình duyệt không tự xác nhận thanh toán. Trạng thái đặt chỗ bên dưới được tải lại từ hệ thống." />{state.loading || status === 'loading' ? <LoadingView label="Đang kiểm tra trạng thái…" /> : <section className="surface-card booking-panel payment-result-panel">{state.error ? <Notice type="error">{state.error}</Notice> : null}{state.gatewayResult?.isValidChecksum === false ? <Notice type="error">Thông tin VNPay trả về không xác minh được chữ ký.</Notice> : null}{state.gatewayResult?.processed === false && gateway === 'payos' ? <Notice>payOS đã chuyển hướng về ứng dụng; trạng thái giao dịch cần được xác nhận qua webhook.</Notice> : null}{state.booking ? <><div className="booking-detail-title"><div><span className="eyebrow">MÃ ĐẶT CHỖ</span><h2>{state.booking.booking_code}</h2></div><StatusBadge status={state.booking.status} /></div><p>Đặt chỗ được xác nhận khi trạng thái hệ thống là “confirmed”. Hiện tại: <strong>{state.booking.status}</strong>.</p><div className="booking-actions"><Link className="button button-primary" to={`/bookings/${state.booking.id}`} state={{ guestEmail }}>Xem đặt chỗ</Link><button className="button button-outline" type="button" onClick={() => void load()}>Kiểm tra lại</button></div></> : <><p>Không có mã đặt chỗ để tải trạng thái. Tra cứu bằng mã đặt chỗ và email để kiểm tra.</p><Link className="button button-primary" to="/bookings/lookup">Tra cứu đặt chỗ</Link></>}</section>}</PaymentShell>;
}

export function AdminPaymentsPage() {
  const api = usePaymentApi(); const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.max(1, Number(params.get('limit')) || 20); const status = params.get('status') || ''; const payment_method = params.get('payment_method') || ''; const booking_id = params.get('booking_id') || '';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const result = await api.payments({ page, limit, status, payment_method, booking_id }); setState({ loading: false, rows: rowsOf(result), pagination: result?.pagination || { page, totalPages: 1, total: result?.total || 0 }, error: '' }); } catch (error) { setState((current) => ({ ...current, loading: false, error: errorText(error, 'Không thể tải thanh toán.') })); } }, [api, page, limit, status, payment_method, booking_id]);
  useEffect(() => { void load(); }, [load]);
  const update = (key, value) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, String(value)); else next.delete(key); if (key !== 'page') next.set('page', '1'); return next; });
  return <PaymentShell><Heading eyebrow="QUẢN TRỊ" title="Lịch sử thanh toán" description="Danh sách giao dịch, trạng thái và phương thức thanh toán." actions={<Link className="button button-secondary" to="/admin/payments/revenue">Báo cáo doanh thu</Link>} />{state.loading ? <LoadingView label="Đang tải thanh toán…" /> : state.error ? <Notice type="error">{state.error}</Notice> : <section className="surface-card booking-panel"><div className="booking-list-toolbar"><label className="field"><span>Trạng thái</span><select aria-label="Lọc trạng thái thanh toán" value={status} onChange={(event) => update('status', event.target.value)}><option value="">Tất cả trạng thái</option>{['pending', 'success', 'failed', 'refunded'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field"><span>Phương thức</span><select aria-label="Lọc phương thức" value={payment_method} onChange={(event) => update('payment_method', event.target.value)}><option value="">Tất cả phương thức</option><option value="vnpay">VNPay</option><option value="payos">payOS</option></select></label><Field id="payment-booking-filter" label="Mã booking ID" inputMode="numeric" value={booking_id} onChange={(event) => update('booking_id', event.target.value)} /></div>{state.rows.length ? <><div className="table-wrap booking-table-wrap"><table><thead><tr><th>Giao dịch</th><th>Booking</th><th>Phương thức</th><th>Số tiền</th><th>Ngày thanh toán</th><th>Trạng thái</th><th /></tr></thead><tbody>{state.rows.map((payment) => <tr key={payment.id}><td>{payment.transaction_ref || `#${payment.id}`}</td><td>{payment.booking?.booking_code || `#${payment.booking_id}`}</td><td>{payment.payment_method}</td><td>{money(payment.amount)}</td><td>{time(payment.paid_at)}</td><td><StatusBadge status={payment.status} /></td><td><Link to={`/admin/payments/${payment.id}`}>Chi tiết</Link></td></tr>)}</tbody></table></div><div className="payment-card-list">{state.rows.map((payment) => <article className="booking-card" key={payment.id}><div className="booking-card-top"><div><span className="eyebrow">{payment.payment_method}</span><h2>{payment.booking?.booking_code || `Booking #${payment.booking_id}`}</h2></div><StatusBadge status={payment.status} /></div><div className="booking-card-bottom"><strong>{money(payment.amount)}</strong><Link className="button button-outline" to={`/admin/payments/${payment.id}`}>Chi tiết</Link></div></article>)}</div><Pagination page={Number(state.pagination?.page || page)} totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))} onPageChange={(next) => update('page', next)} /></> : <div className="empty-state"><h2>Chưa có giao dịch phù hợp</h2><p>Thử thay đổi bộ lọc.</p></div>}</section>}</PaymentShell>;
}

export function AdminPaymentDetailPage() {
  const api = usePaymentApi(); const { id } = useParams(); const navigate = useNavigate(); const [state, setState] = useState({ loading: true, error: '', payment: null, actionError: '', pending: false }); const [dialog, setDialog] = useState(false); const [reason, setReason] = useState('');
  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const payment = await api.paymentDetail(id); setState((current) => ({ ...current, loading: false, payment, error: '' })); } catch (error) { setState((current) => ({ ...current, loading: false, error: errorText(error, 'Không thể tải giao dịch.') })); } }, [api, id]); useEffect(() => { void load(); }, [load]);
  const refund = async () => { setState((current) => ({ ...current, pending: true, actionError: '' })); try { await api.refundBooking(state.payment.booking_id, reason.trim()); setDialog(false); await load(); setState((current) => ({ ...current, pending: false })); } catch (error) { setState((current) => ({ ...current, pending: false, actionError: errorText(error, 'Không thể xử lý hoàn tiền.') })); } };
  if (state.loading) return <PaymentShell><LoadingView label="Đang tải chi tiết giao dịch…" /></PaymentShell>;
  if (state.error || !state.payment) return <PaymentShell><Heading title="Không tải được giao dịch" /><section className="surface-card booking-panel"><Notice type="error">{state.error || 'Không tìm thấy giao dịch.'}</Notice><Link className="button button-outline" to="/admin/payments">Quay lại</Link></section></PaymentShell>;
  const payment = state.payment;
  return <PaymentShell><Heading eyebrow="CHI TIẾT GIAO DỊCH" title={`Thanh toán #${payment.id}`} description={payment.booking?.booking_code || `Đặt chỗ #${payment.booking_id}`} actions={<Link className="button button-outline" to="/admin/payments">Danh sách thanh toán</Link>} />{state.actionError ? <Notice type="error">{state.actionError}</Notice> : null}<section className="surface-card booking-panel payment-detail-panel"><div className="booking-detail-title"><h2>Thông tin thanh toán</h2><StatusBadge status={payment.status} /></div><dl className="booking-facts"><div><dt>Mã đặt chỗ</dt><dd>{payment.booking?.booking_code || payment.booking_id}</dd></div><div><dt>Khách hàng</dt><dd>{payment.booking?.user?.full_name || payment.booking?.guest_email || payment.booking?.user?.email || '—'}</dd></div><div><dt>Phương thức</dt><dd>{payment.payment_method}</dd></div><div><dt>Mã giao dịch</dt><dd><code>{payment.transaction_ref || '—'}</code></dd></div><div><dt>Số tiền</dt><dd><strong>{money(payment.amount)}</strong></dd></div><div><dt>Đã thanh toán lúc</dt><dd>{time(payment.paid_at)}</dd></div><div><dt>Đặt chỗ</dt><dd><StatusBadge status={payment.booking?.status || '—'} /></dd></div></dl><p className="refund-disclaimer">Hoàn tiền trong màn hình này cập nhật trạng thái nội bộ của payment/booking theo backend; không khẳng định đã hoàn tiền qua ngân hàng/cổng thanh toán.</p>{payment.status === 'success' && payment.booking?.status === 'confirmed' ? <><Field id="refund-reason" label="Lý do refund (không bắt buộc)" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="button button-danger" type="button" onClick={() => setDialog(true)}>Xử lý refund nội bộ</button></> : null}</section><ConfirmDialog open={dialog} title="Xác nhận refund nội bộ" description="Backend sẽ đánh dấu giao dịch là refunded, hủy booking và giải phóng ghế. Thao tác này không gọi hoàn tiền thật qua gateway." confirmLabel="Xác nhận refund" danger pending={state.pending} onConfirm={() => void refund()} onCancel={() => setDialog(false)} /></PaymentShell>;
}

export function AdminRevenuePage() {
  const api = usePaymentApi(); const today = new Date(); const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [filters, setFilters] = useState({ from_date: todayValue, to_date: todayValue, group_by: 'day' }); const [state, setState] = useState({ loading: false, error: '', data: null });
  const invalidRange = Boolean(filters.from_date && filters.to_date && filters.from_date > filters.to_date);
  const submit = async (event) => { event.preventDefault(); if (invalidRange) { setState({ loading: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', data: null }); return; } setState({ loading: true, error: '', data: null }); try { const data = await api.revenue(filters); setState({ loading: false, error: '', data }); } catch (error) { setState({ loading: false, error: errorText(error, 'Không thể tải báo cáo doanh thu.'), data: null }); } };
  return <PaymentShell><Heading eyebrow="QUẢN TRỊ" title="Doanh thu thanh toán" description="Tổng hợp các khoản thanh toán thành công theo ngày hoặc tháng." actions={<Link className="button button-outline" to="/admin/payments">Lịch sử thanh toán</Link>} /><section className="surface-card booking-panel"><form className="revenue-filter-form" onSubmit={submit}><Field id="revenue-from" label="Từ ngày" type="date" required value={filters.from_date} onChange={(event) => setFilters((current) => ({ ...current, from_date: event.target.value }))} /><Field id="revenue-to" label="Đến ngày" type="date" required value={filters.to_date} onChange={(event) => setFilters((current) => ({ ...current, to_date: event.target.value }))} /><label className="field"><span>Gom nhóm</span><select value={filters.group_by} onChange={(event) => setFilters((current) => ({ ...current, group_by: event.target.value }))}><option value="day">Theo ngày</option><option value="month">Theo tháng</option></select></label><button className="button button-primary" type="submit" disabled={state.loading || invalidRange}>Xem doanh thu</button></form>{invalidRange ? <Notice type="error">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</Notice> : null}{state.error ? <Notice type="error">{state.error}</Notice> : null}{state.loading ? <LoadingView label="Đang tổng hợp doanh thu…" /> : null}{state.data ? <section className="revenue-result"><div className="revenue-total"><span>Tổng doanh thu trong kỳ</span><strong>{money(state.data.total_revenue)}</strong><small>{state.data.from_date} — {state.data.to_date}</small></div><h2>Chi tiết {filters.group_by === 'day' ? 'theo ngày' : 'theo tháng'}</h2>{state.data.data?.length ? <><div className="table-wrap booking-table-wrap"><table><thead><tr><th>{filters.group_by === 'day' ? 'Ngày' : 'Tháng'}</th><th>Doanh thu</th></tr></thead><tbody>{state.data.data.map((row) => <tr key={row.date || row.month}><td>{row.date || row.month}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div><div className="revenue-card-list">{state.data.data.map((row) => <article className="booking-card" key={row.date || row.month}><div className="booking-card-top"><strong>{row.date || row.month}</strong><strong>{money(row.revenue)}</strong></div></article>)}</div></> : <p>Không có khoản thanh toán thành công trong khoảng thời gian này.</p>}<p className="field-hint">Theo backend, doanh thu chỉ tính payment có trạng thái success; payment pending, failed và refunded không được cộng.</p></section> : null}</section></PaymentShell>;
}
