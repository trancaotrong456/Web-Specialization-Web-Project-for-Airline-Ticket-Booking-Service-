import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { LoadingView } from '../../components/LoadingView';
import { getSocket } from '../../lib/socket';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';

const pageSize = 20;
const validId = (value) => /^\d+$/.test(value || '') && Number(value) > 0;
const formatTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
const formatDay = (value) => value ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '';
const formatPrice = (price) => new Intl.NumberFormat('vi-VN').format(price);
const flightStatusLabel = (status) => ({ scheduled: 'Theo lịch', delayed: 'Hoãn chuyến', boarding: 'Đang lên máy bay', departed: 'Đã khởi hành', arrived: 'Đã đến nơi', cancelled: 'Đã hủy', completed: 'Đã hoàn thành' })[status] || 'Thông tin chuyến bay';

function FlightCard({ flight: initialFlight, passengerCount, onSelectFlight }) {
  const [flight, setFlight] = useState(initialFlight);
  const [seatWarning, setSeatWarning] = useState(null);
  const flightId = initialFlight.id;

  useEffect(() => { setFlight(initialFlight); }, [initialFlight]);

  useEffect(() => {
    if (!flightId) return undefined;
    const socket = getSocket();
    const id = Number(flightId);

    const handleSeatsUpdated = (data) => {
      if (data && Number(data.flight_id) === id) {
        setFlight((current) => ({ ...current, available_seats: data.available_seats }));
      }
    };
    const handleFlightUpdated = (data) => {
      if (data && (Number(data.flight_id) === id || Number(data.id) === id)) {
        setFlight((current) => ({ ...current, ...data, id: current.id }));
      }
    };
    const handleSeatWarning = (data) => {
      if (data && (Number(data.flightId) === id || Number(data.flight_id) === id)) {
        setSeatWarning(data);
      }
    };
    const joinRoom = () => socket.emit('join_flight', id);

    socket.on('flight_seats_updated', handleSeatsUpdated);
    socket.on('flight_updated', handleFlightUpdated);
    socket.on('seat-warning', handleSeatWarning);
    socket.on('connect', joinRoom);
    if (socket.connected) { socket.emit('join_flight', id); } else { socket.connect(); }

    return () => {
      socket.emit('leave_flight', id);
      socket.off('flight_seats_updated', handleSeatsUpdated);
      socket.off('flight_updated', handleFlightUpdated);
      socket.off('seat-warning', handleSeatWarning);
      socket.off('connect', joinRoom);
    };
  }, [flightId]);

  const farePrices = Array.isArray(flight.fareClasses)
    ? flight.fareClasses
      .map((fare) => fare.price)
      .filter((price) => price !== null && price !== undefined && price !== '')
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    : [];
  const lowestFare = farePrices[0];
  const from = flight.departureAirport || {};
  const to = flight.arrivalAirport || {};
  const bookable = flight.status === 'scheduled';
  const departureTime = flight.status === 'departed' || flight.status === 'arrived' ? flight.actual_departure_time || flight.departure_time : flight.departure_time;
  const arrivalTime = flight.status === 'arrived' ? flight.actual_arrival_time || flight.arrival_time : flight.arrival_time;
  return (
    <article className="flight-result-card">
      <div className="flight-carrier"><span className="carrier-logo" aria-hidden="true">{flight.airline?.logo_url ? <><img src={flight.airline.logo_url} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /><span className="carrier-mark">✈</span></> : <span className="carrier-mark">✈</span>}</span><div><strong>{flight.airline?.name || 'Hãng hàng không'}</strong><small>{flightStatusLabel(flight.status)}</small></div></div>
      <div className="flight-itinerary">
        <div><time>{formatTime(departureTime)}</time><strong>{from.iata_code || from.city || from.name || '—'}</strong><small>{from.city || from.name || ''}</small></div>
        <div className="flight-duration" aria-hidden="true"><span /><small>Chặng bay</small></div>
        <div><time>{formatTime(arrivalTime)}</time><strong>{to.iata_code || to.city || to.name || '—'}</strong><small>{to.city || to.name || ''}</small></div>
      </div>
      <div className="flight-availability">
        <strong>{flight.available_seats ?? '—'}</strong><span>chỗ còn trống</span>
        {seatWarning ? <span className="seat-warning-tag" role="alert">⚠ {seatWarning.message || `Chỉ còn ${seatWarning.availableSeats} ghế`}</span> : null}
      </div>
      <div className="flight-fare">{lowestFare !== undefined ? <><small>Giá từ</small><strong>{formatPrice(lowestFare)} ₫</strong></> : <span>Chưa có thông tin giá</span>}</div>
      {flight.status_reason ? <p className="flight-status-reason">Lý do cập nhật: {flight.status_reason}</p> : null}
      {onSelectFlight
        ? <button className="button button-primary flight-book-link" type="button" disabled={!bookable} onClick={() => onSelectFlight(flight)}>{bookable ? 'Chọn chuyến bay' : 'Không thể đặt chuyến này'}</button>
        : bookable ? <Link className="button button-primary flight-book-link" to={`/bookings/new?flight_id=${encodeURIComponent(flight.id)}&passengers=${encodeURIComponent(passengerCount)}`}>Chọn chuyến bay</Link> : <button className="button button-secondary flight-book-link" type="button" disabled>{flight.status === 'cancelled' ? 'Chuyến bay đã hủy' : 'Không còn nhận đặt chỗ'}</button>}
    </article>
  );
}

