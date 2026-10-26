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
import { useFlightSocket } from '../../lib/socket';
import { createBookingsApi, isValidEmail } from './bookingsApi';
import { money } from '../../lib/formatters';
import { getServerTimeOffset } from '../../lib/apiClient';
import { BoardingPassCard } from './BoardingPassCard';
import './seatSelection.css';

export const bookingStatusSourceLabels = {
  booking_created: 'Tạo đặt chỗ ban đầu',
  customer_cancel: 'Khách hàng hủy đặt chỗ',
  customer_web: 'Đặt chỗ qua website',
  holding_expired: 'Hết hạn giữ chỗ tự động',
  payment_reconciliation_expired: 'Hết hạn đối soát thanh toán',
  payment_initiated: 'Bắt đầu thanh toán',
  gateway_setup_failed: 'Khởi tạo cổng thanh toán thất bại',
  payment_failed_retryable: 'Thanh toán thất bại (cho phép thử lại)',
  payment_failed_expired: 'Thanh toán thất bại (hết hạn giữ chỗ)',
  payment_vnpay_success: 'Thanh toán VNPay thành công',
  payment_vnpay_failed_retryable: 'Thanh toán VNPay thất bại (thử lại)',
  payment_vnpay_failed_expired: 'Thanh toán VNPay thất bại (hết hạn)',
  payment_payos_success: 'Thanh toán payOS thành công',
  payment_payos_failed_retryable: 'Thanh toán payOS thất bại (thử lại)',
  payment_payos_failed_expired: 'Thanh toán payOS thất bại (hết hạn)',
  payos_webhook: 'Webhook payOS',
  admin_refund: 'Quản trị viên hoàn tiền nội bộ',
};

export function getStatusSourceLabel(source) {
  if (!source) return '—';
  return bookingStatusSourceLabels[source] || source.replaceAll('_', ' ');
}

