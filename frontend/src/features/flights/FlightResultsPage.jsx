import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AppFooter } from '../../components/AppFooter';
import { LoadingView } from '../../components/LoadingView';
import { Skeleton } from '../../components/Skeleton';
import { getSocket } from '../../lib/socket';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';
import { AdvancedFlightFilters } from './AdvancedFlightFilters';
import { formatCurrency } from '../../lib/formatters';
import { formatVnDayOfWeek, getNearbyDates, toVnDateString } from '../../lib/dateUtils';
import { ArrowLeft } from 'lucide-react';

const pageSize = 20;
const EMPTY_FILTER_VALUES = Object.freeze({});
const validId = (value) => /^\d+$/.test(value || '') && Number(value) > 0;
const formatTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
const formatDay = (value) => value ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '';
const flightStatusLabel = (status) => ({ scheduled: 'Theo lịch', delayed: 'Hoãn chuyến', boarding: 'Đang lên máy bay', departed: 'Đã khởi hành', arrived: 'Đã đến nơi', cancelled: 'Đã hủy', completed: 'Đã hoàn thành' })[status] || 'Thông tin chuyến bay';

function FlightCard({ flight: initialFlight, passengerCount, onSelectFlight, sortBy = 'departure_earliest' }) {
  const [flight, setFlight] = useState(initialFlight);
  const [seatWarning, setSeatWarning] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
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
  const shownFare = sortBy === 'price_high' ? farePrices.at(-1) : farePrices[0];
  const from = flight.departureAirport || {};
  const to = flight.arrivalAirport || {};
  const bookable = flight.status === 'scheduled';
  const departureTime = flight.status === 'departed' || flight.status === 'arrived' ? flight.actual_departure_time || flight.departure_time : flight.departure_time;
  const arrivalTime = flight.status === 'arrived' ? flight.actual_arrival_time || flight.arrival_time : flight.arrival_time;
  const fareClasses = Array.isArray(flight.fareClasses) ? flight.fareClasses : [];
  const economyFare = fareClasses.find((f) => /phổ thông|economy/i.test(f.class_name)) || fareClasses[0];
  const businessFare = fareClasses.find((f) => /thương gia|business/i.test(f.class_name))
    || fareClasses.find((f) => f.id !== economyFare?.id);
  const hasValidLogo = Boolean(flight.airline?.logo_url && !flight.airline.logo_url.includes('images.unsplash.com'));

  return (
    <article className="flight-result-card">
      <div className="flight-carrier">
        <span className="carrier-logo" aria-hidden="true">
          {hasValidLogo ? (
            <>
              <img
                src={flight.airline.logo_url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                  if (event.currentTarget.nextElementSibling) {
                    event.currentTarget.nextElementSibling.style.display = 'inline-grid';
                  }
                }}
              />
              <span className="carrier-mark" style={{ display: 'none' }}>
                {flight.airline?.iata_code || '✈'}
              </span>
            </>
          ) : (
            <span className="carrier-mark">{flight.airline?.iata_code || '✈'}</span>
          )}
        </span>
        <div><strong>{flight.airline?.name || 'Hãng hàng không'}</strong><small>{flightStatusLabel(flight.status)}</small></div>
      </div>
      <div className="flight-itinerary">
        <div><time className="table-mono-cell">{formatTime(departureTime)}</time><strong className="table-mono-cell">{from.iata_code || from.city || from.name || '—'}</strong><small>{from.city || from.name || ''}</small></div>
        <div className="flight-duration" aria-hidden="true"><span /><small>Chặng bay</small></div>
        <div><time className="table-mono-cell">{formatTime(arrivalTime)}</time><strong className="table-mono-cell">{to.iata_code || to.city || to.name || '—'}</strong><small>{to.city || to.name || ''}</small></div>
      </div>
      <div className="flight-availability">
        <strong className="table-mono-cell">{flight.available_seats ?? '—'}</strong><span>chỗ còn trống</span>
        {seatWarning ? <span className="seat-warning-tag" role="alert">⚠ {seatWarning.message || `Chỉ còn ${seatWarning.availableSeats} ghế`}</span> : null}
      </div>
      <div className="flight-fare">{shownFare !== undefined ? <><small>{sortBy === 'price_high' ? 'Mức giá cao nhất' : 'Giá từ'}</small><strong className="table-mono-cell">{formatCurrency(shownFare)}</strong></> : <span>Chưa có thông tin giá</span>}</div>
      {flight.status_reason ? <p className="flight-status-reason">Lý do cập nhật: {flight.status_reason}</p> : null}
      {onSelectFlight
        ? <button className="button button-primary flight-book-link" type="button" disabled={!bookable} onClick={() => onSelectFlight(flight)}>{bookable ? 'Chọn chuyến bay' : 'Không thể đặt chuyến này'}</button>
        : bookable ? <Link className="button button-primary flight-book-link" to={`/bookings/new?flight_id=${encodeURIComponent(flight.id)}&passengers=${encodeURIComponent(passengerCount)}`}>Chọn chuyến bay</Link> : <button className="button button-secondary flight-book-link" type="button" disabled>{flight.status === 'cancelled' ? 'Chuyến bay đã hủy' : 'Không còn nhận đặt chỗ'}</button>}

      {/* Nút so sánh nhanh hạng Phổ thông và Thương gia ngay trên thẻ chuyến */}
      <div className="flight-fare-compare-wrap">
        <button
          type="button"
          className="flight-compare-toggle"
          aria-expanded={showCompare}
          onClick={() => setShowCompare((prev) => !prev)}
        >
          {showCompare ? '▴ Ẩn so sánh hạng vé' : '▾ So sánh Phổ thông & Thương gia'}
        </button>
        {showCompare ? (
          <div className="flight-compare-drawer" aria-label="So sánh chi tiết Phổ thông và Thương gia">
            <div className="fare-compare-card is-economy">
              <span className="fare-compare-badge">{economyFare?.class_name || 'Phổ thông'}</span>
              <strong className="fare-compare-price table-mono-cell tabular-nums">
                {economyFare?.price ? formatCurrency(economyFare.price) : 'Chưa có giá'}
              </strong>
              <small className="fare-compare-quota">
                {economyFare?.seat_quota != null ? `Còn ${economyFare.seat_quota} ghế phân bổ` : 'Chưa phân bổ ghế'}
              </small>
            </div>
            <div className="fare-compare-card is-business">
              <span className="fare-compare-badge">{businessFare?.class_name || 'Thương gia'}</span>
              {businessFare ? (
                <>
                  <strong className="fare-compare-price table-mono-cell tabular-nums">
                    {formatCurrency(businessFare.price)}
                  </strong>
                  <small className="fare-compare-quota">
                    {businessFare.seat_quota != null ? `Còn ${businessFare.seat_quota} ghế phân bổ` : 'Chưa phân bổ ghế'}
                  </small>
                </>
              ) : (
                <div className="fare-compare-empty">
                  <span>Chuyến bay này hiện chưa mở bán hạng vé Thương gia.</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function NearbyDateStrip({ api, departureAirportId, arrivalAirportId, departureDate, minSeats, filterValues = {}, currentFlightResults, enabled, onSelectDate }) {
  const [dayPrices, setDayPrices] = useState({});
  const activeReq = useRef(0);

  const dates = useMemo(() => {
    if (!departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return [];
    const todayVn = toVnDateString(new Date());
    return getNearbyDates(departureDate, 3).filter((d) => d >= todayVn);
  }, [departureDate]);

  // Tính giá thấp nhất cho ngày đang chọn từ kết quả hiện có của trang chính
  const currentDayMinPrice = useMemo(() => {
    if (!Array.isArray(currentFlightResults) || currentFlightResults.length === 0) return null;
    let lowest = null;
    currentFlightResults.forEach((f) => {
      if (Array.isArray(f.fareClasses)) {
        f.fareClasses.forEach((fc) => {
          const p = Number(fc.price);
          if (Number.isFinite(p) && (lowest === null || p < lowest)) {
            lowest = p;
          }
        });
      }
    });
    return lowest;
  }, [currentFlightResults]);

  useEffect(() => {
    if (!api || !departureAirportId || !arrivalAirportId || dates.length === 0) return;
    let cancelled = false;
    const reqId = ++activeReq.current;

    // Ngày đang chọn có thể hiển thị giá ngay lập tức từ kết quả hiện tại
    const initial = {};
    dates.forEach((d) => {
      if (d === departureDate) {
        initial[d] = {
          loading: false,
          minPrice: currentDayMinPrice,
          count: currentFlightResults?.length || 0,
        };
      } else {
        initial[d] = { loading: true, minPrice: null, count: 0 };
      }
    });
    setDayPrices(initial);

    // Chỉ gọi API cho các ngày lân cận khi trang chính đã sẵn sàng (enabled)
    if (!enabled) return;

    const fetchDate = async (d) => {
      if (d === departureDate) return;
      try {
        const res = await api.searchFlights({
          ...filterValues,
          departure_airport_id: departureAirportId,
          arrival_airport_id: arrivalAirportId,
          departure_date: d,
          min_seats: minSeats || 1,
          limit: 10,
          sort_by: 'price_low',
        });
        if (cancelled || reqId !== activeReq.current) return;
        const flights = Array.isArray(res?.data) ? res.data : [];
        let lowest = null;
        flights.forEach((f) => {
          if (Array.isArray(f.fareClasses)) {
            f.fareClasses.forEach((fc) => {
              const p = Number(fc.price);
              if (Number.isFinite(p) && (lowest === null || p < lowest)) {
                lowest = p;
              }
            });
          }
        });
        setDayPrices((prev) => ({
          ...prev,
          [d]: { loading: false, minPrice: lowest, count: flights.length },
        }));
      } catch {
        if (cancelled || reqId !== activeReq.current) return;
        setDayPrices((prev) => ({
          ...prev,
          [d]: { loading: false, minPrice: null, count: 0 },
        }));
      }
    };

    const runBatches = async () => {
      // Các ngày khác ngày hiện tại cần tải
      const otherDates = dates.filter((d) => d !== departureDate);
      const concurrency = 2;
      for (let i = 0; i < otherDates.length; i += concurrency) {
        if (cancelled || reqId !== activeReq.current) break;
        const batch = otherDates.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(fetchDate));
      }
    };

    const delayTimer = setTimeout(() => {
      void runBatches();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
    };
  }, [api, departureAirportId, arrivalAirportId, dates, departureDate, minSeats, enabled, currentDayMinPrice, currentFlightResults?.length]);

  if (dates.length === 0) return null;

  return (
    <section className="nearby-dates-section" aria-label="Lịch bay lân cận ±3 ngày">
      <div className="nearby-dates-header">
        <h3>Lịch bay & giá vé lân cận (±3 ngày)</h3>
        <span>Chọn ngày để xem chuyến bay tương ứng</span>
      </div>
      <div className="nearby-dates-grid" role="tablist" aria-label="Chọn ngày lân cận">
        {dates.map((d) => {
          const info = dayPrices[d];
          const isActive = d === departureDate;
          const [, m, dayNum] = d.split('-');
          const dayOfWeek = formatVnDayOfWeek(d);

          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'date' : undefined}
              className={`nearby-date-card ${isActive ? 'is-active' : ''} ${!info?.loading && info?.minPrice === null ? 'is-sold-out' : ''}`}
              onClick={() => onSelectDate(d)}
            >
              <span className="nearby-date-day">{dayOfWeek}</span>
              <span className="nearby-date-num table-mono-cell">{`${dayNum}/${m}`}</span>
              {info?.loading ? (
                <span className="nearby-date-skeleton" aria-hidden="true" />
              ) : info?.minPrice ? (
                <span className="nearby-date-price table-mono-cell tabular-nums">
                  Từ {formatCurrency(info.minPrice)}
                </span>
              ) : (
                <span className="nearby-date-price">Hết chuyến</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="nearby-dates-footer" style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--color-muted, #64748b)' }}>
        <small>Giá thấp nhất trong kết quả đã tải theo tiêu chí tìm kiếm hiện tại từ máy chủ (đã sắp xếp giá tăng dần).</small>
      </div>
    </section>
  );
}

export function FlightSortToolbar({ sortBy = 'departure_earliest', onSortChange }) {
  const options = [
    { value: 'price_low', label: 'Giá thấp nhất' },
    { value: 'departure_earliest', label: 'Khởi hành sớm nhất' },
    { value: 'duration_shortest', label: 'Bay nhanh nhất' },
  ];

  return (
    <div className="flight-sort-toolbar" role="toolbar" aria-label="Sắp xếp kết quả chuyến bay">
      <span className="flight-sort-label">Sắp xếp theo:</span>
      <div className="flight-sort-options">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`flight-sort-btn ${sortBy === opt.value ? 'is-active' : ''}`}
            aria-pressed={sortBy === opt.value}
            onClick={() => onSortChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TripFlightResults({ api, tripType, legs, passengerCount, airlineId, filterValues = EMPTY_FILTER_VALUES, page: externalPage, onPageChange, sortBy }) {
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
  const [localPage, setLocalPage] = useState(1);
  const page = externalPage || localPage;
  const setPage = (nextPage) => {
    const resolvedPage = typeof nextPage === 'function' ? nextPage(page) : nextPage;
    if (onPageChange) onPageChange(resolvedPage);
    else setLocalPage(resolvedPage);
  };
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
        ...leg, ...filterValues, min_seats: passengerCount, airline_id: filterValues.airline_id || airlineId, page, limit: pageSize,
      });
      if (requestId !== searchRequest.current) return;
      setResult({ data: response?.data || [], pagination: response?.pagination || null });
    } catch (requestError) {
      if (requestId === searchRequest.current) setError(requestError.message || 'Không thể tải chuyến bay cho chặng này.');
    } finally { if (requestId === searchRequest.current) setLoading(false); }
  }, [api, validLegs, leg, passengerCount, airlineId, filterValues, page]);

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
      setFares(Array.isArray(response) ? response : response?.data || []);
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
    <header className="results-heading"><div><span className="eyebrow">{tripType === 'round_trip' ? 'HÀNH TRÌNH KHỨ HỒI' : 'HÀNH TRÌNH NHIỀU CHẶNG'}</span><h1>Chọn chuyến cho chặng {legIndex + 1}/{legs.length}</h1><p><strong>{tripType === 'round_trip' ? (legIndex === 0 ? 'Chiều đi' : 'Chiều về') : `Chặng ${legIndex + 1}`}</strong> · {formatDay(leg.departure_date)} · {passengerCount} hành khách · Chọn chuyến và hạng vé thực tế cho từng chặng</p></div>{firstFlight ? <div className="results-route-chip"><span>{firstFlight.departureAirport?.iata_code || '—'}</span><i aria-hidden="true">✈</i><span>{firstFlight.arrivalAirport?.iata_code || '—'}</span></div> : null}</header>
    <section className="trip-selection-progress surface-card" aria-label="Tiến độ chọn hành trình"><div className="trip-selection-progress-steps">{legs.map((item, index) => <span key={`${item.departure_airport_id}-${item.arrival_airport_id}-${index}`} className={index < legIndex ? 'is-done' : index === legIndex ? 'is-current' : ''}>Chặng {index + 1}{index < legIndex ? ' · Đã chọn' : index === legIndex ? ' · Đang chọn' : ''}</span>)}</div><p>{selectedLegs.length} / {legs.length} chặng đã có chuyến và hạng vé.</p></section>
    {!loading && error ? <section className="search-state surface-card" role="alert"><h2>Chưa tải được chặng bay</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => void load()}>Thử lại</button></section> : null}
    {selectionError ? <p className="field-error" role="alert">{selectionError}</p> : null}
    {loading ? <div><LoadingView label={`Đang tìm chuyến cho chặng ${legIndex + 1}…`} /><div className="flight-skeleton-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }} aria-hidden="true"><Skeleton height="88px" radius="4px" /><Skeleton height="88px" radius="4px" /></div></div> : null}
    {!loading && !error ? result.data.length ? <>
      <section className="results-summary"><span>{result.data.length} chuyến bay trên trang này</span><span>Giá và chỗ trống lấy từ lịch bay hiện có</span></section>
      <div className="flight-results-list">{result.data.map((flight) => <FlightCard key={flight.id} flight={flight} passengerCount={passengerCount} onSelectFlight={chooseFlight} sortBy={sortBy} />)}</div>
      {selectedFlight ? <section className="surface-card trip-fare-picker" aria-labelledby="trip-fare-heading"><div><span className="eyebrow">CHẶNG {legIndex + 1}</span><h2 id="trip-fare-heading">Chọn hạng vé · {airportsOfFlight(selectedFlight)}</h2></div>{loadingFares ? <LoadingView label="Đang tải hạng vé…" /> : fares.length ? <><div className="booking-fare-list">{fares.map((fare) => <label className={`booking-fare-option ${selectedFare?.id === fare.id ? 'is-selected' : ''}`} key={fare.id}><input type="radio" name={`fare-leg-${legIndex}`} checked={selectedFare?.id === fare.id} onChange={() => setSelectedFare(fare)} /><span><strong>{fare.class_name}</strong><small>{fare.seat_quota ?? '—'} ghế phân bổ</small></span><strong>{formatCurrency(fare.price)} / khách</strong></label>)}</div><button className="button button-primary" type="button" disabled={!selectedFare} onClick={continueWithFare}>{legIndex + 1 < legs.length ? 'Tiếp tục chọn chặng sau' : 'Tiếp tục nhập hành khách'}</button></> : <p>Chuyến này chưa có hạng vé đang bán. Hãy chọn chuyến khác.</p>}</section> : null}
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
    min_price: searchParams.get('min_price') || '',
    max_price: searchParams.get('max_price') || '',
    fare_class: searchParams.get('fare_class') || '',
    departure_time_from: searchParams.get('departure_time_from') || '',
    departure_time_to: searchParams.get('departure_time_to') || '',
    arrival_time_from: searchParams.get('arrival_time_from') || '',
    arrival_time_to: searchParams.get('arrival_time_to') || '',
    min_duration_minutes: searchParams.get('min_duration_minutes') || '',
    max_duration_minutes: searchParams.get('max_duration_minutes') || '',
    sort_by: searchParams.get('sort_by') || 'departure_earliest',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || String(pageSize),
  }), [searchParams]);
  const filterValues = useMemo(() => ({
    airline_id: values.airline_id,
    min_price: values.min_price,
    max_price: values.max_price,
    fare_class: values.fare_class,
    departure_time_from: values.departure_time_from,
    departure_time_to: values.departure_time_to,
    arrival_time_from: values.arrival_time_from,
    arrival_time_to: values.arrival_time_to,
    min_duration_minutes: values.min_duration_minutes,
    max_duration_minutes: values.max_duration_minutes,
    sort_by: values.sort_by,
  }), [values]);
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
  const applyFilters = (filters) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    for (const key of ['airline_id', 'min_price', 'max_price', 'fare_class', 'departure_time_from', 'departure_time_to', 'arrival_time_from', 'arrival_time_to', 'min_duration_minutes', 'max_duration_minutes', 'sort_by']) {
      next.delete(key);
      const value = filters[key]?.trim?.() ?? filters[key];
      if (value && !(key === 'sort_by' && value === 'departure_earliest')) next.set(key, value);
    }
    next.set('page', '1');
    return next;
  });
  const clearFilter = (key) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete(key);
    next.set('page', '1');
    return next;
  });
  const resetFilters = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    for (const key of ['airline_id', 'min_price', 'max_price', 'fare_class', 'departure_time_from', 'departure_time_to', 'arrival_time_from', 'arrival_time_to', 'min_duration_minutes', 'max_duration_minutes', 'sort_by']) next.delete(key);
    next.set('page', '1');
    return next;
  });
  const currentPage = Number(values.page);
  const canGoNext = result.data.length >= Number(values.limit);
  const representativeFlight = result.data[0];

  return (
    <div className="public-page results-page">
      <AppHeader />
      <main className="results-main">
        <Link className="back-link" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Chỉnh sửa tìm kiếm</span>
        </Link>
        {!tripMode && valid ? <AdvancedFlightFilters api={api} values={values} onApply={applyFilters} onClear={clearFilter} onReset={resetFilters} /> : null}
        {tripMode ? <>
          <AdvancedFlightFilters api={api} values={values} onApply={applyFilters} onClear={clearFilter} onReset={resetFilters} />
          <TripFlightResults api={api} tripType={tripType} legs={itineraryLegs} passengerCount={passengerCount} airlineId={airlineId} filterValues={filterValues} page={Number(values.page)} sortBy={values.sort_by} onPageChange={changePage} />
        </> : <>
        <header className="results-heading"><div><span className="eyebrow">HÀNH TRÌNH MỘT CHIỀU</span><h1>Chuyến bay phù hợp</h1><p>{values.departure_date ? formatDay(values.departure_date) : 'Chưa chọn ngày'} · {values.min_seats} hành khách</p></div>{representativeFlight ? <div className="results-route-chip" aria-label="Chặng bay trong kết quả"><span>{representativeFlight.departureAirport?.iata_code || '—'}</span><i aria-hidden="true">✈</i><span>{representativeFlight.arrivalAirport?.iata_code || '—'}</span></div> : null}</header>
        {!valid ? <section className="search-state surface-card" role="alert"><h2>Thông tin tìm kiếm chưa đầy đủ</h2><p>Quay lại trang chủ và chọn điểm đi, điểm đến cùng ngày khởi hành hợp lệ.</p><Link className="button button-primary" to="/">Tìm chuyến bay</Link></section> : null}

        {/* Thanh chọn ngày lân cận ±3 ngày kèm giá thấp nhất mỗi ngày */}
        {valid ? (
          <NearbyDateStrip
            api={api}
            departureAirportId={values.departure_airport_id}
            arrivalAirportId={values.arrival_airport_id}
            departureDate={values.departure_date}
            minSeats={values.min_seats}
            filterValues={filterValues}
            currentFlightResults={result.data}
            enabled={valid && !loading && !error && result.pagination !== null}
            onSelectDate={(newDate) => {
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set('departure_date', newDate);
                next.set('page', '1');
                return next;
              });
            }}
          />
        ) : null}

        {/* Thanh sắp xếp nhanh: giá thấp nhất, khởi hành sớm nhất, bay nhanh nhất */}
        {valid ? (
          <FlightSortToolbar
            sortBy={values.sort_by}
            onSortChange={(newSort) => applyFilters({ ...filterValues, sort_by: newSort })}
          />
        ) : null}

        {loading ? <div><LoadingView label="Đang tìm chuyến bay…" /><div className="flight-skeleton-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }} aria-hidden="true"><Skeleton height="88px" radius="4px" /><Skeleton height="88px" radius="4px" /><Skeleton height="88px" radius="4px" /></div></div> : null}
        {error ? <section className="search-state surface-card" role="alert"><h2>Chưa tải được kết quả</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => void load()}>Thử lại</button></section> : null}
        {valid && !loading && !error ? <>
          <section className="results-summary">
            <span>{result.data.length} chuyến bay trên trang này</span>
            <small className="results-limit-note">Hiển thị theo phân trang máy chủ (tối đa {values.limit} chuyến/trang)</small>
            <span>Kết quả đã áp dụng bộ lọc và thứ tự sắp xếp từ máy chủ</span>
          </section>
          {result.data.length ? <div className="flight-results-list">{result.data.map((flight) => <FlightCard key={flight.id} flight={flight} passengerCount={values.min_seats} sortBy={values.sort_by} />)}</div> : <section className="search-state surface-card"><span className="empty-mark" aria-hidden="true">✦</span><h2>{currentPage > 1 ? 'Trang này không có chuyến bay' : 'Không có chuyến bay phù hợp'}</h2><p>{currentPage > 1 ? 'Thông tin tổng số trang từ máy chủ có thể chưa khớp với danh sách. Bạn có thể quay lại trang trước.' : 'Thử đổi ngày bay, điểm đến hoặc bộ lọc để tìm lựa chọn khác.'}</p>{currentPage === 1 ? <Link className="button button-outline" to="/">Sửa tiêu chí tìm kiếm</Link> : null}</section>}
          {(currentPage > 1 || canGoNext) ? <nav className="results-pagination" aria-label="Phân trang chuyến bay"><button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Quay lại trang trước">← Trước</button><span aria-current="page">Trang {currentPage}</span><button type="button" onClick={() => changePage(currentPage + 1)} disabled={!canGoNext} aria-label="Sang trang tiếp theo">Tiếp theo →</button></nav> : null}
        </> : null}
        </>}
      </main>
      <AppFooter note="Giờ bay hiển thị theo giờ Việt Nam (UTC+7)." />
    </div>
  );
}
