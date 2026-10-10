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
import { createBookingsApi, isValidEmail } from './bookingsApi';

const bookingStatuses = ['holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'];
const emailKey = (id) => `booking_guest_email_${id}`;
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const rowsOf = (result) => Array.isArray(result) ? result : result?.data || [];
const pageOf = (result, page, limit) => result?.pagination || { page, limit, total: result?.total || result?.data?.length || 0, totalPages: 1 };
const errText = (error, fallback) => error?.message || fallback;
const errorFields = (error) => Array.isArray(error?.errors) ? Object.fromEntries(error.errors.map((item) => [item.field || item.path || '', item.message || item.msg || 'Thông tin chưa hợp lệ.'])) : {};
const airportsOf = (flight) => `${flight?.departureAirport?.iata_code || flight?.departure_airport?.iata_code || '—'} → ${flight?.arrivalAirport?.iata_code || flight?.arrival_airport?.iata_code || '—'}`;
const flightCarrier = (flight) => flight?.airline?.name || flight?.airline?.iata_code || 'Chuyến bay';
const passengerList = (booking) => booking?.passengers || booking?.bookingPassengers || [];
const paymentsList = (booking) => booking?.payments || [];

function BookingShell({ children, admin = false }) {
  return <div className="public-page booking-page"><AppHeader /><main className={`booking-main ${admin ? 'booking-admin-main' : ''}`}>{children}</main><footer className="site-footer"><span>Serene Flightways</span><span>Thông tin đặt chỗ được xử lý theo trạng thái từ hệ thống.</span></footer></div>;
}

function PageHeading({ eyebrow = 'ĐẶT VÉ MÁY BAY', title, description, actions }) {
  return <header className="booking-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="booking-heading-actions">{actions}</div> : null}</header>;
}

function useBookingsApi() {
  const { request } = useAuth();
  return useMemo(() => createBookingsApi(request), [request]);
}

function FlightChoice({ flight, onSelect }) {
  return <article className="booking-flight-choice"><div><span className="eyebrow">{flightCarrier(flight)}</span><h3>{airportsOf(flight)}</h3><p>{dateTime(flight.departure_time)} · còn {flight.available_seats ?? '—'} chỗ</p></div><button className="button button-primary" type="button" onClick={() => onSelect(flight)}>Chọn chuyến bay</button></article>;
}