export function TripFlightResults({ api, tripType, legs, passengerCount, airlineId }) {
  const navigate = useNavigate();
  const [legIndex, setLegIndex] = useState(0);
  const [selectedLegs, setSelectedLegs] = useState([]);
  const [chosenFlights, setChosenFlights] = useState([]);
  const [result, setResult] = useState({ data: [] });
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [fares, setFares] = useState([]);
  const [selectedFare, setSelectedFare] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingFares, setLoadingFares] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [selectionError, setSelectionError] = useState('');
  const searchRequest = useRef(0);
  const fareRequest = useRef(0);
  const leg = legs[legIndex];
  const validLegs = ['round_trip', 'multi_city'].includes(tripType)
    && legs.length >= 2 && legs.length <= 4
    && legs.every((item) => validId(item.departure_airport_id) && validId(item.arrival_airport_id)
      && item.departure_airport_id !== item.arrival_airport_id && /^\d{4}-\d{2}-\d{2}$/.test(item.departure_date))
    && legs.every((item, index) => index === 0 || item.departure_date >= legs[index - 1].departure_date)
    && (tripType !== 'round_trip' || (legs.length === 2
      && legs[0].departure_airport_id === legs[1].arrival_airport_id
      && legs[0].arrival_airport_id === legs[1].departure_airport_id))
    && (tripType !== 'multi_city' || legs.every((item, index) => index === 0
      || item.departure_airport_id === legs[index - 1].arrival_airport_id));

  const load = useCallback(async () => {
    const requestId = ++searchRequest.current;
    if (!validLegs || !leg) return;
    setLoading(true); setError(''); setResult({ data: [] }); setSelectedFlight(null); setSelectedFare(null); setFares([]); setSelectionError('');
    try {
      const response = await api.searchFlights({
        ...leg, min_seats: passengerCount, airline_id: airlineId, page, limit: pageSize,
      });
      if (requestId !== searchRequest.current) return;
      setResult({ data: response?.data || [], pagination: response?.pagination || null });
    } catch (requestError) {
      if (requestId === searchRequest.current) setError(requestError.message || 'Không thể tải chuyến bay cho chặng này.');
    } finally { if (requestId === searchRequest.current) setLoading(false); }
  }, [api, validLegs, leg, passengerCount, airlineId, page]);

  useEffect(() => {
    void load();
    return () => { searchRequest.current += 1; };
  }, [load]);

  const chooseFlight = async (flight) => {
    setSelectionError('');
    if (Number(flight.departure_airport_id) !== Number(leg.departure_airport_id)
      || Number(flight.arrival_airport_id) !== Number(leg.arrival_airport_id)) {
      setSelectionError('Chuyến bay không khớp với chặng đã tìm. Hãy chọn chuyến khác.');
      return;
    }
    const previousFlight = chosenFlights[legIndex - 1];
    if (previousFlight) {
      const arrivalTime = new Date(previousFlight.arrival_time).getTime();
      const departureTime = new Date(flight.departure_time).getTime();
      if (Number(previousFlight.arrival_airport_id) !== Number(flight.departure_airport_id)) {
        setSelectionError('Điểm đi của chặng này phải trùng sân bay đến chặng trước.');
        return;
      }
      if (!Number.isFinite(arrivalTime) || !Number.isFinite(departureTime) || departureTime - arrivalTime < 60 * 60 * 1000) {
        setSelectionError('Thời gian nối chuyến phải ít nhất 60 phút. Vui lòng chọn chuyến khác.');
        return;
      }
    }
    const requestId = ++fareRequest.current;
    setSelectedFlight(flight); setLoadingFares(true); setSelectedFare(null); setFares([]); setError('');
    try {
      const response = await api.fareClassesForFlight(flight.id);
      if (requestId !== fareRequest.current) return;
      setFares(response?.data || []);
    } catch (requestError) {
      if (requestId === fareRequest.current) setError(requestError.message || 'Không thể tải hạng vé của chuyến bay.');
    } finally { if (requestId === fareRequest.current) setLoadingFares(false); }
  };

  const continueWithFare = () => {
    if (!selectedFlight || !selectedFare) return;
    const next = [...selectedLegs, { flight_id: Number(selectedFlight.id), fare_class_id: Number(selectedFare.id) }];
    if (legIndex + 1 < legs.length) {
      setSelectedLegs(next); setChosenFlights((current) => [...current.slice(0, legIndex), selectedFlight]);
      fareRequest.current += 1; setLegIndex((current) => current + 1); setPage(1); setSelectedFlight(null); setSelectedFare(null); setFares([]); setSelectionError(''); setError('');
      return;
    }
    const query = new URLSearchParams({ trip_type: tripType, passengers: String(passengerCount), itinerary_legs: JSON.stringify(next) });
    navigate(`/bookings/new?${query.toString()}`);
  };

  if (!validLegs || !Number.isInteger(Number(passengerCount)) || Number(passengerCount) < 1) {
    return <section className="search-state surface-card" role="alert"><h2>Thông tin hành trình chưa hợp lệ</h2><p>Quay lại trang chủ để chọn lại các sân bay và ngày bay.</p><Link className="button button-primary" to="/">Sửa hành trình</Link></section>;
  }

  const firstFlight = result.data[0];
  const canGoNext = result.data.length >= pageSize;
  return <>
    <header className="results-heading"><div><span className="eyebrow">{tripType === 'round_trip' ? 'HÀNH TRÌNH KHỨ HỒI' : 'HÀNH TRÌNH NHIỀU CHẶNG'}</span><h1>Chọn chuyến cho chặng {legIndex + 1}/{legs.length}</h1><p>{formatDay(leg.departure_date)} · {passengerCount} hành khách · Chọn chuyến và hạng vé thực tế cho từng chặng</p></div>{firstFlight ? <div className="results-route-chip"><span>{firstFlight.departureAirport?.iata_code || '—'}</span><i aria-hidden="true">✈</i><span>{firstFlight.arrivalAirport?.iata_code || '—'}</span></div> : null}</header>
    <section className="trip-selection-progress surface-card" aria-label="Tiến độ chọn hành trình"><div className="trip-selection-progress-steps">{legs.map((item, index) => <span key={`${item.departure_airport_id}-${item.arrival_airport_id}-${index}`} className={index < legIndex ? 'is-done' : index === legIndex ? 'is-current' : ''}>Chặng {index + 1}{index < legIndex ? ' · Đã chọn' : index === legIndex ? ' · Đang chọn' : ''}</span>)}</div><p>{selectedLegs.length} / {legs.length} chặng đã có chuyến và hạng vé.</p></section>
    {!loading && error ? <section className="search-state surface-card" role="alert"><h2>Chưa tải được chặng bay</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => void load()}>Thử lại</button></section> : null}
    {selectionError ? <p className="field-error" role="alert">{selectionError}</p> : null}
    {loading ? <LoadingView label={`Đang tìm chuyến cho chặng ${legIndex + 1}…`} /> : null}
    {!loading && !error ? result.data.length ? <>
      <section className="results-summary"><span>{result.data.length} chuyến bay trên trang này</span><span>Giá và chỗ trống lấy từ lịch bay hiện có</span></section>
      <div className="flight-results-list">{result.data.map((flight) => <FlightCard key={flight.id} flight={flight} passengerCount={passengerCount} onSelectFlight={chooseFlight} />)}</div>
      {selectedFlight ? <section className="surface-card trip-fare-picker" aria-labelledby="trip-fare-heading"><div><span className="eyebrow">CHẶNG {legIndex + 1}</span><h2 id="trip-fare-heading">Chọn hạng vé · {airportsOfFlight(selectedFlight)}</h2></div>{loadingFares ? <LoadingView label="Đang tải hạng vé…" /> : fares.length ? <><div className="booking-fare-list">{fares.map((fare) => <label className={`booking-fare-option ${selectedFare?.id === fare.id ? 'is-selected' : ''}`} key={fare.id}><input type="radio" name={`fare-leg-${legIndex}`} checked={selectedFare?.id === fare.id} onChange={() => setSelectedFare(fare)} /><span><strong>{fare.class_name}</strong><small>{fare.seat_quota ?? '—'} ghế phân bổ</small></span><strong>{formatPrice(fare.price)} ₫ / khách</strong></label>)}</div><button className="button button-primary" type="button" disabled={!selectedFare} onClick={continueWithFare}>{legIndex + 1 < legs.length ? 'Tiếp tục chọn chặng sau' : 'Tiếp tục nhập hành khách'}</button></> : <p>Chuyến này chưa có hạng vé đang bán. Hãy chọn chuyến khác.</p>}</section> : null}
      {(page > 1 || canGoNext) ? <nav className="results-pagination" aria-label="Phân trang chuyến bay"><button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>← Trước</button><span aria-current="page">Trang {page}</span><button type="button" onClick={() => setPage((current) => current + 1)} disabled={!canGoNext}>Tiếp theo →</button></nav> : null}
    </> : <section className="search-state surface-card"><span className="empty-mark" aria-hidden="true">✦</span><h2>Không có chuyến bay phù hợp cho chặng {legIndex + 1}</h2><p>Không tự động đổi ngày hoặc tạo chuyến thay thế. Hãy quay lại và chọn ngày/tuyến khác.</p><Link className="button button-outline" to="/">Sửa tiêu chí tìm kiếm</Link></section> : null}
  </>;
}

