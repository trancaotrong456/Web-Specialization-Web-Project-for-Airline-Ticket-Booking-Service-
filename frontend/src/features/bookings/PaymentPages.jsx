import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { StatusBadge, statusLabel } from '../../components/StatusBadge';
import { BoardingPassCard } from './BoardingPassCard';
import { createBookingsApi } from './bookingsApi';
import { money } from '../../lib/formatters';
import { getServerTimeOffset } from '../../lib/apiClient';
import {
  getVnTodayRange,
  getVn7DaysRange,
  getVnThisMonthRange,
  getVnLastMonthRange,
  getVnPreviousEquivalentRange,
} from '../../lib/dateUtils';

const time = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const rowsOf = (result) => Array.isArray(result) ? result : result?.data || [];
const emailKey = (id) => `booking_guest_email_${id}`;
const PAYMENT_CONTEXT_KEY = 'airline_payment_return_context';

function PaymentShell({ children }) { return <div className="public-page booking-page"><AppHeader /><main className="booking-main">{children}</main><footer className="site-footer"><span>Serene Flightways</span><span>Thanh toán được xác nhận từ trạng thái hệ thống.</span></footer></div>; }
function Heading({ eyebrow = 'THANH TOÁN', title, description, actions }) { return <header className="booking-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="booking-heading-actions">{actions}</div> : null}</header>; }
const errorText = (error, fallback) => error?.message || fallback;

function usePaymentApi() { const { request } = useAuth(); return useMemo(() => createBookingsApi(request), [request]); }

function HoldCountdown({ expiresAt, onExpired }) {
  const calculateRemaining = useCallback(() => {
    if (!expiresAt) return 900;
    const now = Date.now() + (getServerTimeOffset() || 0);
    const diff = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
    return Math.max(0, diff);
  }, [expiresAt]);

  const [remaining, setRemaining] = useState(calculateRemaining);

  useEffect(() => {
    const nextRemaining = calculateRemaining();
    setRemaining(nextRemaining);
    const timer = setInterval(() => {
      const next = calculateRemaining();
      setRemaining(next);
      if (next <= 0) {
        clearInterval(timer);
        if (onExpired) onExpired();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateRemaining, onExpired, expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining < 180 && remaining > 0;
  const isExpired = remaining <= 0;

  return (
    <div className={`hold-countdown-banner ${isUrgent ? 'is-urgent' : ''} ${isExpired ? 'is-expired' : ''}`} role="timer" aria-live="polite">
      <div className="hold-countdown-info">
        <span className="eyebrow">{isExpired ? 'HẾT HẠN GIỮ CHỖ' : 'THỜI GIAN GIỮ CHỖ CÒN LẠI'}</span>
        <p>{isExpired ? 'Thời gian 15 phút đã kết thúc. Chỗ ngồi đã được giải phóng.' : isUrgent ? 'Chỉ còn dưới 3 phút để hoàn tất! Vui lòng thanh toán sớm.' : 'Vé của bạn được giữ trong 15 phút kể từ lúc đặt chỗ.'}</p>
      </div>
      <div className="hold-countdown-digits table-mono-cell" aria-label={`Thời gian còn lại: ${minutes} phút ${seconds} giây`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
    </div>
  );
}

export function PaymentInitiatePage() {
  const api = usePaymentApi(); const { id } = useParams(); const location = useLocation(); const navigate = useNavigate(); const { user, status } = useAuth();
  const guestEmail = location.state?.guestEmail || sessionStorage.getItem(emailKey(id)) || '';
  const idempotencyKey = useRef(null);
  const [booking, setBooking] = useState(location.state?.booking || null); const [method, setMethod] = useState('vnpay'); const [state, setState] = useState({ loading: !location.state?.booking, submitting: false, error: '', result: null });
  const [expired, setExpired] = useState(false);
  const additionalSegments = (booking?.itinerarySegments || []).filter((segment) => Number(segment.leg_order) > 1);
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
    if (!idempotencyKey.current) idempotencyKey.current = window.crypto.randomUUID();
    try {
      const result = await api.initiatePayment({ booking_id: Number(id), payment_method: method, return_url: returnUrl, ...(!user ? { guest_email: guestEmail } : {}) }, idempotencyKey.current);
      setState({ loading: false, submitting: false, error: '', result });
      sessionStorage.setItem(PAYMENT_CONTEXT_KEY, JSON.stringify({ bookingId: id, guestEmail, paymentMethod: method }));
      if (result?.payment_url) window.location.assign(result.payment_url);
    } catch (error) { if (error?.status === 502) idempotencyKey.current = null; setState((current) => ({ ...current, submitting: false, error: errorText(error, 'Không thể bắt đầu thanh toán.') })); }
  };
  const simulatePayos = async () => {
    if (!state.result?.demo_webhook?.body) return;
    setState((current) => ({ ...current, submitting: true, error: '' }));
    try { await api.payosDemoWebhook(state.result.demo_webhook.body); navigate(`/payments/result?booking_id=${encodeURIComponent(id)}&demo=1`, { state: { bookingId: id, guestEmail } }); }
    catch (error) { setState((current) => ({ ...current, submitting: false, error: errorText(error, 'Không thể xử lý mô phỏng payOS.') })); }
  };
  const reloadBooking = useCallback(async () => {
    try {
      const latest = await api.bookingDetail(id, user ? undefined : guestEmail);
      if (latest) {
        setBooking(latest);
        const now = Date.now() + (getServerTimeOffset() || 0);
        const expiresTime = latest.hold_expires_at ? new Date(latest.hold_expires_at).getTime() : 0;
        if (latest.status === 'holding' && expiresTime > now) {
          setExpired(false);
        } else {
          setExpired(true);
        }
      }
    } catch {
      // Giữ nguyên trạng thái nếu mạng tạm thời gián đoạn
    }
  }, [api, guestEmail, id, user]);

  if (state.loading || status === 'loading') return <PaymentShell><LoadingView label="Đang tải đặt chỗ…" /></PaymentShell>;
  if (state.error && !booking) return <PaymentShell><Heading title="Không thể tiếp tục thanh toán" /><section className="surface-card booking-panel"><Notice type="error">{state.error}</Notice><Link className="button button-outline" to="/bookings/lookup">Tra cứu đặt chỗ</Link></section></PaymentShell>;
  
  const isBookingExpired = expired || booking?.status === 'expired';

  return <PaymentShell><Heading title="Thanh toán đặt chỗ" description="Chọn cổng thanh toán khả dụng cho đặt chỗ đang giữ." actions={<Link className="button button-outline" to={`/bookings/${id}`} state={{ guestEmail }}>Chi tiết đặt chỗ</Link>} />
    <HoldCountdown expiresAt={booking?.hold_expires_at} onExpired={reloadBooking} />
    {isBookingExpired ? <Notice type="warning">Đặt chỗ đã hết hạn giữ chỗ. Bạn vui lòng tìm chuyến bay mới để tiếp tục đặt vé. <Link className="button button-primary" style={{ display: 'inline-block', marginTop: '8px' }} to="/">Tìm chuyến bay khác</Link></Notice> : null}
    {state.error ? <Notice type="error">{state.error}</Notice> : null}
    <div className="payment-layout"><section className="surface-card booking-panel"><h2>Tóm tắt</h2><dl className="booking-facts"><div><dt>Mã đặt chỗ</dt><dd className="table-mono-cell">{booking?.booking_code || `#${id}`}</dd></div><div><dt>Chặng đầu</dt><dd className="table-mono-cell">{booking?.flight?.departureAirport?.iata_code || '—'} → {booking?.flight?.arrivalAirport?.iata_code || '—'}</dd></div><div><dt>Khởi hành</dt><dd>{time(booking?.flight?.departure_time)}</dd></div><div><dt>Số hành khách</dt><dd className="table-mono-cell">{booking?.passengers?.length || '—'}</dd></div><div><dt>Thành tiền</dt><dd><strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>{money(booking?.total_amount)}</strong></dd></div><div><dt>Giữ chỗ đến</dt><dd className="table-mono-cell">{time(booking?.hold_expires_at)}</dd></div></dl>{additionalSegments.length ? <><h3>Các chặng tiếp theo</h3><ol className="booking-itinerary-summary">{[...additionalSegments].sort((a, b) => Number(a.leg_order) - Number(b.leg_order)).map((segment) => <li key={segment.id}><div><strong className="table-mono-cell">{segment.flight?.departureAirport?.iata_code || '—'} → {segment.flight?.arrivalAirport?.iata_code || '—'}</strong><span>{time(segment.flight?.departure_time)}</span></div></li>)}</ol></> : null}{booking?.ancillaries?.length ? <><h3>Dịch vụ bổ sung</h3><ul>{booking.ancillaries.map((line) => <li key={line.id}>{line.passenger?.passenger_name || 'Hành khách'} · Chặng {line.segment?.leg_order || '—'} · {line.service_name_snapshot} × {line.quantity}: <span className="table-mono-cell">{money(line.line_total_snapshot)}</span></li>)}</ul></> : null}</section>
        <section className="surface-card booking-panel"><h2>Phương thức thanh toán</h2><form onSubmit={startPayment}><div className="payment-method-options"><label className={method === 'vnpay' ? 'is-selected' : ''}><input type="radio" name="payment-method" value="vnpay" checked={method === 'vnpay'} onChange={() => { idempotencyKey.current = null; setMethod('vnpay'); }} /><span><strong>VNPay</strong><small>Cổng thanh toán sandbox của đồ án (mô phỏng demo).</small></span></label><label className={method === 'payos' ? 'is-selected' : ''}><input type="radio" name="payment-method" value="payos" checked={method === 'payos'} onChange={() => { idempotencyKey.current = null; setMethod('payos'); }} /><span><strong>payOS · VietQR</strong><small>Hiển thị QR do máy chủ trả về; chế độ demo không chuyển tiền thật.</small></span></label></div><button className="button button-primary" type="submit" disabled={state.submitting || Boolean(state.result) || booking?.status !== 'holding'}>{state.submitting ? 'Đang kết nối…' : 'Tiếp tục thanh toán'}</button>{booking?.status !== 'holding' ? <p className="field-hint">Đặt chỗ hiện không ở trạng thái giữ chỗ để bắt đầu thanh toán.</p> : null}</form>
        {state.result?.qr_code ? <div className="payment-qr-result"><Notice>payOS trả về dữ liệu thanh toán ở chế độ demo sandbox ({state.result.mode || 'gateway'}). Thông tin chỉ phục vụ thử nghiệm.</Notice><img src={state.result.qr_code} alt="Mã QR do payOS trả về" /><p>Mã giao dịch: <code className="table-mono-cell">{state.result.transaction_ref}</code></p>{state.result.demo_notice ? <p className="demo-disclaimer">{state.result.demo_notice}</p> : null}{state.result.demo_webhook?.body ? <button className="button button-secondary" type="button" disabled={state.submitting} onClick={() => void simulatePayos()}>{state.submitting ? 'Đang cập nhật trạng thái…' : 'Mô phỏng xác nhận demo'}</button> : null}</div> : null}
      </section></div>
  </PaymentShell>;
}

export function PaymentResultPage() {
  const api = usePaymentApi(); const location = useLocation(); const [params] = useSearchParams(); const { status } = useAuth();
  const returnContext = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(PAYMENT_CONTEXT_KEY) || '{}'); } catch { return {}; } }, []);
  const bookingId = location.state?.bookingId || params.get('booking_id') || returnContext.bookingId || '';
  const guestEmail = location.state?.guestEmail || returnContext.guestEmail || (bookingId ? sessionStorage.getItem(emailKey(bookingId)) : '') || '';
  const gateway = params.has('vnp_TxnRef') ? 'vnpay' : params.has('orderCode') ? 'payos' : params.get('demo') ? 'demo' : '';
  const [state, setState] = useState({ loading: true, error: '', gatewayResult: null, booking: null, downloading: false, downloadError: '' });
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
      setState((current) => ({ ...current, loading: false, error: '', gatewayResult, booking }));
    } catch (error) { setState((current) => ({ ...current, loading: false, error: errorText(error, 'Chưa thể xác minh kết quả thanh toán.'), gatewayResult: null, booking: null })); }
  }, [api, bookingId, gateway, guestEmail, params, status]);
  useEffect(() => { void load(); }, [load]);

  const downloadTicket = async () => {
    if (!state.booking?.id) return;
    setState((current) => ({ ...current, downloading: true, downloadError: '' }));
    try {
      const blob = await api.downloadTicket(state.booking.id, guestEmail || undefined);
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Máy chủ không trả về tệp vé hợp lệ.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ticket_${state.booking.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadErr) {
      const errStatus = downloadErr?.status || downloadErr?.statusCode;
      let message = downloadErr?.message || 'Không thể tải vé điện tử.';
      if (errStatus === 401 || errStatus === 403) {
        message = 'Bạn không có quyền tải vé này. Khách vãng lai cần email đã dùng khi đặt chỗ để xác thực.';
      } else if (errStatus === 400) {
        message = 'Vé điện tử chỉ khả dụng khi đặt chỗ đã được xác nhận.';
      }
      setState((current) => ({ ...current, downloadError: message }));
    } finally {
      setState((current) => ({ ...current, downloading: false }));
    }
  };

  const isSuccess = state.booking?.status === 'confirmed';
  const isCancelledOrExpired = state.booking?.status === 'cancelled' || state.booking?.status === 'expired';

  return <PaymentShell><Heading eyebrow="KẾT QUẢ THANH TOÁN" title="Kiểm tra trạng thái đặt chỗ" description="Thông tin trả về từ trình duyệt không tự xác nhận thanh toán. Trạng thái đặt chỗ bên dưới được tải lại từ hệ thống." />{state.loading || status === 'loading' ? <LoadingView label="Đang kiểm tra trạng thái…" /> : <section className="surface-card booking-panel payment-result-panel">{state.error ? <Notice type="error">{state.error}</Notice> : null}{state.downloadError ? <Notice type="error">{state.downloadError}</Notice> : null}{state.gatewayResult?.isValidChecksum === false ? <Notice type="error">Thông tin VNPay trả về không xác minh được chữ ký.</Notice> : null}{state.gatewayResult?.processed === false && gateway === 'payos' ? <Notice>payOS đã chuyển hướng về ứng dụng; trạng thái giao dịch cần được xác nhận qua webhook.</Notice> : null}{state.booking ? <><div className="booking-detail-title"><div><span className="eyebrow">MÃ ĐẶT CHỖ</span><h2 className="table-mono-cell">{state.booking.booking_code}</h2></div><StatusBadge status={state.booking.status} /></div>{isSuccess ? <Notice type="success">Thanh toán hoàn tất! Đặt chỗ của bạn đã được hệ thống xác nhận.</Notice> : isCancelledOrExpired ? <Notice type="warning">Đặt chỗ đã hết hạn hoặc bị hủy.</Notice> : null}<p>Đặt chỗ được xác nhận khi trạng thái hệ thống là “Đã xác nhận”. Hiện tại: <strong>{statusLabel(state.booking.status)}</strong>.</p><div className="booking-actions"><Link className="button button-primary" to={`/bookings/${state.booking.id}`} state={{ guestEmail }}>Xem đặt chỗ</Link>{isSuccess ? <button className="button button-secondary" type="button" disabled={state.downloading} onClick={downloadTicket}>{state.downloading ? 'Đang chuẩn bị tệp…' : 'Tải vé PDF'}</button> : null}<button className="button button-outline" type="button" onClick={() => void load()}>Kiểm tra lại</button></div>{isSuccess ? <BoardingPassCard booking={state.booking} onDownloadPdf={downloadTicket} downloadingPdf={state.downloading} /> : null}</> : <><p>Không có mã đặt chỗ để tải trạng thái. Tra cứu bằng mã đặt chỗ và email để kiểm tra.</p><Link className="button button-primary" to="/bookings/lookup">Tra cứu đặt chỗ</Link></>}</section>}</PaymentShell>;
}