export function BookingCreatePage() {
  const api = useBookingsApi();
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const [airports, setAirports] = useState([]);
  const [criteria, setCriteria] = useState({ departure_airport_id: '', arrival_airport_id: '', departure_date: '', passengers: '1' });
  const [results, setResults] = useState([]);
  const [flight, setFlight] = useState(null);
  const [fares, setFares] = useState([]);
  const [fare, setFare] = useState(null);
  const [promotionCode, setPromotionCode] = useState('');
  const [promotionState, setPromotionState] = useState({ checking: false, validCode: '', error: '' });
  const [passengers, setPassengers] = useState([{ passenger_name: '', passport_no: '' }]);
  const [guestEmail, setGuestEmail] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [state, setState] = useState({ loadingAirports: true, searching: false, loadingFares: false, submitting: false, error: '', stage: 'flight' });
  const urlParams = new URLSearchParams(window.location.search);
  const presetFlight = urlParams.get('flight_id');

  useEffect(() => {
    let active = true;
    api.airports().then((response) => { if (active) setAirports(rowsOf(response)); })
      .catch((error) => { if (active) setState((current) => ({ ...current, error: errText(error, 'Không thể tải danh sách sân bay.') })); })
      .finally(() => { if (active) setState((current) => ({ ...current, loadingAirports: false })); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!presetFlight) return undefined;
    let active = true;
    const loadPreset = async () => {
      try {
        const selected = await api.flightDetail(presetFlight);
        if (!active) return;
        setFlight(selected);
        setState((current) => ({ ...current, loadingFares: true, error: '' }));
        const response = await api.fareClassesForFlight(selected.id);
        if (!active) return;
        setFares(rowsOf(response));
        setState((current) => ({ ...current, loadingFares: false, stage: 'fare' }));
      } catch (error) {
        if (active) setState((current) => ({ ...current, loadingFares: false, error: errText(error, 'Không thể tải chuyến bay đã chọn.') }));
      }
    };
    void loadPreset();
    return () => { active = false; };
  }, [api, presetFlight]);

  const search = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, searching: true, error: '' }));
    try {
      const response = await api.searchFlights({ departure_airport_id: criteria.departure_airport_id, arrival_airport_id: criteria.arrival_airport_id, departure_date: criteria.departure_date, min_seats: criteria.passengers, page: 1, limit: 20 });
      setResults(rowsOf(response));
      setFlight(null); setFare(null); setFares([]);
      setState((current) => ({ ...current, searching: false, stage: 'flight' }));
    } catch (error) { setState((current) => ({ ...current, searching: false, error: errText(error, 'Không thể tìm chuyến bay.') })); }
  };

  const selectFlight = async (selected) => {
    setFlight(selected); setFare(null); setState((current) => ({ ...current, loadingFares: true, error: '' }));
    try {
      const response = await api.fareClassesForFlight(selected.id);
      setFares(rowsOf(response)); setState((current) => ({ ...current, loadingFares: false, stage: 'fare' }));
    } catch (error) { setState((current) => ({ ...current, loadingFares: false, error: errText(error, 'Không thể tải hạng vé của chuyến bay.') })); }
  };

  const continueToPassenger = () => {
    if (!fare) return setState((current) => ({ ...current, error: 'Vui lòng chọn một hạng vé.' }));
    const count = Number(criteria.passengers);
    setPassengers(Array.from({ length: count }, (_, index) => passengers[index] || { passenger_name: '', passport_no: '' }));
    setState((current) => ({ ...current, stage: 'passenger', error: '' }));
  };

  const validatePromotion = async () => {
    const code = promotionCode.trim().toUpperCase();
    if (!code) {
      setPromotionState({ checking: false, validCode: '', error: 'Nhập mã khuyến mại trước khi kiểm tra.' });
      return;
    }
    setPromotionState({ checking: true, validCode: '', error: '' });
    try {
      const result = await api.validatePromotion(code);
      const validatedCode = String(result?.code || code).trim().toUpperCase();
      setPromotionCode(validatedCode);
      setPromotionState({ checking: false, validCode: validatedCode, error: '' });
    } catch (validationError) {
      setPromotionState({ checking: false, validCode: '', error: errText(validationError, 'Mã khuyến mại chưa thể áp dụng.') });
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status === 'loading') return setState((current) => ({ ...current, error: 'Đang xác minh phiên đăng nhập. Vui lòng thử lại.' }));
    const normalizedPromotionCode = promotionCode.trim().toUpperCase();
    if (normalizedPromotionCode && promotionState.validCode !== normalizedPromotionCode) {
      setPromotionState((current) => ({ ...current, error: current.error || 'Hãy kiểm tra mã khuyến mại trước khi tạo đặt chỗ.' }));
      return;
    }
    const fields = {};
    if (!user && !isValidEmail(guestEmail)) fields.guest_email = 'Vui lòng nhập email hợp lệ để tra cứu và quản lý đặt chỗ.';
    passengers.forEach((passenger, index) => {
      if (!passenger.passenger_name.trim()) fields[`passengers.${index}.passenger_name`] = 'Vui lòng nhập họ tên hành khách.';
      if (passenger.passenger_name.trim().length > 150) fields[`passengers.${index}.passenger_name`] = 'Họ tên không vượt quá 150 ký tự.';
      if (passenger.passport_no.trim().length > 30) fields[`passengers.${index}.passport_no`] = 'Số hộ chiếu không vượt quá 30 ký tự.';
    });
    setFormErrors(fields);
    if (Object.keys(fields).length) return;
    setState((current) => ({ ...current, submitting: true, error: '' }));
    const payload = { flight_id: Number(flight.id), fare_class_id: Number(fare.id), passengers: passengers.map(({ passenger_name, passport_no }) => ({ passenger_name: passenger_name.trim(), ...(passport_no.trim() ? { passport_no: passport_no.trim() } : {}) })), ...(normalizedPromotionCode ? { promotion_code: normalizedPromotionCode } : {}), ...(!user ? { guest_email: guestEmail.trim().toLowerCase() } : {}) };
    try {
      const booking = await api.createBooking(payload);
      const bookingId = booking?.id || booking?.booking?.id;
      if (!bookingId) throw new Error('Máy chủ không trả về mã đặt chỗ.');
      if (!user) sessionStorage.setItem(emailKey(bookingId), guestEmail.trim().toLowerCase());
      navigate(`/bookings/${bookingId}/payment`, { state: { booking, guestEmail: !user ? guestEmail.trim().toLowerCase() : '' } });
    } catch (error) { setState((current) => ({ ...current, submitting: false, error: errText(error, 'Không thể tạo yêu cầu đặt chỗ.'), fields: errorFields(error) })); }
  };

  return <BookingShell><PageHeading title="Tạo đặt chỗ" description="Chọn chuyến bay và hạng vé, sau đó nhập thông tin hành khách." actions={<Link className="button button-outline" to="/bookings/lookup">Đã có mã đặt chỗ?</Link>} />
    {state.error ? <Notice type="error">{state.error}</Notice> : null}
    <div className="booking-steps" aria-label="Các bước đặt vé"><span className={state.stage === 'flight' ? 'is-current' : 'is-done'}>1 <b>Chuyến bay</b></span><span className={state.stage === 'fare' ? 'is-current' : state.stage === 'passenger' ? 'is-done' : ''}>2 <b>Hạng vé</b></span><span className={state.stage === 'passenger' ? 'is-current' : ''}>3 <b>Hành khách</b></span></div>
    <section className="surface-card booking-panel">
      {state.stage === 'flight' ? <>
        <h2>Tìm chuyến bay</h2>
        <form className="booking-search-form" onSubmit={search}>
          <label className="field"><span>Sân bay đi</span><select required value={criteria.departure_airport_id} onChange={(event) => setCriteria((current) => ({ ...current, departure_airport_id: event.target.value }))}><option value="">Chọn sân bay</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.iata_code} · {item.city || item.name}</option>)}</select></label>
          <label className="field"><span>Sân bay đến</span><select required value={criteria.arrival_airport_id} onChange={(event) => setCriteria((current) => ({ ...current, arrival_airport_id: event.target.value }))}><option value="">Chọn sân bay</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.iata_code} · {item.city || item.name}</option>)}</select></label>
          <label className="field"><span>Ngày khởi hành</span><input type="date" required value={criteria.departure_date} onChange={(event) => setCriteria((current) => ({ ...current, departure_date: event.target.value }))} /></label>
          <label className="field"><span>Số hành khách</span><input type="number" min="1" required value={criteria.passengers} onChange={(event) => setCriteria((current) => ({ ...current, passengers: event.target.value }))} /></label>
          <button className="button button-primary" type="submit" disabled={state.searching || state.loadingAirports}>{state.searching ? 'Đang tìm…' : 'Tìm chuyến bay'}</button>
        </form>
        {results.length ? <div className="booking-flight-list">{results.map((item) => <FlightChoice key={item.id} flight={item} onSelect={selectFlight} />)}</div> : null}
        {results.length === 0 && !state.searching && criteria.departure_date ? <p className="empty-state">Chưa có kết quả. Hãy thử tìm chuyến bay phù hợp với tiêu chí khác.</p> : null}
      </> : null}
      {state.stage === 'fare' || state.loadingFares && flight ? <><div className="booking-section-heading"><div><h2>Chọn hạng vé</h2><p>{flightCarrier(flight)} · {airportsOf(flight)} · {dateTime(flight.departure_time)}</p></div><button className="button button-outline" type="button" onClick={() => { setFlight(null); setFare(null); setState((current) => ({ ...current, stage: 'flight' })); }}>Đổi chuyến bay</button></div>{state.loadingFares ? <LoadingView label="Đang tải hạng vé…" /> : fares.length ? <><div className="booking-fare-list">{fares.map((item) => <label className={`booking-fare-option ${fare?.id === item.id ? 'is-selected' : ''}`} key={item.id}><input type="radio" name="fare" checked={fare?.id === item.id} onChange={() => setFare(item)} /><span><strong>{item.class_name}</strong><small>{item.seat_quota ?? '—'} ghế phân bổ</small></span><strong>{money(item.price)} / khách</strong></label>)}</div><button className="button button-primary" type="button" onClick={continueToPassenger}>Tiếp tục</button></> : <div className="empty-state"><h3>Chưa có hạng vé cho chuyến bay này</h3><p>Hãy chọn chuyến bay khác hoặc quay lại sau.</p></div>}</> : null}
      {state.stage === 'passenger' ? <div className="booking-passenger-layout">
        <section className="booking-passenger-main" aria-labelledby="passenger-form-title">
          <div className="booking-section-heading"><div><h2 id="passenger-form-title">Thông tin hành khách</h2><p>{flightCarrier(flight)} · {fare?.class_name} · {passengers.length} hành khách</p></div><button className="button button-outline" type="button" onClick={() => setState((current) => ({ ...current, stage: 'fare' }))}>Đổi hạng vé</button></div>
          <form className="booking-passenger-form" onSubmit={submit} noValidate>
            {!user ? <Field id="booking-guest-email" label="Email liên hệ" type="email" autoComplete="email" required value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} error={formErrors.guest_email} hint="Dùng email này cùng mã đặt chỗ để tra cứu đặt chỗ của bạn." /> : null}
            <div className="booking-promotion-entry">
              <Field id="booking-promotion-code" label="Mã khuyến mại (không bắt buộc)" autoComplete="off" maxLength={30} value={promotionCode} onChange={(event) => { setPromotionCode(event.target.value); setPromotionState({ checking: false, validCode: '', error: '' }); }} hint="Mã sẽ được hệ thống kiểm tra lại khi tạo đặt chỗ." />
              <button className="button button-outline" type="button" disabled={promotionState.checking || !promotionCode.trim()} onClick={() => void validatePromotion()}>{promotionState.checking ? 'Đang kiểm tra…' : 'Kiểm tra mã'}</button>
              {promotionState.error ? <p className="booking-promotion-message is-error" role="alert">{promotionState.error}</p> : null}
              {promotionState.validCode ? <p className="booking-promotion-message" role="status">Mã {promotionState.validCode} hợp lệ. Giá cuối cùng do hệ thống tính khi tạo đặt chỗ.</p> : null}
            </div>
            {passengers.map((passenger, index) => <fieldset className="passenger-fieldset" key={index}><legend>Hành khách {index + 1}</legend><Field id={`passenger-name-${index}`} label="Họ tên" autoComplete="name" required value={passenger.passenger_name} onChange={(event) => setPassengers((current) => current.map((item, at) => at === index ? { ...item, passenger_name: event.target.value } : item))} error={formErrors[`passengers.${index}.passenger_name`]} /><Field id={`passenger-passport-${index}`} label="Số hộ chiếu (không bắt buộc)" value={passenger.passport_no} onChange={(event) => setPassengers((current) => current.map((item, at) => at === index ? { ...item, passport_no: event.target.value } : item))} error={formErrors[`passengers.${index}.passport_no`]} /></fieldset>)}
            {state.fields ? Object.entries(state.fields).map(([field, message]) => <small className="field-error" key={field}>{message}</small>) : null}
            <div className="booking-total-row"><span>Giá tham khảo trước ưu đãi</span><strong>{money(Number(fare?.price || 0) * passengers.length)}</strong><small>{promotionState.validCode ? 'Mã đã được kiểm tra; hệ thống sẽ tính và xác nhận tổng tiền khi tạo đặt chỗ.' : 'Giá cuối cùng và ưu đãi (nếu có) do hệ thống xác nhận khi tạo đặt chỗ.'}</small></div>
            <button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang tạo đặt chỗ…' : 'Tạo đặt chỗ và tiếp tục thanh toán'}</button>
          </form>
        </section>
        <aside className="booking-passenger-summary" aria-label="Tóm tắt hành trình">
          <span className="eyebrow">TÓM TẮT HÀNH TRÌNH</span>
          <h3>Chuyến bay đã chọn</h3>
          <div className="passenger-route-summary"><strong>{flight?.departureAirport?.iata_code || flight?.departure_airport?.iata_code || '—'}</strong><span aria-hidden="true">→</span><strong>{flight?.arrivalAirport?.iata_code || flight?.arrival_airport?.iata_code || '—'}</strong></div>
          <p className="passenger-airline-summary">{flightCarrier(flight)}</p>
          <dl><div><dt>Khởi hành</dt><dd>{dateTime(flight?.departure_time)}</dd></div><div><dt>Hạng vé</dt><dd>{fare?.class_name || '—'}</dd></div><div><dt>Số hành khách</dt><dd>{passengers.length}</dd></div><div><dt>Giá tham khảo</dt><dd>{money(Number(fare?.price || 0) * passengers.length)}</dd></div></dl>
          <p className="passenger-summary-note">Giá cuối cùng và thời gian giữ chỗ do hệ thống xác nhận sau khi gửi yêu cầu.</p>
        </aside>
      </div> : null}
    </section>
  </BookingShell>;
}