const airportsOfFlight = (flight) => `${flight?.departureAirport?.iata_code || '—'} → ${flight?.arrivalAirport?.iata_code || '—'}`;

export function FlightResultsPage() {
  const { request } = useAuth();
  const api = useMemo(() => createFlightDiscoveryApi(request), [request]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tripType = searchParams.get('trip_type') || '';
  const tripMode = tripType === 'round_trip' || tripType === 'multi_city';
  const passengerCount = searchParams.get('passengers') || '1';
  const airlineId = searchParams.get('airline_id') || '';
  let itineraryLegs = [];
  if (tripMode) {
    try { itineraryLegs = JSON.parse(searchParams.get('legs') || '[]'); } catch { itineraryLegs = []; }
  }
  const values = useMemo(() => ({
    departure_airport_id: searchParams.get('departure_airport_id') || '',
    arrival_airport_id: searchParams.get('arrival_airport_id') || '',
    departure_date: searchParams.get('departure_date') || '',
    min_seats: searchParams.get('min_seats') || '1',
    airline_id: searchParams.get('airline_id') || '',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || String(pageSize),
  }), [searchParams]);
  const valid = validId(values.departure_airport_id)
    && validId(values.arrival_airport_id)
    && values.departure_airport_id !== values.arrival_airport_id
    && /^\d{4}-\d{2}-\d{2}$/.test(values.departure_date)
    && Number.isInteger(Number(values.min_seats)) && Number(values.min_seats) >= 1
    && (!values.airline_id || validId(values.airline_id))
    && Number.isInteger(Number(values.page)) && Number(values.page) >= 1
    && Number.isInteger(Number(values.limit)) && Number(values.limit) >= 1;
  const [result, setResult] = useState({ data: [], pagination: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const oneWaySearchRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++oneWaySearchRequest.current;
    if (!valid) return;
    setLoading(true); setResult({ data: [], pagination: null });
    setError('');
    try {
      const response = await api.searchFlights(values);
      if (requestId !== oneWaySearchRequest.current) return;
      setResult({ data: response?.data || [], pagination: response?.pagination || null });
    } catch (requestError) {
      if (requestId === oneWaySearchRequest.current) setError(requestError.message || 'Không thể tải chuyến bay. Vui lòng thử lại.');
    } finally {
      if (requestId === oneWaySearchRequest.current) setLoading(false);
    }
  }, [api, valid, values]);

  useEffect(() => {
    void load();
    return () => { oneWaySearchRequest.current += 1; };
  }, [load]);
  const changePage = (page) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('page', String(page));
    return next;
  });
  const currentPage = Number(values.page);
  const canGoNext = result.data.length >= Number(values.limit);
  const representativeFlight = result.data[0];

  return (
    <div className="public-page results-page">
      <AppHeader />
      <main className="results-main">
        <Link className="back-link" to="/">← Chỉnh sửa tìm kiếm</Link>
        {tripMode ? <TripFlightResults api={api} tripType={tripType} legs={itineraryLegs} passengerCount={passengerCount} airlineId={airlineId} /> : <>
        <header className="results-heading"><div><span className="eyebrow">HÀNH TRÌNH MỘT CHIỀU</span><h1>Chuyến bay phù hợp</h1><p>{values.departure_date ? formatDay(values.departure_date) : 'Chưa chọn ngày'} · {values.min_seats} hành khách</p></div>{representativeFlight ? <div className="results-route-chip" aria-label="Chặng bay trong kết quả"><span>{representativeFlight.departureAirport?.iata_code || '—'}</span><i aria-hidden="true">✈</i><span>{representativeFlight.arrivalAirport?.iata_code || '—'}</span></div> : null}</header>
        {!valid ? <section className="search-state surface-card" role="alert"><h2>Thông tin tìm kiếm chưa đầy đủ</h2><p>Quay lại trang chủ và chọn điểm đi, điểm đến cùng ngày khởi hành hợp lệ.</p><Link className="button button-primary" to="/">Tìm chuyến bay</Link></section> : null}
        {loading ? <LoadingView label="Đang tìm chuyến bay…" /> : null}
        {error ? <section className="search-state surface-card" role="alert"><h2>Chưa tải được kết quả</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => void load()}>Thử lại</button></section> : null}
        {valid && !loading && !error ? <>
          <section className="results-summary"><span>{result.data.length} chuyến bay trên trang này</span><span>Thứ tự khởi hành do hệ thống sắp xếp</span></section>
          {result.data.length ? <div className="flight-results-list">{result.data.map((flight) => <FlightCard key={flight.id} flight={flight} passengerCount={values.min_seats} />)}</div> : <section className="search-state surface-card"><span className="empty-mark" aria-hidden="true">✦</span><h2>{currentPage > 1 ? 'Trang này không có chuyến bay' : 'Không có chuyến bay phù hợp'}</h2><p>{currentPage > 1 ? 'Thông tin tổng số trang từ máy chủ có thể chưa khớp với danh sách. Bạn có thể quay lại trang trước.' : 'Thử đổi ngày bay, điểm đến hoặc số hành khách để tìm lựa chọn khác.'}</p>{currentPage === 1 ? <Link className="button button-outline" to="/">Sửa tiêu chí tìm kiếm</Link> : null}</section>}
          {(currentPage > 1 || canGoNext) ? <nav className="results-pagination" aria-label="Phân trang chuyến bay"><button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Quay lại trang trước">← Trước</button><span aria-current="page">Trang {currentPage}</span><button type="button" onClick={() => changePage(currentPage + 1)} disabled={!canGoNext} aria-label="Sang trang tiếp theo">Tiếp theo →</button></nav> : null}
        </> : null}
        </>}
      </main>
      <footer className="site-footer"><span>Serene Flightways</span><span>Giờ bay hiển thị theo giờ Việt Nam (UTC+7).</span></footer>
    </div>
  );
}
