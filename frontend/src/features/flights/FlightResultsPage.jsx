import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { LoadingView } from '../../components/LoadingView';
import { Pagination } from '../../components/Pagination';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';

const pageSize = 20;
const validId = (value) => /^\d+$/.test(value || '') && Number(value) > 0;
const formatTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
const formatDay = (value) => value ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '';
const formatPrice = (price) => new Intl.NumberFormat('vi-VN').format(price);
const flightStatusLabel = (status) => ({ scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Đã hoàn thành' })[status] || 'Thông tin chuyến bay';

function FlightCard({ flight }) {
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
  return (
    <article className="flight-result-card">
      <div className="flight-carrier">{flight.airline?.logo_url ? <img src={flight.airline.logo_url} alt="" /> : <span className="carrier-mark" aria-hidden="true">✈</span>}<div><strong>{flight.airline?.name || 'Hãng hàng không'}</strong><small>{flightStatusLabel(flight.status)}</small></div></div>
      <div className="flight-itinerary">
        <div><time>{formatTime(flight.departure_time)}</time><strong>{from.iata_code || from.city || from.name || '—'}</strong><small>{from.city || from.name || ''}</small></div>
        <div className="flight-duration" aria-hidden="true"><span /><small>Chặng bay</small></div>
        <div><time>{formatTime(flight.arrival_time)}</time><strong>{to.iata_code || to.city || to.name || '—'}</strong><small>{to.city || to.name || ''}</small></div>
      </div>
      <div className="flight-availability"><strong>{flight.available_seats ?? '—'}</strong><span>chỗ còn trống</span></div>
      <div className="flight-fare">{lowestFare !== undefined ? <><small>Giá từ</small><strong>{formatPrice(lowestFare)} ₫</strong></> : <span>Chưa có thông tin giá</span>}</div>
      <Link className="button button-primary flight-book-link" to={`/bookings/new?flight_id=${encodeURIComponent(flight.id)}`}>Chọn chuyến bay</Link>
    </article>
  );
}

export function FlightResultsPage() {
  const { request } = useAuth();
  const api = useMemo(() => createFlightDiscoveryApi(request), [request]);
  const [searchParams, setSearchParams] = useSearchParams();
  const values = useMemo(() => ({
    departure_airport_id: searchParams.get('departure_airport_id') || '',
    arrival_airport_id: searchParams.get('arrival_airport_id') || '',
    departure_date: searchParams.get('departure_date') || '',
    min_seats: searchParams.get('min_seats') || '1',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || String(pageSize),
  }), [searchParams]);
  const tripType = searchParams.get('trip_type') === 'round_trip' ? 'round_trip' : 'one_way';
  const returnDate = searchParams.get('return_date') || '';
  const valid = validId(values.departure_airport_id)
    && validId(values.arrival_airport_id)
    && values.departure_airport_id !== values.arrival_airport_id
    && /^\d{4}-\d{2}-\d{2}$/.test(values.departure_date)
    && Number.isInteger(Number(values.min_seats)) && Number(values.min_seats) >= 1
    && Number.isInteger(Number(values.page)) && Number(values.page) >= 1
    && Number.isInteger(Number(values.limit)) && Number(values.limit) >= 1
    && (tripType === 'one_way' || (/^\d{4}-\d{2}-\d{2}$/.test(returnDate) && returnDate >= values.departure_date));
  const [result, setResult] = useState({ data: [], pagination: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.searchFlights(values);
      setResult({ data: response?.data || [], pagination: response?.pagination || null });
    } catch (requestError) {
      setError(requestError.message || 'Không thể tải chuyến bay. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [api, valid, values]);

  useEffect(() => { void load(); }, [load]);
  const changePage = (page) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('page', String(page));
    return next;
  });

  return (
    <div className="public-page results-page">
      <AppHeader />
      <main className="results-main">
        <Link className="back-link" to="/">← Chỉnh sửa tìm kiếm</Link>
        <header className="results-heading"><span className="eyebrow">Hành trình của bạn</span><h1>Chuyến bay phù hợp</h1><p>{values.departure_date ? formatDay(values.departure_date) : 'Chưa chọn ngày'} · {tripType === 'one_way' ? 'Một chiều' : `Khứ hồi${returnDate ? ` · về ${formatDay(returnDate)}` : ''}`} · {values.min_seats} hành khách</p></header>
        {!valid ? <section className="search-state surface-card" role="alert"><h2>Thông tin tìm kiếm chưa đầy đủ</h2><p>Quay lại trang chủ và chọn điểm đi, điểm đến cùng ngày khởi hành hợp lệ.</p><Link className="button button-primary" to="/">Tìm chuyến bay</Link></section> : null}
        {loading ? <LoadingView label="Đang tìm chuyến bay…" /> : null}
        {error ? <section className="search-state surface-card" role="alert"><h2>Chưa tải được kết quả</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => void load()}>Thử lại</button></section> : null}
        {valid && !loading && !error ? <>
          <section className="results-summary"><span>{result.pagination?.total ?? result.data.length} chuyến bay</span><span>Sắp xếp theo giờ khởi hành</span></section>
          {result.data.length ? <div className="flight-results-list">{result.data.map((flight) => <FlightCard key={flight.id} flight={flight} />)}</div> : <section className="search-state surface-card"><span className="empty-mark" aria-hidden="true">✦</span><h2>Không có chuyến bay phù hợp</h2><p>Thử đổi ngày bay, điểm đến hoặc số hành khách để tìm lựa chọn khác.</p><Link className="button button-outline" to="/">Sửa tiêu chí tìm kiếm</Link></section>}
          <Pagination page={Number(result.pagination?.page || values.page)} totalPages={Number(result.pagination?.totalPages || 1)} onPageChange={changePage} />
        </> : null}
      </main>
      <footer className="site-footer"><span>Serene Flightways</span><span>Giờ bay hiển thị theo giờ địa phương.</span></footer>
    </div>
  );
}