export function BookingLookupPage() {
  const api = useBookingsApi();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ submitting: false, error: '', booking: null });
  const submit = async (event) => {
    event.preventDefault(); setState({ submitting: true, error: '', booking: null });
    if (!isValidEmail(email)) return setState({ submitting: false, error: 'Vui lòng nhập email hợp lệ.', booking: null });
    try {
      const booking = await api.lookupBooking(code.trim(), email.trim().toLowerCase());
      sessionStorage.setItem(emailKey(booking.id), email.trim().toLowerCase());
      setState({ submitting: false, error: '', booking });
    } catch (error) { setState({ submitting: false, error: errText(error, 'Không tìm thấy đặt chỗ hoặc thông tin xác thực không khớp.'), booking: null }); }
  };
  return <BookingShell><PageHeading eyebrow="TRA CỨU ĐẶT CHỖ" title="Tìm đặt chỗ của bạn" description="Nhập mã đặt chỗ và email liên hệ đã dùng khi tạo đặt chỗ." /><section className="surface-card booking-panel lookup-panel"><form className="booking-form-grid" onSubmit={submit} noValidate><Field id="lookup-code" label="Mã đặt chỗ" required autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} /><Field id="lookup-email" label="Email liên hệ" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang tra cứu…' : 'Tra cứu đặt chỗ'}</button></form>{state.error ? <Notice type="error">{state.error}</Notice> : null}{state.booking ? <article className="lookup-result"><div><span className="eyebrow">ĐẶT CHỖ ĐÃ TÌM THẤY</span><h2>{state.booking.booking_code}</h2><p>{airportsOf(state.booking.flight)} · {dateTime(state.booking.flight?.departure_time)}</p></div><StatusBadge status={state.booking.status} /><button className="button button-secondary" type="button" onClick={() => navigate(`/bookings/${state.booking.id}`, { state: { guestEmail: email.trim().toLowerCase() } })}>Xem chi tiết</button></article> : null}</section></BookingShell>;
}