export function AdminPaymentsPage() {
  const api = usePaymentApi(); const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.max(1, Number(params.get('limit')) || 20); const status = params.get('status') || ''; const payment_method = params.get('payment_method') || ''; const booking_id = params.get('booking_id') || '';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const result = await api.payments({ page, limit, status, payment_method, booking_id }); setState({ loading: false, rows: rowsOf(result), pagination: result?.pagination || { page, totalPages: 1, total: result?.total || 0 }, error: '' }); } catch (error) { setState((current) => ({ ...current, loading: false, error: errorText(error, 'Không thể tải thanh toán.') })); } }, [api, page, limit, status, payment_method, booking_id]);
  useEffect(() => { void load(); }, [load]);
  const update = (key, value) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, String(value)); else next.delete(key); if (key !== 'page') next.set('page', '1'); return next; });
  return <PaymentShell><Heading eyebrow="QUẢN TRỊ" title="Lịch sử thanh toán" description="Danh sách giao dịch, trạng thái và phương thức thanh toán." actions={<Link className="button button-secondary" to="/admin/payments/revenue">Báo cáo doanh thu</Link>} />{state.loading ? <LoadingView label="Đang tải thanh toán…" /> : state.error ? <Notice type="error">{state.error}</Notice> : <section className="surface-card booking-panel"><div className="booking-list-toolbar"><label className="field"><span>Trạng thái</span><select aria-label="Lọc trạng thái thanh toán" value={status} onChange={(event) => update('status', event.target.value)}><option value="">Tất cả trạng thái</option>{['pending', 'success', 'failed', 'refunded'].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label className="field"><span>Phương thức</span><select aria-label="Lọc phương thức" value={payment_method} onChange={(event) => update('payment_method', event.target.value)}><option value="">Tất cả phương thức</option><option value="vnpay">VNPay</option><option value="payos">payOS</option></select></label><Field id="payment-booking-filter" label="Mã booking ID" inputMode="numeric" value={booking_id} onChange={(event) => update('booking_id', event.target.value)} /></div>{state.rows.length ? <><div className="table-wrap booking-table-wrap"><table><thead><tr><th>Giao dịch</th><th>Booking</th><th>Phương thức</th><th>Số tiền</th><th>Ngày thanh toán</th><th>Trạng thái</th><th /></tr></thead><tbody>{state.rows.map((payment) => <tr key={payment.id}><td>{payment.transaction_ref || `#${payment.id}`}</td><td>{payment.booking?.booking_code || `#${payment.booking_id}`}</td><td>{payment.payment_method}</td><td>{money(payment.amount)}</td><td>{time(payment.paid_at)}</td><td><StatusBadge status={payment.status} /></td><td><Link to={`/admin/payments/${payment.id}`}>Chi tiết</Link></td></tr>)}</tbody></table></div><div className="payment-card-list">{state.rows.map((payment) => <article className="booking-card" key={payment.id}><div className="booking-card-top"><div><span className="eyebrow">{payment.payment_method}</span><h2>{payment.booking?.booking_code || `Booking #${payment.booking_id}`}</h2></div><StatusBadge status={payment.status} /></div><div className="booking-card-bottom"><strong>{money(payment.amount)}</strong><Link className="button button-outline" to={`/admin/payments/${payment.id}`}>Chi tiết</Link></div></article>)}</div><Pagination page={Number(state.pagination?.page || page)} totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))} onPageChange={(next) => update('page', next)} /></> : <div className="empty-state"><h2>Chưa có giao dịch phù hợp</h2><p>Thử thay đổi bộ lọc.</p></div>}</section>}</PaymentShell>;
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