const bookingStatuses = ['holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'];
const emailKey = (id) => `booking_guest_email_${id}`;
const dateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const rowsOf = (result) => Array.isArray(result) ? result : result?.data || [];
const pageOf = (result, page, limit) => result?.pagination || { page, limit, total: result?.total || result?.data?.length || 0, totalPages: 1 };
const errText = (error, fallback) => error?.message || fallback;
const errorFields = (error) => Array.isArray(error?.errors) ? Object.fromEntries(error.errors.map((item) => [item.field || item.path || '', item.message || item.msg || 'Thông tin chưa hợp lệ.'])) : {};
const airportsOf = (flight) => `${flight?.departureAirport?.iata_code || flight?.departure_airport?.iata_code || '—'} → ${flight?.arrivalAirport?.iata_code || flight?.arrival_airport?.iata_code || '—'}`;
const flightCarrier = (flight) => flight?.airline?.name || flight?.airline?.iata_code || 'Chuyến bay';
const passengerList = (booking) => booking?.passengers || booking?.bookingPassengers || [];
const paymentsList = (booking) => booking?.payments || [];
const ancillaryMaxQuantity = (offer, selections, legOrder, passengerIndex, ownedQuantity = 0) => {
  const otherSelections = selections.filter((item) => Number(item.offer_id) === Number(offer.id)
    && !(Number(item.leg_order) === Number(legOrder) && Number(item.passenger_index) === Number(passengerIndex)))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const available = Number(offer.capacity) - Number(offer.reserved_quantity) + Number(ownedQuantity) - otherSelections;
  const configuredLimit = Number(offer.max_quantity_per_passenger);
  const perPassengerLimit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : Number(offer.capacity);
  return Math.max(0, Math.min(available, perPassengerLimit));
};
// The query comes from public search; do not allocate an unbounded passenger
// form from a malformed or excessively large URL parameter.
const countFromSearchParams = (params) => {
  const raw = params.get('passengers');
  const count = Number(raw);
  return /^\d+$/.test(raw || '') && Number.isSafeInteger(count) && count >= 1 && count <= 200
    ? String(count)
    : '1';
};

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
  const [urlParams] = useSearchParams();
  const [airports, setAirports] = useState([]);
  const [criteria, setCriteria] = useState({ departure_airport_id: '', arrival_airport_id: '', departure_date: '', passengers: countFromSearchParams(urlParams) });
  const [results, setResults] = useState([]);
  const [flight, setFlight] = useState(null);
  const [itineraryFlights, setItineraryFlights] = useState([]);
  const [fares, setFares] = useState([]);
  const [fare, setFare] = useState(null);
  const [promotionCode, setPromotionCode] = useState('');
  const [promotionState, setPromotionState] = useState({ checking: false, validCode: '', error: '' });
  const [passengers, setPassengers] = useState([{ passenger_name: '', passport_no: '' }]);
  const [seatMaps, setSeatMaps] = useState({});
  const [seatSelections, setSeatSelections] = useState([]);
  const [ancillaryOffers, setAncillaryOffers] = useState({});
  const [ancillarySelections, setAncillarySelections] = useState([]);
  const [activeSeatPassenger, setActiveSeatPassenger] = useState(0);
  const [guestEmail, setGuestEmail] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [state, setState] = useState({ loadingAirports: true, searching: false, loadingFares: false, submitting: false, error: '', stage: 'flight' });
  const searchRequest = useRef(0);
  const fareRequest = useRef(0);
  const seatMapRequest = useRef(0);
  const presetFlight = urlParams.get('flight_id');
  const tripType = urlParams.get('trip_type') || '';
  const expectsItinerary = tripType === 'round_trip' || tripType === 'multi_city';
  const rawItinerary = urlParams.get('itinerary_legs');
  let requestedItinerary = [];
  if (tripType === 'round_trip' || tripType === 'multi_city') {
    try { requestedItinerary = JSON.parse(rawItinerary || '[]'); } catch { requestedItinerary = []; }
  }
  const itineraryKey = JSON.stringify(requestedItinerary);

  // WebSocket: subscribe to flight room when a flight is selected
  const { lastWarning, clearWarning } = useFlightSocket({
    flightId: flight?.id,
    enabled: !!flight?.id,
    onFlightUpdated: (data) => {
      setFlight((current) => current ? { ...current, ...data, id: current.id } : current);
    },
    onSeatsUpdated: (data) => {
      setFlight((current) => current ? { ...current, available_seats: data.available_seats } : current);
    },
  });

  useEffect(() => {
    let active = true;
    api.airports().then((response) => { if (active) setAirports(rowsOf(response)); })
      .catch((error) => { if (active) setState((current) => ({ ...current, error: errText(error, 'Không thể tải danh sách sân bay.') })); })
      .finally(() => { if (active) setState((current) => ({ ...current, loadingAirports: false })); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (state.stage !== 'passenger' || !flight || !fare) return undefined;
    let active = true;
    const requestId = ++seatMapRequest.current;
    const legs = itineraryFlights.length > 1 ? itineraryFlights : [{ flight, fare }];
    Promise.all(legs.map(async (leg, index) => {
      try { return [index + 1, await api.seatMapForFlight(leg.flight.id)]; }
      catch { return [index + 1, { supported: false, seats: [] }]; }
    })).then((entries) => {
      if (active && requestId === seatMapRequest.current) setSeatMaps(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [api, fare, flight, itineraryFlights, state.stage]);

  useEffect(() => {
    if (state.stage !== 'passenger' || !flight || !fare) return undefined;
    let active = true;
    const legs = itineraryFlights.length > 1 ? itineraryFlights : [{ flight, fare }];
    Promise.all(legs.map(async (leg, index) => {
      try { return [index + 1, rowsOf(await api.ancillaryOffers(leg.flight.id, leg.fare.id))]; }
      catch { return [index + 1, []]; }
    })).then((entries) => { if (active) setAncillaryOffers(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [api, fare, flight, itineraryFlights, state.stage]);

  useEffect(() => {
    if (!presetFlight || requestedItinerary.length > 1) return undefined;
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
  }, [api, presetFlight, itineraryKey]);

  useEffect(() => {
    if (!expectsItinerary) return undefined;
    if (requestedItinerary.length < 2 || requestedItinerary.length > 4) {
      setState((current) => ({ ...current, error: 'Hành trình đã chọn không hợp lệ. Hãy quay lại tìm chuyến bay.' }));
      return undefined;
    }
    let active = true;
    const loadItinerary = async () => {
      setState((current) => ({ ...current, loadingFares: true, error: '' }));
      try {
        const selected = await Promise.all(requestedItinerary.map(async (leg) => {
          if (!Number.isInteger(Number(leg.flight_id)) || !Number.isInteger(Number(leg.fare_class_id))) throw new Error('Thông tin chuyến bay đã chọn không hợp lệ.');
          const [selectedFlight, fareResponse] = await Promise.all([api.flightDetail(leg.flight_id), api.fareClassesForFlight(leg.flight_id)]);
          const selectedFare = rowsOf(fareResponse).find((item) => Number(item.id) === Number(leg.fare_class_id));
          if (!selectedFare) throw new Error('Hạng vé đã chọn không còn khả dụng. Vui lòng tìm lại hành trình.');
          return { flight: selectedFlight, fare: selectedFare };
        }));
        if (!active) return;
        const selectedFlights = selected.map(({ flight: selectedFlight }) => selectedFlight);
        const connectsInOrder = selectedFlights.every((selectedFlight, index) => {
          if (index === 0) return true;
          const previous = selectedFlights[index - 1];
          const gap = new Date(selectedFlight.departure_time).getTime() - new Date(previous.arrival_time).getTime();
          return Number(previous.arrival_airport_id) === Number(selectedFlight.departure_airport_id)
            && Number.isFinite(gap) && gap >= 60 * 60 * 1000;
        });
        const returnsToOrigin = tripType !== 'round_trip' || (selectedFlights.length === 2
          && Number(selectedFlights[0].departure_airport_id) === Number(selectedFlights[1].arrival_airport_id)
          && Number(selectedFlights[0].arrival_airport_id) === Number(selectedFlights[1].departure_airport_id));
        if (!connectsInOrder || !returnsToOrigin) throw new Error('Các chuyến bay không tạo thành hành trình hợp lệ hoặc thời gian nối chuyến dưới 60 phút. Hãy tìm lại chuyến bay.');
        setItineraryFlights(selected);
        setSeatSelections([]);
        setFlight(selected[0].flight);
        setFare(selected[0].fare);
        setCriteria((current) => ({ ...current, passengers: countFromSearchParams(urlParams) }));
        setPassengers((current) => Array.from({ length: countFromSearchParams(urlParams) }, (_, index) => current[index] || { passenger_name: '', passport_no: '' }));
        setState((current) => ({ ...current, loadingFares: false, stage: 'passenger' }));
      } catch (error) {
        if (active) setState((current) => ({ ...current, loadingFares: false, stage: 'flight', error: errText(error, 'Không thể xác minh hành trình đã chọn. Hãy tìm lại chuyến bay.') }));
      }
    };
    void loadItinerary();
    return () => { active = false; };
  }, [api, expectsItinerary, itineraryKey, urlParams]);

  const search = async (event) => {
    event.preventDefault();
    const requestId = ++searchRequest.current;
    setState((current) => ({ ...current, searching: true, error: '' }));
    try {
      const response = await api.searchFlights({ departure_airport_id: criteria.departure_airport_id, arrival_airport_id: criteria.arrival_airport_id, departure_date: criteria.departure_date, min_seats: criteria.passengers, page: 1, limit: 20 });
      if (requestId !== searchRequest.current) return;
      setResults(rowsOf(response));
      setFlight(null); setFare(null); setFares([]); setItineraryFlights([]); setSeatSelections([]);
      setState((current) => ({ ...current, searching: false, stage: 'flight' }));
    } catch (error) { if (requestId === searchRequest.current) setState((current) => ({ ...current, searching: false, error: errText(error, 'Không thể tìm chuyến bay.') })); }
  };

  const selectFlight = async (selected) => {
    const requestId = ++fareRequest.current;
    setFlight(selected); setFare(null); setFares([]); setItineraryFlights([]); setSeatSelections([]); setState((current) => ({ ...current, loadingFares: true, error: '' }));
    try {
      const response = await api.fareClassesForFlight(selected.id);
      if (requestId !== fareRequest.current) return;
      setFares(rowsOf(response)); setState((current) => ({ ...current, loadingFares: false, stage: 'fare' }));
    } catch (error) { if (requestId === fareRequest.current) setState((current) => ({ ...current, loadingFares: false, error: errText(error, 'Không thể tải hạng vé của chuyến bay.') })); }
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
    const payload = { flight_id: Number(flight.id), fare_class_id: Number(fare.id), ...(itineraryFlights.length > 1 ? { trip_type: tripType, itinerary_legs: itineraryFlights.map(({ flight: legFlight, fare: legFare }) => ({ flight_id: Number(legFlight.id), fare_class_id: Number(legFare.id) })) } : {}), ...(seatSelections.length ? { seat_selections: seatSelections } : {}), ...(ancillarySelections.length ? { ancillary_selections: ancillarySelections } : {}), passengers: passengers.map(({ passenger_name, passport_no }) => ({ passenger_name: passenger_name.trim(), ...(passport_no.trim() ? { passport_no: passport_no.trim() } : {}) })), ...(normalizedPromotionCode ? { promotion_code: normalizedPromotionCode } : {}), ...(!user ? { guest_email: guestEmail.trim().toLowerCase() } : {}) };
    try {
      const booking = await api.createBooking(payload);
      const bookingId = booking?.id || booking?.booking?.id;
      if (!bookingId) throw new Error('Máy chủ không trả về mã đặt chỗ.');
      if (!user) sessionStorage.setItem(emailKey(bookingId), guestEmail.trim().toLowerCase());
      navigate(`/bookings/${bookingId}/payment`, { state: { booking, guestEmail: !user ? guestEmail.trim().toLowerCase() : '' } });
    } catch (error) { setState((current) => ({ ...current, submitting: false, error: errText(error, 'Không thể tạo yêu cầu đặt chỗ.'), fields: errorFields(error) })); }
  };

  const itineraryReferenceTotal = itineraryFlights.reduce((sum, item) => sum + Number(item.fare?.price || 0), 0) * passengers.length;

  return <BookingShell><PageHeading title="Tạo đặt chỗ" description="Chọn chuyến bay và hạng vé, sau đó nhập thông tin hành khách." actions={<Link className="button button-outline" to="/bookings/lookup">Đã có mã đặt chỗ?</Link>} />
    {state.error ? <Notice type="error">{state.error}</Notice> : null}
    {lastWarning ? <Notice type="warning">{lastWarning.message || `Chỉ còn ${lastWarning.availableSeats} ghế!`} <button type="button" style={{ marginLeft: 8, fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={clearWarning}>Bỏ qua</button></Notice> : null}
    <div className="booking-steps" aria-label="Các bước đặt vé"><span className={state.stage === 'flight' ? 'is-current' : 'is-done'}>1 <b>Chuyến bay</b></span><span className={state.stage === 'fare' ? 'is-current' : state.stage === 'passenger' ? 'is-done' : ''}>2 <b>Hạng vé</b></span><span className={state.stage === 'passenger' ? 'is-current' : ''}>3 <b>Hành khách</b></span></div>
    <section className="surface-card booking-panel">
      {state.loadingFares && requestedItinerary.length > 1 ? <LoadingView label="Đang xác minh các chuyến bay và hạng vé đã chọn…" /> : null}
      {state.stage === 'flight' && !expectsItinerary ? <>
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
          <div className="booking-section-heading"><div><h2 id="passenger-form-title">Thông tin hành khách</h2><p>{itineraryFlights.length > 1 ? `${itineraryFlights.length} chặng · ${passengers.length} hành khách` : `${flightCarrier(flight)} · ${fare?.class_name} · ${passengers.length} hành khách`}</p></div>{itineraryFlights.length > 1 ? <span className="eyebrow">HẠNG VÉ ĐÃ CHỌN CHO TỪNG CHẶNG</span> : <button className="button button-outline" type="button" onClick={() => setState((current) => ({ ...current, stage: 'fare' }))}>Đổi hạng vé</button>}</div>
          <form className="booking-passenger-form" onSubmit={submit} noValidate>
            {!user ? <Field id="booking-guest-email" label="Email liên hệ" type="email" autoComplete="email" required value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} error={formErrors.guest_email} hint="Dùng email này cùng mã đặt chỗ để tra cứu đặt chỗ của bạn." /> : null}
            <div className="booking-promotion-entry">
              <Field id="booking-promotion-code" label="Mã khuyến mại (không bắt buộc)" autoComplete="off" maxLength={30} value={promotionCode} onChange={(event) => { setPromotionCode(event.target.value); setPromotionState({ checking: false, validCode: '', error: '' }); }} hint="Mã sẽ được hệ thống kiểm tra lại khi tạo đặt chỗ." />
              <button className="button button-outline" type="button" disabled={promotionState.checking || !promotionCode.trim()} onClick={() => void validatePromotion()}>{promotionState.checking ? 'Đang kiểm tra…' : 'Kiểm tra mã'}</button>
              {promotionState.error ? <p className="booking-promotion-message is-error" role="alert">{promotionState.error}</p> : null}
              {promotionState.validCode ? <p className="booking-promotion-message" role="status">Mã {promotionState.validCode} hợp lệ. Giá cuối cùng do hệ thống tính khi tạo đặt chỗ.</p> : null}
            </div>
            {((itineraryFlights.length > 1 ? itineraryFlights : [{ flight, fare }]).some((_leg, index) => seatMaps[index + 1]?.supported)) ? <section className="seat-selection-picker" aria-label="Chọn ghế theo hành khách và chặng">
              <h3>Chọn ghế (không bắt buộc)</h3><p>Ghế được giữ cùng đặt chỗ trong thời gian thanh toán. Giá vé không thay đổi.</p>
              <div className="seat-legend" aria-hidden="true">
                <span className="seat-legend-item"><span className="seat-legend-sample available" /> Ghế trống</span>
                <span className="seat-legend-item"><span className="seat-legend-sample selected" /> Đang chọn</span>
                <span className="seat-legend-item"><span className="seat-legend-sample occupied" /> Đã giữ / không bán</span>
              </div>
              {passengers.length > 1 ? <div className="seat-passenger-tabs" role="group" aria-label="Hành khách">{passengers.map((_passenger, index) => <button type="button" key={index} aria-pressed={activeSeatPassenger === index} onClick={() => setActiveSeatPassenger(index)}>Hành khách {index + 1}</button>)}</div> : null}
              {(itineraryFlights.length > 1 ? itineraryFlights : [{ flight, fare }]).map((leg, index) => {
                const legOrder = index + 1; const map = seatMaps[legOrder];
                if (!map?.supported) return null;
                const fareId = Number(leg.fare?.id || fare?.id);
                const selected = seatSelections.find((item) => item.leg_order === legOrder && item.passenger_index === activeSeatPassenger)?.seat_no;
                const aisles = map.aisle_after || [];
                return <fieldset className="seat-leg-picker" key={leg.flight.id}><legend>Chặng {legOrder}: {airportsOf(leg.flight)}</legend><div className="seat-grid" style={{ '--seat-columns': map.column_count + aisles.length }}>
                  {map.seats.map((seat) => { const eligible = Number(seat.fare_class_id) === fareId; const disabled = seat.status !== 'available' || !eligible; const displayColumn = seat.column_number + aisles.filter((after) => after < seat.column_number).length; return <button key={seat.seat_no} style={{ gridColumn: displayColumn, gridRow: seat.row_number }} type="button" className={`seat-choice ${seat.status} ${selected === seat.seat_no ? 'selected' : ''}`} aria-label={`${seat.seat_no}, ${seat.status === 'available' ? (eligible ? 'trống' : 'không thuộc hạng vé') : 'đã giữ hoặc không bán'}`} aria-pressed={selected === seat.seat_no} disabled={disabled} title={`${seat.seat_no} · ${seat.zone}${seat.special_properties?.length ? ` · ${seat.special_properties.join(', ')}` : ''}`} onClick={() => setSeatSelections((current) => [...current.filter((item) => !(item.leg_order === legOrder && item.passenger_index === activeSeatPassenger)), { leg_order: legOrder, passenger_index: activeSeatPassenger, seat_no: seat.seat_no }])}>{seat.seat_no}</button>; })}
                  {aisles.flatMap((after) => Array.from({ length: map.row_count }, (_, row) => <span key={`aisle-${row + 1}-${after}`} className="seat-aisle" style={{ gridColumn: after + aisles.filter((column) => column < after).length + 1, gridRow: row + 1 }} aria-hidden="true" />))}
                </div><button className="button button-outline seat-clear-button" type="button" disabled={!selected} onClick={() => setSeatSelections((current) => current.filter((item) => !(item.leg_order === legOrder && item.passenger_index === activeSeatPassenger)))}>Bỏ chọn ghế chặng này</button></fieldset>;
              })}
            </section> : null}
            {Object.values(ancillaryOffers).some((offers) => offers.length > 0) ? <section className="seat-selection-picker ancillary-picker" aria-label="Dịch vụ bổ sung theo hành khách và chặng">
              <h3>Dịch vụ bổ sung (không bắt buộc)</h3><p>Giá và điều kiện áp dụng được xác nhận lại trên máy chủ khi tạo đặt chỗ.</p>
              {(itineraryFlights.length > 1 ? itineraryFlights : [{ flight, fare }]).map((leg, legIndex) => {
                const legOrder = legIndex + 1; const offers = ancillaryOffers[legOrder] || [];
                if (!offers.length) return null;
                return <fieldset className="seat-leg-picker" key={leg.flight.id}><legend>Chặng {legOrder}: {airportsOf(leg.flight)}</legend>
                  {passengers.map((_passenger, passengerIndex) => <div className="ancillary-passenger-options" key={passengerIndex}><strong>Hành khách {passengerIndex + 1}</strong>{offers.map((offer) => {
                    const selection = ancillarySelections.find((item) => item.offer_id === Number(offer.id) && item.leg_order === legOrder && item.passenger_index === passengerIndex);
                    const maxQuantity = ancillaryMaxQuantity(offer, ancillarySelections, legOrder, passengerIndex);
                    return <div className="ancillary-choice" key={offer.id}><label className="booking-fare-option"><input type="checkbox" checked={Boolean(selection)} disabled={!selection && maxQuantity < 1} onChange={(event) => setAncillarySelections((current) => event.target.checked ? [...current, { offer_id: Number(offer.id), leg_order: legOrder, passenger_index: passengerIndex, quantity: 1 }] : current.filter((item) => !(item.offer_id === Number(offer.id) && item.leg_order === legOrder && item.passenger_index === passengerIndex)))} /><span><strong>{offer.service?.name || offer.offer_name}</strong><small>{offer.offer_name} · {offer.refund_policy === 'refundable' ? 'Có thể hoàn theo chính sách đặt chỗ' : 'Không hoàn tiền'} · còn {Number(offer.capacity) - Number(offer.reserved_quantity)} suất</small></span><strong>{money(offer.unit_price)}</strong></label>{selection ? <div className="ancillary-quantity"><span>Số lượng {offer.offer_name} cho hành khách {passengerIndex + 1}, chặng {legOrder}</span><button type="button" aria-label={`Giảm số lượng ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${legOrder}`} disabled={selection.quantity <= 1} onClick={() => setAncillarySelections((current) => current.map((item) => item.offer_id === Number(offer.id) && item.leg_order === legOrder && item.passenger_index === passengerIndex ? { ...item, quantity: item.quantity - 1 } : item))}>−</button><output aria-label={`Số lượng đã chọn ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${legOrder}`}>{selection.quantity}</output><button type="button" aria-label={`Tăng số lượng ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${legOrder}`} disabled={selection.quantity >= maxQuantity} onClick={() => setAncillarySelections((current) => current.map((item) => item.offer_id === Number(offer.id) && item.leg_order === legOrder && item.passenger_index === passengerIndex ? { ...item, quantity: item.quantity + 1 } : item))}>+</button></div> : null}</div>;
                  })}</div>)}
                </fieldset>;
              })}
            </section> : null}
            {passengers.map((passenger, index) => <fieldset className="passenger-fieldset" key={index}><legend>Hành khách {index + 1}</legend><Field id={`passenger-name-${index}`} label="Họ tên" autoComplete="name" required value={passenger.passenger_name} onChange={(event) => setPassengers((current) => current.map((item, at) => at === index ? { ...item, passenger_name: event.target.value } : item))} error={formErrors[`passengers.${index}.passenger_name`]} /><Field id={`passenger-passport-${index}`} label="Số hộ chiếu (không bắt buộc)" value={passenger.passport_no} onChange={(event) => setPassengers((current) => current.map((item, at) => at === index ? { ...item, passport_no: event.target.value } : item))} error={formErrors[`passengers.${index}.passport_no`]} /></fieldset>)}
            {state.fields ? Object.entries(state.fields).map(([field, message]) => <small className="field-error" key={field}>{message}</small>) : null}
            <div className="booking-total-row"><span>Giá tham khảo trước ưu đãi</span><strong className="table-mono-cell">{money(itineraryFlights.length > 1 ? itineraryReferenceTotal : Number(fare?.price || 0) * passengers.length)}</strong><small>{promotionState.validCode ? 'Mã đã được kiểm tra; hệ thống sẽ tính và xác nhận tổng tiền khi tạo đặt chỗ.' : 'Giá cuối cùng và ưu đãi (nếu có) do hệ thống xác nhận khi tạo đặt chỗ.'}</small></div>
            <button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang tạo đặt chỗ…' : 'Tạo đặt chỗ và tiếp tục thanh toán'}</button>
          </form>
        </section>
        <aside className="booking-passenger-summary" aria-label="Tóm tắt hành trình">
          <span className="eyebrow">TÓM TẮT HÀNH TRÌNH</span>
          <h3>{itineraryFlights.length > 1 ? 'Các chặng đã chọn' : 'Chuyến bay đã chọn'}</h3>
          {itineraryFlights.length > 1 ? <ol className="booking-itinerary-summary">{itineraryFlights.map((item, index) => <li key={`${item.flight.id}-${index}`}><div><strong>Chặng {index + 1}: {airportsOf(item.flight)}</strong><span>{dateTime(item.flight.departure_time)}</span><small>{flightCarrier(item.flight)} · {item.fare.class_name}</small></div><b className="table-mono-cell">{money(Number(item.fare.price) * passengers.length)}</b></li>)}</ol> : <><div className="passenger-route-summary"><strong className="table-mono-cell">{flight?.departureAirport?.iata_code || flight?.departure_airport?.iata_code || '—'}</strong><span aria-hidden="true">→</span><strong className="table-mono-cell">{flight?.arrivalAirport?.iata_code || flight?.arrival_airport?.iata_code || '—'}</strong></div><p className="passenger-airline-summary">{flightCarrier(flight)}</p><dl><div><dt>Khởi hành</dt><dd>{dateTime(flight?.departure_time)}</dd></div><div><dt>Hạng vé</dt><dd>{fare?.class_name || '—'}</dd></div></dl></>}
          <dl><div><dt>Số hành khách</dt><dd className="table-mono-cell">{passengers.length}</dd></div><div><dt>Giá tham khảo</dt><dd><strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>{money(itineraryFlights.length > 1 ? itineraryReferenceTotal : Number(fare?.price || 0) * passengers.length)}</strong></dd></div></dl>
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

function HoldRemainingTimer({ expiresAt, serverNow }) {
  const [localNow, setLocalNow] = useState(() => Date.now() + (getServerTimeOffset() || 0));

  useEffect(() => {
    if (serverNow != null || !expiresAt) return undefined;
    const interval = setInterval(() => {
      setLocalNow(Date.now() + (getServerTimeOffset() || 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, serverNow]);

  if (!expiresAt) return null;
  const now = serverNow ?? localNow;
  const targetMs = new Date(expiresAt).getTime();
  const diffMs = targetMs - now;

  if (diffMs <= 0) {
    return <span className="hold-remaining-badge is-expired">Hết hạn</span>;
  }

  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  const formatted = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="hold-remaining-badge" title={`Hạn giữ chỗ: ${dateTime(expiresAt)}`}>
      <span className="hold-clock-icon" aria-hidden="true">⏱</span>
      <span className="table-mono-cell tabular-nums">Còn {formatted}</span>
    </span>
  );
}

function BookingCard({ booking, to, guestEmail, serverNow }) {
  const flight = booking.flight || {};
  return (
    <article className="booking-card">
      <div className="booking-card-top">
        <div>
          <span className="eyebrow">MÃ ĐẶT CHỖ</span>
          <h2 className="table-mono-cell">{booking.booking_code || `#${booking.id}`}</h2>
        </div>
        <div className="booking-status-cell">
          <StatusBadge status={booking.status} />
          {booking.status === 'holding' && booking.hold_expires_at ? (
            <HoldRemainingTimer expiresAt={booking.hold_expires_at} serverNow={serverNow} />
          ) : null}
        </div>
      </div>
      <p className="booking-card-route">
        <strong>{airportsOf(flight)}</strong>
        <span className="table-mono-cell">{dateTime(flight.departure_time)}</span>
      </p>
      <div className="booking-card-bottom">
        <strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>{money(booking.total_amount)}</strong>
        {to ? <Link className="button button-outline" to={to} state={{ guestEmail }}>Chi tiết</Link> : null}
      </div>
    </article>
  );
}

export function MyBookingsPage() {
  const api = useBookingsApi();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || 10);
  const status = params.get('status') || '';
  const search = params.get('search') || '';
  const tab = params.get('tab') || '';
  const activeTab = tab || (status ? 'all' : 'upcoming');

  const [draftSearch, setDraftSearch] = useState(search);
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const [serverNow, setServerNow] = useState(() => Date.now() + (getServerTimeOffset() || 0));

  useEffect(() => {
    const timer = setInterval(() => {
      setServerNow(Date.now() + (getServerTimeOffset() || 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.myBookings({ page, limit, status, search });
      setState({
        loading: false,
        rows: rowsOf(result),
        pagination: pageOf(result, page, limit),
        error: '',
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: errText(error, 'Không thể tải đặt chỗ.'),
      }));
    }
  }, [api, page, limit, status, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setDraftSearch(search); }, [search]);

  const update = (values) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    return next;
  });

  // Phân loại danh sách đặt chỗ theo tab
  const displayedRows = useMemo(() => {
    // Nếu có status trên URL (từ select hoặc test assertion), ưu tiên bộ lọc status
    if (status) return state.rows;
    if (activeTab === 'all') return state.rows;

    return state.rows.filter((b) => {
      const depTime = b.flight?.departure_time ? new Date(b.flight.departure_time).getTime() : null;
      if (activeTab === 'upcoming') {
        // Sắp bay: đang giữ chỗ, chờ thanh toán, hoặc đã xác nhận chuyến tương lai (hoặc chưa rõ giờ bay)
        if (['holding', 'pending_payment'].includes(b.status)) return true;
        if (b.status === 'confirmed') {
          return depTime === null || depTime >= serverNow;
        }
        return false;
      }
      if (activeTab === 'past') {
        // Đã bay: đơn confirmed đã qua thời gian khởi hành
        return b.status === 'confirmed' && depTime !== null && depTime < serverNow;
      }
      if (activeTab === 'cancelled_expired') {
        // Đã hủy hoặc hết hạn
        return ['cancelled', 'expired'].includes(b.status);
      }
      return true;
    });
  }, [state.rows, status, activeTab, serverNow]);

  return (
    <BookingShell>
      <PageHeading
        eyebrow="VÉ CỦA TÔI"
        title="Đặt chỗ của tôi"
        description="Theo dõi trạng thái và thông tin các đặt chỗ của bạn."
        actions={<Link className="button button-primary" to="/bookings/new">Đặt vé</Link>}
      />

      {/* Tách 3 tab: Sắp bay / Đã bay / Đã hủy hoặc hết hạn */}
      <div className="booking-status-chips booking-tabs" role="tablist" aria-label="Phân loại đặt chỗ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upcoming'}
          className={`booking-status-chip ${activeTab === 'upcoming' ? 'is-active' : ''}`}
          onClick={() => update({ tab: 'upcoming', status: '', page: 1 })}
        >
          Sắp bay
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'past'}
          className={`booking-status-chip ${activeTab === 'past' ? 'is-active' : ''}`}
          onClick={() => update({ tab: 'past', status: '', page: 1 })}
        >
          Đã bay
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cancelled_expired'}
          className={`booking-status-chip ${activeTab === 'cancelled_expired' ? 'is-active' : ''}`}
          onClick={() => update({ tab: 'cancelled_expired', status: '', page: 1 })}
        >
          Đã hủy hoặc hết hạn
        </button>
        {status ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`booking-status-chip ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => update({ tab: 'all', page: 1 })}
          >
            Lọc theo: {statusLabel(status)}
          </button>
        ) : null}
      </div>

      {state.loading ? (
        <LoadingView label="Đang tải đặt chỗ…" />
      ) : state.error ? (
        <Notice type="error">{state.error}</Notice>
      ) : (
        <section className="surface-card booking-panel">
          <div className="booking-list-toolbar">
            <form
              className="booking-admin-filter"
              onSubmit={(event) => {
                event.preventDefault();
                update({ search: draftSearch.trim(), page: 1 });
              }}
            >
              <Field
                id="my-booking-search"
                label="Tìm mã đặt chỗ"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
              />
              <button className="button button-secondary" type="submit">Tìm</button>
            </form>
            <label className="field">
              <span>Lọc trạng thái</span>
              <select
                aria-label="Lọc trạng thái"
                value={status}
                onChange={(event) => update({ status: event.target.value, page: 1 })}
              >
                <option value="">Tất cả trạng thái</option>
                {bookingStatuses.map((item) => (
                  <option key={item} value={item}>{statusLabel(item)}</option>
                ))}
              </select>
            </label>
            <span className="table-mono-cell">{state.pagination?.total ?? state.rows.length} đặt chỗ</span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <small className="booking-pagination-note" style={{ color: 'var(--color-muted, #64748b)', fontSize: '0.85rem' }}>
              Hiển thị theo phân trang máy chủ (tối đa {limit} đơn/trang) · Tổng {state.pagination?.total ?? state.rows.length} đơn trên hệ thống.
              {!status && activeTab !== 'all' ? (
                <span> (Phân loại theo tab “{activeTab === 'upcoming' ? 'Sắp bay' : activeTab === 'past' ? 'Đã bay' : 'Đã hủy hoặc hết hạn'}” được lọc trên {state.rows.length} đơn của trang hiện tại; để lọc toàn bộ hệ thống, vui lòng chọn menu “Lọc trạng thái”).</span>
              ) : null}
            </small>
          </div>

          {displayedRows.length ? (
            <div className="booking-card-list">
              {displayedRows.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  to={`/bookings/${booking.id}`}
                  serverNow={serverNow}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>{search ? 'Không tìm thấy đặt chỗ phù hợp' : 'Chưa có đặt chỗ trong mục này'}</h2>
              <p>
                {search
                  ? 'Hãy kiểm tra mã đặt chỗ hoặc thử bộ lọc khác.'
                  : activeTab === 'upcoming'
                  ? 'Bạn không có chuyến bay sắp khởi hành nào.'
                  : activeTab === 'past'
                  ? 'Bạn chưa có chuyến bay nào đã hoàn thành.'
                  : activeTab === 'cancelled_expired'
                  ? 'Không có đơn đặt chỗ nào bị hủy hoặc hết hạn.'
                  : 'Khi tạo đặt chỗ, thông tin sẽ xuất hiện tại đây.'}
              </p>
              <Link className="button button-primary" to="/bookings/new">Tìm chuyến bay</Link>
            </div>
          )}
          <Pagination
            page={Number(state.pagination?.page || page)}
            totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))}
            onPageChange={(next) => update({ page: next })}
          />
        </section>
      )}
    </BookingShell>
  );
}

export function AdminBookingsPage() {
  const api = useBookingsApi();
  const { user } = useAuth();
  const canViewDetails = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.max(1, Number(params.get('limit')) || 10); const status = params.get('status') || ''; const search = params.get('search') || ''; const bookingCode = params.get('booking_code') || ''; const customer = params.get('customer') || ''; const flightId = params.get('flight_id') || '';
  const [draftFilters, setDraftFilters] = useState({ bookingCode, customer, flightId }); const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const [serverNow, setServerNow] = useState(() => Date.now() + (getServerTimeOffset() || 0));

  useEffect(() => {
    const timer = setInterval(() => {
      setServerNow(Date.now() + (getServerTimeOffset() || 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => { setState((current) => ({ ...current, loading: true, error: '' })); try { const result = await api.adminBookings({ page, limit, status, search, booking_code: bookingCode, customer, flight_id: flightId }); setState({ loading: false, rows: rowsOf(result), pagination: pageOf(result, page, limit), error: '' }); } catch (error) { setState((current) => ({ ...current, loading: false, error: errText(error, 'Không thể tải danh sách đặt chỗ.') })); } }, [api, page, limit, status, search, bookingCode, customer, flightId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setDraftFilters({ bookingCode, customer, flightId }); }, [bookingCode, customer, flightId]);
  const update = (values) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); return next; });
  const submitSearch = (event) => { event.preventDefault(); update({ booking_code: draftFilters.bookingCode.trim(), customer: draftFilters.customer.trim(), flight_id: draftFilters.flightId.trim(), page: 1 }); };
  return (
    <BookingShell admin>
      <PageHeading eyebrow="VẬN HÀNH" title="Quản lý đặt chỗ" description="Tìm kiếm và theo dõi hành trình, khách hàng, thanh toán và hoàn tiền." />
      {state.loading ? <LoadingView label="Đang tải danh sách…" /> : state.error ? <Notice type="error">{state.error}</Notice> : (
        <section className="surface-card booking-panel">
          {/* Chip lọc nhanh trạng thái */}
          <div className="booking-status-chips" role="group" aria-label="Lọc nhanh trạng thái">
            <button
              type="button"
              className={`booking-status-chip ${!status ? 'is-active' : ''}`}
              onClick={() => update({ status: '', page: 1 })}
            >
              Tất cả
            </button>
            {bookingStatuses.map((item) => (
              <button
                key={item}
                type="button"
                className={`booking-status-chip chip-${item} ${status === item ? 'is-active' : ''}`}
                onClick={() => update({ status: item, page: 1 })}
              >
                {statusLabel(item)}
              </button>
            ))}
          </div>

          <div className="booking-list-toolbar">
            <form className="booking-admin-filter" onSubmit={submitSearch}>
              <Field id="booking-admin-code" label="Mã đặt chỗ" value={draftFilters.bookingCode} onChange={(event) => setDraftFilters((current) => ({ ...current, bookingCode: event.target.value }))} />
              <Field id="booking-admin-customer" label="Khách hàng" value={draftFilters.customer} onChange={(event) => setDraftFilters((current) => ({ ...current, customer: event.target.value }))} />
              <Field id="booking-admin-flight" label="ID chuyến bay" type="number" min="1" value={draftFilters.flightId} onChange={(event) => setDraftFilters((current) => ({ ...current, flightId: event.target.value }))} />
              <button className="button button-secondary" type="submit">Tìm</button>
            </form>
            <label className="field">
              <span>Trạng thái</span>
              <select aria-label="Trạng thái đặt chỗ" value={status} onChange={(event) => update({ status: event.target.value, page: 1 })}>
                <option value="">Tất cả</option>
                {bookingStatuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
              </select>
            </label>
          </div>

          {state.rows.length ? (
            <>
              <div className="table-wrap booking-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Khách</th>
                      <th>Chuyến bay</th>
                      <th>Tạo lúc</th>
                      <th>Tổng tiền</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((booking) => (
                      <tr key={booking.id}>
                        <td className="table-mono-cell">{booking.booking_code}</td>
                        <td>{booking.user?.full_name || booking.guest_email || booking.user?.email || '—'}</td>
                        <td>{airportsOf(booking.flight)}</td>
                        <td className="table-mono-cell">{dateTime(booking.created_at)}</td>
                        <td className="table-mono-cell">{money(booking.total_amount)}</td>
                        <td>
                          <div className="booking-status-cell">
                            <StatusBadge status={booking.status} />
                            {booking.status === 'holding' && booking.hold_expires_at ? (
                              <HoldRemainingTimer expiresAt={booking.hold_expires_at} serverNow={serverNow} />
                            ) : null}
                          </div>
                        </td>
                        <td>{canViewDetails ? <Link to={`/admin/bookings/${booking.id}`}>Chi tiết</Link> : <span aria-label="Không có quyền xem chi tiết">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="booking-admin-cards">
                {state.rows.map((booking) => <BookingCard key={booking.id} booking={booking} serverNow={serverNow} to={canViewDetails ? `/admin/bookings/${booking.id}` : null} />)}
              </div>
              <Pagination page={Number(state.pagination?.page || page)} totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))} onPageChange={(next) => update({ page: next })} />
            </>
          ) : (
            <div className="empty-state">
              <h2>Không có kết quả</h2>
              <p>Thử mã đặt chỗ, khách hàng, chuyến bay hoặc trạng thái khác.</p>
            </div>
          )}
        </section>
      )}
    </BookingShell>
  );
}

export function BookingDetailPage({ admin = false }) {
  const api = useBookingsApi(); const { id } = useParams(); const location = useLocation(); const { user, status } = useAuth();
  const guestEmail = location.state?.guestEmail || sessionStorage.getItem(emailKey(id)) || '';
  const [state, setState] = useState({ loading: true, booking: null, error: '', actionError: '', pending: false }); const [confirmCancel, setConfirmCancel] = useState(false);
  const [ancillaryOptions, setAncillaryOptions] = useState({}); const [draftAncillarySelections, setDraftAncillarySelections] = useState([]); const [savingAncillaries, setSavingAncillaries] = useState(false);
  const load = useCallback(async () => { if (status === 'loading') return; setState((current) => ({ ...current, loading: true, error: '' })); try { const booking = await api.bookingDetail(id, user ? undefined : guestEmail); setState((current) => ({ ...current, loading: false, booking, error: '' })); } catch (error) { setState((current) => ({ ...current, loading: false, error: errText(error, 'Không thể tải đặt chỗ.') })); } }, [api, id, guestEmail, status, user]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const current = state.booking;
    if (!current || current.status !== 'holding') return undefined;
    let active = true;
    const legs = [{ leg_order: 1, flight_id: current.flight_id, fare_class_id: current.fare_class_id }, ...(current.itinerarySegments || []).filter((item) => Number(item.leg_order) > 1).map((item) => ({ leg_order: Number(item.leg_order), flight_id: item.flight_id, fare_class_id: item.fare_class_id }))];
    Promise.all(legs.map(async (leg) => {
      try { return [leg.leg_order, rowsOf(await api.ancillaryOffers(leg.flight_id, leg.fare_class_id))]; }
      catch { return [leg.leg_order, []]; }
    })).then((entries) => { if (active) { setAncillaryOptions(Object.fromEntries(entries)); setDraftAncillarySelections((currentSelections) => currentSelections.length ? currentSelections : (current.ancillaries || []).filter((line) => line.offer_id && line.status === 'held').map((line) => ({ offer_id: Number(line.offer_id), passenger_index: (current.passengers || []).findIndex((passenger) => Number(passenger.id) === Number(line.passenger_id)), leg_order: Number(line.segment?.leg_order || 1), quantity: Number(line.quantity) }))); } });
    return () => { active = false; };
  }, [api, state.booking]);
  const cancel = async () => { setState((current) => ({ ...current, pending: true, actionError: '' })); try { await api.cancelBooking(id, user ? undefined : guestEmail); setConfirmCancel(false); await load(); setState((current) => ({ ...current, pending: false })); } catch (error) { setState((current) => ({ ...current, pending: false, actionError: errText(error, 'Không thể hủy đặt chỗ.') })); } };
  const saveAncillaries = async () => { setSavingAncillaries(true); setState((current) => ({ ...current, actionError: '' })); try { await api.replaceAncillaries(id, draftAncillarySelections, user ? undefined : guestEmail); setDraftAncillarySelections([]); await load(); } catch (error) { setState((current) => ({ ...current, actionError: errText(error, 'Không thể cập nhật dịch vụ bổ sung.') })); } finally { setSavingAncillaries(false); } };
  const download = async () => { setState((current) => ({ ...current, pending: true, actionError: '' })); try { const blob = await api.downloadTicket(id, user ? undefined : guestEmail); if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Máy chủ không trả về tệp vé hợp lệ.'); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ticket_${id}.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); } catch (error) { setState((current) => ({ ...current, actionError: errText(error, 'Không thể tải vé điện tử.') })); } finally { setState((current) => ({ ...current, pending: false })); } };
  if (state.loading || status === 'loading') return <BookingShell admin={admin}><LoadingView label="Đang tải chi tiết đặt chỗ…" /></BookingShell>;
  if (state.error || !state.booking) return <BookingShell admin={admin}><PageHeading title="Không tải được đặt chỗ" /><section className="surface-card booking-panel"><Notice type="error">{state.error || 'Không tìm thấy đặt chỗ.'}</Notice><Link className="button button-outline" to={admin ? '/admin/bookings' : user ? '/bookings/my' : '/bookings/lookup'}>Quay lại</Link></section></BookingShell>;
  const booking = state.booking; const flight = booking.flight || {}; const passengers = passengerList(booking); const isAdmin = user?.role === 'admin';
  const additionalSegments = (booking.itinerarySegments || []).filter((segment) => Number(segment.leg_order) > 1);
  const itineraryLegs = [{ id: `primary-${booking.id}`, leg_order: 1, flight, fareClass: booking.fareClass || booking.fare_class }, ...additionalSegments];
  return <BookingShell admin={admin}><PageHeading eyebrow="CHI TIẾT ĐẶT CHỖ" title={booking.booking_code || `Đặt chỗ #${booking.id}`} description={`${flightCarrier(flight)} · ${airportsOf(flight)}`} actions={<Link className="button button-outline" to={admin ? '/admin/bookings' : user ? '/bookings/my' : '/bookings/lookup'}>Danh sách đặt chỗ</Link>} />
    {state.actionError ? <Notice type="error">{state.actionError}</Notice> : null}
    {booking.status === 'confirmed' ? (
      <BoardingPassCard
        booking={booking}
        onDownloadPdf={() => void download()}
        downloadingPdf={state.pending}
      />
    ) : null}
    <div className="booking-detail-grid"><section className="surface-card booking-panel"><div className="booking-detail-title"><h2>Hành trình</h2><StatusBadge status={booking.status} /></div><dl className="booking-facts"><div><dt>Tạo lúc</dt><dd className="table-mono-cell">{dateTime(booking.created_at)}</dd></div><div><dt>Giữ chỗ đến</dt><dd className="table-mono-cell">{dateTime(booking.hold_expires_at)}</dd></div><div><dt>Tổng tiền</dt><dd><strong className="table-mono-cell" style={{ color: 'var(--color-accent)' }}>{money(booking.total_amount)}</strong></dd></div></dl><ol className="booking-itinerary-summary" aria-label="Chi tiết các chặng">{itineraryLegs.map((segment) => <li key={segment.id}><div><strong>Chặng {segment.leg_order}: {airportsOf(segment.flight)}</strong><span className="table-mono-cell">{dateTime(segment.flight?.departure_time)} — {dateTime(segment.flight?.arrival_time)}</span><small>{flightCarrier(segment.flight)} · {segment.fareClass?.class_name || segment.fare_class?.class_name || 'Hạng vé'}</small>{booking.seatAssignments?.filter((seat) => Number(seat.leg_order) === Number(segment.leg_order)).length ? <small>{passengers.map((passenger) => { const assignment = booking.seatAssignments.find((seat) => Number(seat.leg_order) === Number(segment.leg_order) && Number(seat.booking_passenger_id) === Number(passenger.id)); return assignment ? `${passenger.passenger_name}: ghế ${assignment.seat_no}` : null; }).filter(Boolean).join(' · ')}</small> : null}</div></li>)}</ol><h3>Hành khách</h3><div className="passenger-summary">{passengers.map((item, index) => <div key={item.id || index}><strong>{item.passenger_name}</strong><span className="table-mono-cell">{item.passport_no || 'Không cung cấp số hộ chiếu'}</span></div>)}</div>
      <div className="booking-actions">{booking.status === 'holding' ? <Link className="button button-primary" to={`/bookings/${id}/payment`} state={{ booking, guestEmail }}>Tiếp tục thanh toán</Link> : null}{booking.status === 'confirmed' ? <button className="button button-secondary" type="button" disabled={state.pending} onClick={() => void download()}>{state.pending ? 'Đang chuẩn bị tệp…' : 'Tải vé PDF'}</button> : null}{booking.status === 'holding' && !admin ? <button className="button button-danger" type="button" onClick={() => setConfirmCancel(true)}>Hủy đặt chỗ</button> : null}{admin && isAdmin && booking.status === 'confirmed' ? <Link className="button button-outline" to={`/admin/payments?booking_id=${booking.id}`}>Xem thanh toán</Link> : null}</div>
      {booking.ancillaries?.length ? <section className="surface-card booking-panel booking-ancillary-summary"><h2>Dịch vụ bổ sung</h2><ul>{booking.ancillaries.map((line) => <li key={line.id}><span><strong>{line.service_name_snapshot} — {line.offer_name_snapshot}</strong><small>{line.passenger?.passenger_name || 'Hành khách'} · Chặng {line.segment?.leg_order || '—'} · × {line.quantity} · {line.refund_policy_snapshot === 'refundable' ? 'Theo chính sách hoàn vé' : 'Không hoàn tiền'}</small></span><strong className="table-mono-cell">{money(line.line_total_snapshot)}</strong></li>)}</ul></section> : null}
      {booking.status === 'holding' && !admin && !paymentsList(booking).length && Object.values(ancillaryOptions).some((items) => items.length) ? <section className="surface-card booking-panel booking-ancillary-summary"><h2>Chỉnh dịch vụ bổ sung</h2><p>Dịch vụ chỉ có thể thay đổi trước khi tạo bất kỳ ý định thanh toán nào. Giá được tính lại trên máy chủ.</p>{(booking.passengers || []).map((passenger, passengerIndex) => <fieldset className="passenger-fieldset" key={passenger.id}><legend>{passenger.passenger_name}</legend>{[{ leg_order: 1, label: airportsOf(booking.flight) }, ...(booking.itinerarySegments || []).filter((item) => Number(item.leg_order) > 1).map((item) => ({ leg_order: Number(item.leg_order), label: airportsOf(item.flight) }))].map((leg) => <div key={leg.leg_order}><strong>Chặng {leg.leg_order}: {leg.label}</strong>{(ancillaryOptions[leg.leg_order] || []).map((offer) => { const selected = draftAncillarySelections.find((item) => item.offer_id === Number(offer.id) && item.passenger_index === passengerIndex && item.leg_order === leg.leg_order); const ownedQuantity = (booking.ancillaries || []).filter((line) => Number(line.offer_id) === Number(offer.id) && line.status === 'held').reduce((sum, line) => sum + Number(line.quantity), 0); const maxQuantity = ancillaryMaxQuantity(offer, draftAncillarySelections, leg.leg_order, passengerIndex, ownedQuantity); return <div className="ancillary-choice" key={offer.id}><label className="booking-fare-option"><input type="checkbox" checked={Boolean(selected)} disabled={!selected && maxQuantity < 1} onChange={(event) => setDraftAncillarySelections((current) => event.target.checked ? [...current, { offer_id: Number(offer.id), passenger_index: passengerIndex, leg_order: leg.leg_order, quantity: 1 }] : current.filter((item) => !(item.offer_id === Number(offer.id) && item.passenger_index === passengerIndex && item.leg_order === leg.leg_order)))} /><span><strong>{offer.service?.name || offer.offer_name}</strong><small>{offer.offer_name} · {offer.refund_policy === 'refundable' ? 'Theo chính sách hoàn' : 'Không hoàn tiền'} · còn {Number(offer.capacity) - Number(offer.reserved_quantity)}</small></span><b className="table-mono-cell">{money(offer.unit_price)}</b></label>{selected ? <div className="ancillary-quantity"><span>Số lượng {offer.offer_name} cho hành khách {passengerIndex + 1}, chặng {leg.leg_order}</span><button type="button" aria-label={`Giảm số lượng ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${leg.leg_order}`} disabled={selected.quantity <= 1} onClick={() => setDraftAncillarySelections((current) => current.map((item) => item.offer_id === Number(offer.id) && item.leg_order === leg.leg_order && item.passenger_index === passengerIndex ? { ...item, quantity: item.quantity - 1 } : item))}>−</button><output aria-label={`Số lượng đã chọn ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${leg.leg_order}`}>{selected.quantity}</output><button type="button" aria-label={`Tăng số lượng ${offer.offer_name} cho hành khách ${passengerIndex + 1}, chặng ${leg.leg_order}`} disabled={selected.quantity >= maxQuantity} onClick={() => setDraftAncillarySelections((current) => current.map((item) => item.offer_id === Number(offer.id) && item.leg_order === leg.leg_order && item.passenger_index === passengerIndex ? { ...item, quantity: item.quantity + 1 } : item))}>+</button></div> : null}</div>; })}</div>)}</fieldset>)}<button className="button button-secondary" type="button" disabled={savingAncillaries} onClick={() => void saveAncillaries()}>{savingAncillaries ? 'Đang cập nhật…' : 'Lưu dịch vụ bổ sung'}</button></section> : null}
    </section>
    {admin ? (
      <aside className="surface-card booking-panel booking-admin-sidebar">
        <h2>Thông tin khách hàng</h2>
        <p><strong>{booking.user?.full_name || 'Khách vãng lai'}</strong></p>
        <p className="table-mono-cell">{booking.user?.email || booking.guest_email || '—'}</p>
        
        <div className="booking-timeline-header">
          <h3>Lịch sử trạng thái</h3>
          {booking.statusHistory?.length ? <span className="timeline-count">({booking.statusHistory.length} mốc)</span> : null}
        </div>
        
        {booking.statusHistory?.length ? (
          <ol className="booking-status-history timeline-flow">
            {booking.statusHistory.map((event) => (
              <li key={event.id} className={`timeline-step to-${event.to_status}`}>
                <div className="timeline-marker" aria-hidden="true" />
                <div className="timeline-body">
                  <div className="timeline-status-badge">
                    {event.from_status ? (
                      <>
                        <span className="status-from">{statusLabel(event.from_status)}</span>
                        <span className="timeline-arrow" aria-hidden="true"> → </span>
                      </>
                    ) : null}
                    <span className="status-to">{statusLabel(event.to_status)}</span>
                  </div>
                  <span className="timeline-time table-mono-cell tabular-nums">{dateTime(event.created_at)}</span>
                  <small className="timeline-meta">
                    <span title={event.source} className="timeline-source-label">
                      {getStatusSourceLabel(event.source)}
                    </span>
                    {event.actor?.full_name ? ` · ${event.actor.full_name}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-history-text">Chưa có bản ghi lịch sử trạng thái.</p>
        )}
      </aside>
    ) : null}
  </div>
    <section className="surface-card booking-panel booking-payment-history"><h2>Thanh toán và hoàn tiền</h2>{paymentsList(booking).length ? paymentsList(booking).map((payment) => <div className="booking-payment-line" key={payment.id}><span><strong>{payment.payment_method}</strong><small className="table-mono-cell">{payment.paid_at ? `Thanh toán lúc ${dateTime(payment.paid_at)}` : `Tạo giao dịch ${dateTime(payment.created_at)}`}</small></span><StatusBadge status={payment.status} /><strong className="table-mono-cell">{money(payment.amount)}</strong>{admin && isAdmin ? <Link to={`/admin/payments/${payment.id}`}>Chi tiết</Link> : null}</div>) : <p>Chưa có giao dịch thanh toán.</p>}{admin && isAdmin && booking.status === 'confirmed' ? <p><Link to={`/admin/payments?booking_id=${booking.id}`}>Mở giao dịch để xử lý refund theo quy trình hiện có</Link></p> : null}</section>
    <ConfirmDialog open={confirmCancel} title="Hủy đặt chỗ này?" description="Chỉ đặt chỗ đang được giữ chỗ mới có thể hủy. Ghế và ưu đãi liên quan sẽ được xử lý theo nghiệp vụ của hệ thống." confirmLabel="Xác nhận hủy" danger pending={state.pending} onConfirm={() => void cancel()} onCancel={() => setConfirmCancel(false)} />
  </BookingShell>;
}