function BookingCard({ booking, to, guestEmail }) {
  const flight = booking.flight || {};
  return <article className="booking-card"><div className="booking-card-top"><div><span className="eyebrow">MÃ ĐẶT CHỖ</span><h2>{booking.booking_code || `#${booking.id}`}</h2></div><StatusBadge status={booking.status} /></div><p className="booking-card-route"><strong>{airportsOf(flight)}</strong><span>{dateTime(flight.departure_time)}</span></p><div className="booking-card-bottom"><strong>{money(booking.total_amount)}</strong><Link className="button button-outline" to={to} state={{ guestEmail }}>Chi tiết</Link></div></article>;
}

export function MyBookingsPage() {
  const api = useBookingsApi();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.max(1, Number(params.get('limit')) || 10); const status = params.get('status') || '';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const result = await api.myBookings({ page, limit, status }); setState({ loading: false, rows: rowsOf(result), pagination: pageOf(result, page, limit), error: '' }); } catch (error) { setState((current) => ({ ...current, loading: false, error: errText(error, 'Không thể tải đặt chỗ.') })); } }, [api, page, limit, status]);
  useEffect(() => { void load(); }, [load]);
  const update = (values) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); return next; });
  return <BookingShell><PageHeading title="Đặt chỗ của tôi" description="Theo dõi trạng thái và thông tin các đặt chỗ của bạn." actions={<Link className="button button-primary" to="/bookings/new">Đặt vé</Link>} />{state.loading ? <LoadingView label="Đang tải đặt chỗ…" /> : state.error ? <Notice type="error">{state.error}</Notice> : <section className="surface-card booking-panel"><div className="booking-list-toolbar"><label className="field"><span>Lọc trạng thái</span><select aria-label="Lọc trạng thái" value={status} onChange={(event) => update({ status: event.target.value, page: 1 })}><option value="">Tất cả trạng thái</option>{bookingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><span>{state.pagination?.total ?? state.rows.length} đặt chỗ</span></div>{state.rows.length ? <div className="booking-card-list">{state.rows.map((booking) => <BookingCard key={booking.id} booking={booking} to={`/bookings/${booking.id}`} />)}</div> : <div className="empty-state"><h2>Chưa có đặt chỗ</h2><p>Khi tạo đặt chỗ, thông tin sẽ xuất hiện tại đây.</p><Link className="button button-primary" to="/bookings/new">Tìm chuyến bay</Link></div>}<Pagination page={Number(state.pagination?.page || page)} totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))} onPageChange={(next) => update({ page: next })} /></section>}</BookingShell>;
}

