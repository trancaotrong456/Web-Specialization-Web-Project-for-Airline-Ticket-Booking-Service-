import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AirportCombobox } from './AirportCombobox';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';

const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const destinations = [
  { code: 'HAN', city: 'Hà Nội', note: 'Văn hoá và nhịp sống thủ đô' },
  { code: 'SGN', city: 'TP. Hồ Chí Minh', note: 'Khám phá thành phố không ngủ' },
  { code: 'DAD', city: 'Đà Nẵng', note: 'Biển xanh và những cây cầu' },
];

export function HomePage() {
  const { request } = useAuth();
  const api = useMemo(() => createFlightDiscoveryApi(request), [request]);
  const searchAirports = useCallback((params) => api.searchAirports(params), [api]);
  const navigate = useNavigate();
  const [airports, setAirports] = useState([]);
  const [airportLoading, setAirportLoading] = useState(true);
  const [airportError, setAirportError] = useState('');
  const [tripType, setTripType] = useState('round_trip');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [departureDate, setDepartureDate] = useState(todayLocal());
  const [returnDate, setReturnDate] = useState('');
  const [passengers, setPassengers] = useState('1');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.searchAirports({ page: 1, limit: 20 }).then((result) => {
      if (active) setAirports(result?.data || []);
    }).catch(() => {
      if (active) setAirportError('Chưa tải được danh sách sân bay. Bạn vẫn có thể nhập để tìm.');
    }).finally(() => { if (active) setAirportLoading(false); });
    return () => { active = false; };
  }, [api]);

  const swapAirports = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!origin || !destination) return setError('Chọn điểm đi và điểm đến để tiếp tục.');
    if (origin.id === destination.id) return setError('Điểm đi và điểm đến phải khác nhau.');
    if (!departureDate || departureDate < todayLocal()) return setError('Ngày khởi hành không được ở quá khứ.');
    if (tripType === 'round_trip' && (!returnDate || returnDate < departureDate)) return setError('Ngày về phải bằng hoặc sau ngày khởi hành.');
    const count = Number(passengers);
    if (!Number.isInteger(count) || count < 1) return setError('Số hành khách phải từ 1 trở lên.');
    const params = new URLSearchParams({
      departure_airport_id: String(origin.id),
      arrival_airport_id: String(destination.id),
      departure_date: departureDate,
      min_seats: String(count),
      page: '1',
      limit: '20',
      trip_type: tripType,
    });
    if (tripType === 'round_trip') params.set('return_date', returnDate);
    navigate(`/flights/search?${params.toString()}`);
  };

  return (
    <div className="public-page home-page">
      <AppHeader />
      <main>
        <section className="home-hero">
          <div className="home-hero-inner">
            <div className="home-copy">
              <span className="eyebrow home-eyebrow">Mỗi hành trình, một câu chuyện</span>
              <h1>Bay đến nơi<br /><em>bạn muốn thuộc về.</em></h1>
              <p>Tìm chuyến bay phù hợp và bắt đầu lên kế hoạch cho chặng đường tiếp theo.</p>
              <div className="hero-route" aria-hidden="true"><span>HAN</span><i>✈</i><span>SGN</span><small>Việt Nam · kết nối dễ dàng</small></div>
            </div>
            <div className="hero-sunrise" aria-hidden="true"><span className="sun-disc" /><span className="wing-shape" /></div>
          </div>
          <div className="search-card-wrap">
            <form className="flight-search-card" onSubmit={submit} noValidate>
              <div className="search-card-heading">
                <div><span className="eyebrow">Lên kế hoạch</span><h2>Tìm chuyến bay</h2></div>
                <div className="trip-switch" role="radiogroup" aria-label="Trip type">
                  <label><input type="radio" name="tripType" value="round_trip" checked={tripType === 'round_trip'} onChange={() => setTripType('round_trip')} />Khứ hồi</label>
                  <label><input type="radio" name="tripType" value="one_way" checked={tripType === 'one_way'} onChange={() => setTripType('one_way')} />Một chiều</label>
                </div>
              </div>
              <div className="search-route-row">
                <AirportCombobox id="origin-airport" label="Điểm đi" value={origin} onChange={setOrigin} searchAirports={searchAirports} initialAirports={airports} placeholder="Thành phố hoặc sân bay" />
                <button className="swap-airports" type="button" aria-label="Đổi điểm đi và điểm đến" onClick={swapAirports}>↔</button>
                <AirportCombobox id="destination-airport" label="Điểm đến" value={destination} onChange={setDestination} searchAirports={searchAirports} initialAirports={airports} placeholder="Thành phố hoặc sân bay" />
              </div>
              <div className="search-details-row">
                <label className="airport-field"><span>Ngày khởi hành</span><input aria-label="Departure date" type="date" min={todayLocal()} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
                {tripType === 'round_trip' ? <label className="airport-field"><span>Ngày về</span><input aria-label="Return date" type="date" min={departureDate || todayLocal()} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label> : <div className="one-way-note">Linh hoạt lịch trình, chỉ chọn ngày đi.</div>}
                <label className="airport-field passenger-field"><span>Hành khách</span><input aria-label="Passengers" type="number" min="1" step="1" value={passengers} onChange={(event) => setPassengers(event.target.value)} /></label>
                <button className="button button-secondary search-submit" type="submit">Tìm chuyến bay <span aria-hidden="true">→</span></button>
              </div>
              {airportLoading ? <p className="search-help" role="status">Đang tải sân bay…</p> : null}
              {airportError ? <p className="search-help" role="status">{airportError}</p> : null}
              {error ? <p className="search-error" role="alert">{error}</p> : null}
            </form>
          </div>
        </section>

        <section className="destination-section" aria-labelledby="destinations-heading">
          <div className="section-heading"><div><span className="eyebrow">Gợi ý hành trình</span><h2 id="destinations-heading">Điểm đến được yêu thích</h2></div><p>Khám phá những thành phố đang chờ bạn.</p></div>
          <div className="destination-list">{destinations.map((place, index) => <article className={`destination-card destination-card-${index + 1}`} key={place.code}><div className="destination-art" aria-hidden="true"><span>{place.code}</span></div><div><span className="destination-code">{place.code} · VIỆT NAM</span><h3>{place.city}</h3><p>{place.note}</p></div></article>)}</div>
        </section>
        <section className="home-note"><span className="note-mark" aria-hidden="true">✦</span><div><h2>Hành trình tốt bắt đầu từ lựa chọn phù hợp.</h2><p>So sánh giờ bay, chỗ còn trống và hạng vé để tìm chuyến đi hợp với kế hoạch của bạn.</p></div></section>
      </main>
      <footer className="site-footer"><span>Serene Flightways</span><span>Chúc bạn có một hành trình đáng nhớ.</span></footer>
    </div>
  );
}