const revenuePresets = [
  {
    id: 'today',
    label: 'Hôm nay',
    getRange: () => getVnTodayRange(),
  },
  {
    id: '7days',
    label: '7 ngày',
    getRange: () => getVn7DaysRange(),
  },
  {
    id: 'this_month',
    label: 'Tháng này',
    getRange: () => getVnThisMonthRange(),
  },
  {
    id: 'last_month',
    label: 'Tháng trước',
    getRange: () => getVnLastMonthRange(),
  },
];

function RevenueSvgChart({ rows, groupBy }) {
  if (!rows || rows.length === 0) return null;
  const maxVal = Math.max(...rows.map((r) => Number(r.revenue) || 0), 1);
  const chartHeight = 180;
  const chartWidth = 720;
  const barPadding = 8;
  const n = rows.length;
  const barWidth = Math.max(12, Math.min(48, (chartWidth - barPadding * (n + 1)) / n));
  const totalContentWidth = n * barWidth + (n + 1) * barPadding;
  const viewBoxWidth = Math.max(chartWidth, totalContentWidth);

  return (
    <div className="revenue-chart-wrap" tabIndex={0} aria-label="Biểu đồ cột doanh thu">
      <svg
        className="revenue-svg-chart"
        viewBox={`0 0 ${viewBoxWidth} ${chartHeight + 45}`}
        role="img"
        aria-label="Biểu đồ cột phân bổ doanh thu"
      >
        <title>Biểu đồ doanh thu {groupBy === 'day' ? 'theo ngày' : 'theo tháng'}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartHeight - ratio * (chartHeight - 30);
          return (
            <g key={ratio} className="chart-grid-line">
              <line x1={0} y1={y} x2={viewBoxWidth} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={viewBoxWidth - 6} y={y - 4} textAnchor="end" fill="#94a3b8" fontSize="10" className="table-mono-cell tabular-nums">
                {money(ratio * maxVal)}
              </text>
            </g>
          );
        })}
        {rows.map((row, idx) => {
          const val = Number(row.revenue) || 0;
          const barHeight = val > 0 ? Math.max(4, (val / maxVal) * (chartHeight - 35)) : 2;
          const x = barPadding + idx * (barWidth + barPadding);
          const y = chartHeight - barHeight;
          const label = row.date ? row.date.slice(5) : row.month;

          return (
            <g key={row.date || row.month} className="chart-bar-group">
              <title>{`${row.date || row.month}: ${money(val)}`}</title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                className="chart-bar-rect"
                fill="#087656"
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize="11"
                fill="#475569"
                className="chart-x-label table-mono-cell tabular-nums"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AdminRevenuePage() {
  const api = usePaymentApi();
  const defaultRange = getVnThisMonthRange();

  const [filters, setFilters] = useState(defaultRange);
  const [activePreset, setActivePreset] = useState('this_month');
  const [state, setState] = useState({ loading: false, error: '', data: null, prevData: null });

  const invalidRange = Boolean(filters.from_date && filters.to_date && filters.from_date > filters.to_date);

  const getPreviousRange = (fromStr, toStr, groupBy) => {
    return getVnPreviousEquivalentRange(fromStr, toStr, groupBy);
  };

  const loadRevenue = useCallback(async (currentFilters) => {
    const isInvalid = Boolean(currentFilters.from_date && currentFilters.to_date && currentFilters.from_date > currentFilters.to_date);
    if (isInvalid) {
      setState({ loading: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', data: null, prevData: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const prevRange = getPreviousRange(currentFilters.from_date, currentFilters.to_date, currentFilters.group_by);
      const [currentRes, prevRes] = await Promise.allSettled([
        api.revenue(currentFilters),
        api.revenue(prevRange),
      ]);
      if (currentRes.status === 'rejected') {
        throw currentRes.reason;
      }
      setState({
        loading: false,
        error: '',
        data: currentRes.value,
        prevData: prevRes.status === 'fulfilled' ? prevRes.value : null,
      });
    } catch (error) {
      setState({ loading: false, error: errorText(error, 'Không thể tải báo cáo doanh thu.'), data: null, prevData: null });
    }
  }, [api]);

  useEffect(() => {
    void loadRevenue(filters);
  }, []);

  const selectPreset = (preset) => {
    const nextRange = preset.getRange();
    setActivePreset(preset.id);
    setFilters(nextRange);
    void loadRevenue(nextRange);
  };

  const submit = (event) => {
    event.preventDefault();
    setActivePreset('');
    void loadRevenue(filters);
  };

  const exportCsv = () => {
    if (!state.data?.data?.length) return;
    const header = ['Thời gian', 'Doanh thu (VNĐ)'];
    const rows = state.data.data.map((r) => [r.date || r.month, r.revenue]);
    rows.push(['Tổng cộng', state.data.total_revenue]);

    const csvContent = '\uFEFF' + [
      header.join(','),
      ...rows.map((e) => e.map((val) => `"${String(val).replaceAll('"', '""')}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `doanh_thu_${filters.from_date}_${filters.to_date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  // Tính so sánh với kỳ trước
  const currentTotal = Number(state.data?.total_revenue) || 0;
  const prevTotal = Number(state.prevData?.total_revenue) || 0;
  const diffAmount = currentTotal - prevTotal;
  let diffPercentText = null;
  let diffClass = 'diff-neutral';
  if (state.data && state.prevData) {
    if (prevTotal > 0) {
      const pct = ((diffAmount / prevTotal) * 100).toFixed(1);
      diffPercentText = `${pct > 0 ? '+' : ''}${pct}%`;
      diffClass = pct > 0 ? 'diff-positive' : pct < 0 ? 'diff-negative' : 'diff-neutral';
    } else if (currentTotal > 0) {
      diffPercentText = '+100%';
      diffClass = 'diff-positive';
    } else {
      diffPercentText = '0%';
      diffClass = 'diff-neutral';
    }
  }

  return (
    <PaymentShell>
      <Heading
        eyebrow="QUẢN TRỊ"
        title="Doanh thu thanh toán"
        description="Tổng hợp các khoản thanh toán thành công theo ngày hoặc tháng, so sánh với kỳ trước."
        actions={<Link className="button button-outline" to="/admin/payments">Lịch sử thanh toán</Link>}
      />
      <section className="surface-card booking-panel">
        {/* Nút lọc nhanh Preset */}
        <div className="revenue-preset-bar" aria-label="Khoảng thời gian nhanh">
          <span className="revenue-preset-label">Xem nhanh:</span>
          <div className="revenue-preset-buttons">
            {revenuePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`button button-outline button-small ${activePreset === preset.id ? 'is-active' : ''}`}
                onClick={() => selectPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form lọc tùy chỉnh */}
        <form className="revenue-filter-form" onSubmit={submit}>
          <Field
            id="revenue-from"
            label="Từ ngày"
            type="date"
            required
            value={filters.from_date}
            onChange={(event) => {
              setActivePreset('');
              setFilters((current) => ({ ...current, from_date: event.target.value }));
            }}
          />
          <Field
            id="revenue-to"
            label="Đến ngày"
            type="date"
            required
            value={filters.to_date}
            onChange={(event) => {
              setActivePreset('');
              setFilters((current) => ({ ...current, to_date: event.target.value }));
            }}
          />
          <label className="field">
            <span>Gom nhóm</span>
            <select
              value={filters.group_by}
              onChange={(event) => setFilters((current) => ({ ...current, group_by: event.target.value }))}
            >
              <option value="day">Theo ngày</option>
              <option value="month">Theo tháng</option>
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={state.loading || invalidRange}>
            Xem doanh thu
          </button>
        </form>

        {invalidRange ? <Notice type="error">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</Notice> : null}
        {state.error ? <Notice type="error">{state.error}</Notice> : null}
        {state.loading ? <LoadingView label="Đang tổng hợp doanh thu…" /> : null}

        {state.data ? (
          <section className="revenue-result">
            {/* Header tổng hợp kỳ hiện tại và so sánh kỳ trước */}
            <div className="revenue-summary-row">
              <div className="revenue-total">
                <span>Tổng doanh thu trong kỳ</span>
                <strong className="table-mono-cell tabular-nums">{money(state.data.total_revenue)}</strong>
                <small className="table-mono-cell tabular-nums">{state.data.from_date} — {state.data.to_date}</small>
              </div>

              {state.prevData ? (
                <div className="revenue-comparison">
                  <span>Kỳ trước ({state.prevData.from_date} — {state.prevData.to_date})</span>
                  <div className="revenue-comparison-values">
                    <span className="table-mono-cell tabular-nums">{money(state.prevData.total_revenue)}</span>
                    {diffPercentText ? (
                      <span className={`revenue-diff-badge ${diffClass} table-mono-cell tabular-nums`}>
                        {diffPercentText}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {state.data.data?.length ? (
                <div className="revenue-actions-top">
                  <button type="button" className="button button-outline" onClick={exportCsv}>
                    ⬇ Xuất CSV
                  </button>
                </div>
              ) : null}
            </div>

            {/* Biểu đồ cột SVG */}
            {state.data.data?.length ? (
              <div className="revenue-chart-section">
                <h3>Biểu đồ cột doanh thu {filters.group_by === 'day' ? 'theo ngày' : 'theo tháng'}</h3>
                <RevenueSvgChart rows={state.data.data} groupBy={filters.group_by} />
              </div>
            ) : null}

            {/* Bảng chi tiết */}
            <h2>Chi tiết {filters.group_by === 'day' ? 'theo ngày' : 'theo tháng'}</h2>
            {state.data.data?.length ? (
              <>
                <div className="table-wrap booking-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{filters.group_by === 'day' ? 'Ngày' : 'Tháng'}</th>
                        <th>Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.data.map((row) => (
                        <tr key={row.date || row.month}>
                          <td className="table-mono-cell tabular-nums">{row.date || row.month}</td>
                          <td className="table-mono-cell tabular-nums"><strong>{money(row.revenue)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="revenue-card-list">
                  {state.data.data.map((row) => (
                    <article className="booking-card" key={row.date || row.month}>
                      <div className="booking-card-top">
                        <strong className="table-mono-cell tabular-nums">{row.date || row.month}</strong>
                        <strong className="table-mono-cell tabular-nums">{money(row.revenue)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p>Không có khoản thanh toán thành công trong khoảng thời gian này.</p>
            )}

            <p className="field-hint">
              Theo backend, doanh thu chỉ tính payment có trạng thái success; payment pending, failed và refunded không được cộng.
            </p>
          </section>
        ) : null}
      </section>
    </PaymentShell>
  );
}