export function AdminBookingsPage() {
  const api = useBookingsApi();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.max(1, Number(params.get('limit')) || 10); const status = params.get('status') || ''; const search = params.get('search') || '';
  const [draftSearch, setDraftSearch] = useState(search); const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const result = await api.adminBookings({ page, limit, status, search }); setState({ loading: false, rows: rowsOf(result), pagination: pageOf(result, page, limit), error: '' }); } catch (error) { setState((current) => ({ ...current, loading: false, error: errText(error, 'Không thể tải danh sách đặt chỗ.') })); } }, [api, page, limit, status, search]);
  useEffect(() => { void load(); }, [load]);
  const update = (values) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); return next; });
  const submitSearch = (event) => { event.preventDefault(); update({ search: draftSearch.trim(), page: 1 }); };
  return <BookingShell admin><PageHeading eyebrow="VẬN HÀNH" title="Quản lý đặt chỗ" description="Tra cứu đặt chỗ theo mã/email và theo dõi trạng thái." />{state.loading ? <LoadingView label="Đang tải danh sách…" /> : state.error ? <Notice type="error">{state.error}</Notice> : <section className="surface-card booking-panel"><div className="booking-list-toolbar"><form className="booking-admin-filter" onSubmit={submitSearch}><Field id="booking-admin-search" label="Tìm mã đặt chỗ hoặc email" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} /><button className="button button-secondary" type="submit">Tìm</button></form><label className="field"><span>Trạng thái</span><select aria-label="Trạng thái đặt chỗ" value={status} onChange={(event) => update({ status: event.target.value, page: 1 })}><option value="">Tất cả</option>{bookingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{state.rows.length ? <><div className="table-wrap booking-table-wrap"><table><thead><tr><th>Mã</th><th>Khách</th><th>Chuyến bay</th><th>Tạo lúc</th><th>Tổng tiền</th><th>Trạng thái</th><th /></tr></thead><tbody>{state.rows.map((booking) => <tr key={booking.id}><td>{booking.booking_code}</td><td>{booking.user?.full_name || booking.guest_email || booking.user?.email || '—'}</td><td>{airportsOf(booking.flight)}</td><td>{dateTime(booking.created_at)}</td><td>{money(booking.total_amount)}</td><td><StatusBadge status={booking.status} /></td><td><Link to={`/admin/bookings/${booking.id}`}>Chi tiết</Link></td></tr>)}</tbody></table></div><div className="booking-admin-cards">{state.rows.map((booking) => <BookingCard key={booking.id} booking={booking} to={`/admin/bookings/${booking.id}`} />)}</div><Pagination page={Number(state.pagination?.page || page)} totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))} onPageChange={(next) => update({ page: next })} /></> : <div className="empty-state"><h2>Không có kết quả</h2><p>Thử mã đặt chỗ, email hoặc trạng thái khác.</p></div>}</section>}</BookingShell>;
}

export function BookingDetailPage({ admin = false }) {
  const api = useBookingsApi(); const { id } = useParams(); const location = useLocation(); const { user, status } = useAuth();
  const guestEmail = location.state?.guestEmail || sessionStorage.getItem(emailKey(id)) || '';
  const [state, setState] = useState({ loading: true, booking: null, error: '', actionError: '', pending: false }); const [confirmCancel, setConfirmCancel] = useState(false);
  const load = useCallback(async () => { if (status === 'loading') return; setState((current) => ({ ...current, loading: true, error: '' })); try { const booking = await api.bookingDetail(id, user ? undefined : guestEmail); setState((current) => ({ ...current, loading: false, booking, error: '' })); } catch (error) { setState((current) => ({ ...current, loading: false, error: errText(error, 'Không thể tải đặt chỗ.') })); } }, [api, id, guestEmail, status, user]);
  useEffect(() => { void load(); }, [load]);
  const cancel = async () => { setState((current) => ({ ...current, pending: true, actionError: '' })); try { await api.cancelBooking(id, user ? undefined : guestEmail); setConfirmCancel(false); await load(); setState((current) => ({ ...current, pending: false })); } catch (error) { setState((current) => ({ ...current, pending: false, actionError: errText(error, 'Không thể hủy đặt chỗ.') })); } };
  const download = async () => { setState((current) => ({ ...current, pending: true, actionError: '' })); try { const blob = await api.downloadTicket(id, user ? undefined : guestEmail); if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Máy chủ không trả về tệp vé hợp lệ.'); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ticket_${id}.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); } catch (error) { setState((current) => ({ ...current, actionError: errText(error, 'Không thể tải vé điện tử.') })); } finally { setState((current) => ({ ...current, pending: false })); } };
  if (state.loading || status === 'loading') return <BookingShell admin={admin}><LoadingView label="Đang tải chi tiết đặt chỗ…" /></BookingShell>;
  if (state.error || !state.booking) return <BookingShell admin={admin}><PageHeading title="Không tải được đặt chỗ" /><section className="surface-card booking-panel"><Notice type="error">{state.error || 'Không tìm thấy đặt chỗ.'}</Notice><Link className="button button-outline" to={admin ? '/admin/bookings' : user ? '/bookings/my' : '/bookings/lookup'}>Quay lại</Link></section></BookingShell>;
  const booking = state.booking; const flight = booking.flight || {}; const passengers = passengerList(booking); const isAdmin = user?.role === 'admin';
  return <BookingShell admin={admin}><PageHeading eyebrow="CHI TIẾT ĐẶT CHỖ" title={booking.booking_code || `Đặt chỗ #${booking.id}`} description={`${flightCarrier(flight)} · ${airportsOf(flight)}`} actions={<Link className="button button-outline" to={admin ? '/admin/bookings' : user ? '/bookings/my' : '/bookings/lookup'}>Danh sách đặt chỗ</Link>} />
    {state.actionError ? <Notice type="error">{state.actionError}</Notice> : null}
    <div className="booking-detail-grid"><section className="surface-card booking-panel"><div className="booking-detail-title"><h2>Hành trình</h2><StatusBadge status={booking.status} /></div><dl className="booking-facts"><div><dt>Hãng hàng không</dt><dd>{flightCarrier(flight)}</dd></div><div><dt>Chặng bay</dt><dd>{airportsOf(flight)}</dd></div><div><dt>Khởi hành</dt><dd>{dateTime(flight.departure_time)}</dd></div><div><dt>Đến nơi</dt><dd>{dateTime(flight.arrival_time)}</dd></div><div><dt>Hạng vé</dt><dd>{booking.fareClass?.class_name || booking.fare_class?.class_name || '—'}</dd></div><div><dt>Tạo lúc</dt><dd>{dateTime(booking.created_at)}</dd></div><div><dt>Giữ chỗ đến</dt><dd>{dateTime(booking.hold_expires_at)}</dd></div><div><dt>Tổng tiền</dt><dd><strong>{money(booking.total_amount)}</strong></dd></div></dl><h3>Hành khách</h3><div className="passenger-summary">{passengers.map((item, index) => <div key={item.id || index}><strong>{item.passenger_name}</strong><span>{item.passport_no || 'Không cung cấp số hộ chiếu'}</span></div>)}</div>
      <div className="booking-actions">{booking.status === 'holding' ? <Link className="button button-primary" to={`/bookings/${id}/payment`} state={{ booking, guestEmail }}>Tiếp tục thanh toán</Link> : null}{booking.status === 'confirmed' ? <button className="button button-secondary" type="button" disabled={state.pending} onClick={() => void download()}>{state.pending ? 'Đang chuẩn bị tệp…' : 'Tải vé PDF'}</button> : null}{booking.status === 'holding' && !admin ? <button className="button button-danger" type="button" onClick={() => setConfirmCancel(true)}>Hủy đặt chỗ</button> : null}{admin && isAdmin && booking.status === 'confirmed' ? <Link className="button button-outline" to={`/admin/payments?booking_id=${booking.id}`}>Xem thanh toán</Link> : null}</div>
    </section>{admin ? <aside className="surface-card booking-panel"><h2>Thông tin khách hàng</h2><p>{booking.user?.full_name || 'Khách vãng lai'}</p><p>{booking.user?.email || booking.guest_email || '—'}</p><h3>Lịch sử thanh toán</h3>{paymentsList(booking).length ? paymentsList(booking).map((payment) => <div className="booking-payment-line" key={payment.id}><span>{payment.payment_method} · {payment.transaction_ref}</span><StatusBadge status={payment.status} /></div>) : <p>Chưa có thanh toán.</p>}</aside> : null}</div>
    <ConfirmDialog open={confirmCancel} title="Hủy đặt chỗ này?" description="Chỉ đặt chỗ đang được giữ chỗ mới có thể hủy. Ghế và ưu đãi liên quan sẽ được xử lý theo nghiệp vụ của hệ thống." confirmLabel="Xác nhận hủy" danger pending={state.pending} onConfirm={() => void cancel()} onCancel={() => setConfirmCancel(false)} />
  </BookingShell>;
}
