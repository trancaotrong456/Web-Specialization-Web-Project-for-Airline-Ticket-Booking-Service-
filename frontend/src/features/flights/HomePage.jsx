import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AirportCombobox } from './AirportCombobox';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';
import { findNearestSupportedAirport, MAX_GEOLOCATION_ACCURACY_METERS } from './airportCoordinates';

const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const destinations = [
  { code: 'HAN', city: 'Hà Nội', note: 'Văn hoá và nhịp sống thủ đô', image: '/images/destinations/hanoi.jpg' },
  { code: 'SGN', city: 'TP. Hồ Chí Minh', note: 'Khám phá thành phố không ngủ', image: '/images/destinations/ho-chi-minh-city.jpg' },
  { code: 'DAD', city: 'Đà Nẵng', note: 'Biển xanh và những cây cầu', image: '/images/destinations/da-nang.jpg' },
];

const getCurrentPosition = (geolocation) => new Promise((resolve, reject) => {
  if (!geolocation?.getCurrentPosition) {
    reject(new Error('GPS_UNAVAILABLE'));
    return;
  }
  geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 0,
  });
});

const readAirportPage = (result) => {
  if (!Array.isArray(result?.data) || !result.pagination) throw new Error('AIRPORT_DATA_UNAVAILABLE');
  const { totalPages, page } = result.pagination;
  if (!Number.isInteger(Number(totalPages)) || Number(totalPages) < 1 || Number(page) < 1) {
    throw new Error('AIRPORT_DATA_UNAVAILABLE');
  }
  return { airports: result.data, totalPages: Number(totalPages) };
};

export function HomePage() {
  const { request } = useAuth();
  const api = useMemo(() => createFlightDiscoveryApi(request), [request]);
  const searchAirports = useCallback((params) => api.searchAirports(params), [api]);
  const navigate = useNavigate();
  const [airports, setAirports] = useState([]);
  const [airportLoading, setAirportLoading] = useState(true);
  const [airportError, setAirportError] = useState('');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [activeAirportField, setActiveAirportField] = useState(null);
  const [departureDate, setDepartureDate] = useState(todayLocal());
  const [passengers, setPassengers] = useState('1');
  const [error, setError] = useState('');
  const [destinationSuggestionStatus, setDestinationSuggestionStatus] = useState('');
  const [focusOriginAfterDestination, setFocusOriginAfterDestination] = useState(false);
  const searchFormRef = useRef(null);
  const destinationLookupRequest = useRef(0);
  const originRef = useRef(null);
  const departureDateRef = useRef(departureDate);
  const passengersRef = useRef(passengers);
  const cancelDestinationSuggestion = () => {
    destinationLookupRequest.current += 1;
    setDestinationSuggestionStatus('');
  };
  const openOriginAirport = useCallback((open) => {
    if (open) {
      destinationLookupRequest.current += 1;
      setDestinationSuggestionStatus('');
    }
    setActiveAirportField(open ? 'origin' : null);
  }, []);
  const openDestinationAirport = useCallback((open) => {
    if (open) {
      destinationLookupRequest.current += 1;
      setDestinationSuggestionStatus('');
    }
    setActiveAirportField(open ? 'destination' : null);
  }, []);

  useEffect(() => {
    let active = true;
    api.searchAirports({ page: 1, limit: 20 }).then((result) => {
      if (active) setAirports(result?.data || []);
    }).catch(() => {
      if (active) setAirportError('Chưa tải được danh sách sân bay. Bạn vẫn có thể nhập để tìm.');
    }).finally(() => { if (active) setAirportLoading(false); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!focusOriginAfterDestination) return;
    document.getElementById('origin-airport')?.focus({ preventScroll: true });
    setFocusOriginAfterDestination(false);
  }, [focusOriginAfterDestination]);

  const swapAirports = () => {
    cancelDestinationSuggestion();
    setOrigin(destination);
    originRef.current = destination;
    setDestination(origin);
    setActiveAirportField(null);
  };

  const chooseSuggestedDestination = async (place) => {
    const requestId = ++destinationLookupRequest.current;
    let selectedAirport = null;
    setError('');
    setDestinationSuggestionStatus('Đang tra cứu sân bay điểm đến…');
    setActiveAirportField(null);
    searchFormRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });

    try {
      const result = await searchAirports({ page: 1, limit: 20, search: place.code });
      const matches = Array.isArray(result) ? result : result?.data;
      const airport = Array.isArray(matches)
        ? matches.find((item) => String(item?.iata_code || '').trim().toUpperCase() === place.code)
        : null;

      if (requestId !== destinationLookupRequest.current) return;
      if (!airport) {
        setError(`Không tìm thấy sân bay ${place.code} trong dữ liệu hiện có.`);
        setDestinationSuggestionStatus('');
        return;
      }
      selectedAirport = airport;

      setDestination(airport);
      setDestinationSuggestionStatus('Đang xác định sân bay khởi hành gần bạn…');

      const position = await getCurrentPosition(navigator.geolocation);
      if (requestId !== destinationLookupRequest.current) return;
      if (Number(position?.coords?.accuracy) > MAX_GEOLOCATION_ACCURACY_METERS) {
        throw new Error('GPS_INACCURATE');
      }

      setDestinationSuggestionStatus('Đang tra cứu các sân bay phù hợp…');
      const firstPageResult = await searchAirports({ page: 1, limit: 100 });
      const firstPage = readAirportPage(firstPageResult);
      const pages = await Promise.all(Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
        searchAirports({ page: index + 2, limit: 100 }).then(readAirportPage)));
      if (requestId !== destinationLookupRequest.current) return;
      const airportRecords = [firstPage.airports, ...pages.map((pageResult) => pageResult.airports)].flat();
      const nearest = findNearestSupportedAirport(position, airportRecords);
      if (!nearest) throw new Error('NO_NEARBY_AIRPORT');

      if (String(nearest.airport.id) === String(airport.id)) {
        if (originRef.current?.id === airport.id) {
          originRef.current = null;
          setOrigin(null);
        }
        throw new Error('SAME_AIRPORT');
      }

      originRef.current = nearest.airport;
      setOrigin(nearest.airport);
      setDestinationSuggestionStatus('');
      const nextDate = departureDateRef.current;
      const nextPassengerCount = Number(passengersRef.current);
      if (!nextDate || nextDate < todayLocal()) {
        setError('Ngày khởi hành không hợp lệ. Vui lòng chọn lại ngày trước khi tìm chuyến bay.');
        setFocusOriginAfterDestination(true);
        return;
      }
      if (!Number.isInteger(nextPassengerCount) || nextPassengerCount < 1) {
        setError('Số hành khách không hợp lệ. Vui lòng kiểm tra trước khi tìm chuyến bay.');
        setFocusOriginAfterDestination(true);
        return;
      }

      const params = new URLSearchParams({
        departure_airport_id: String(nearest.airport.id),
        arrival_airport_id: String(airport.id),
        departure_date: nextDate,
        min_seats: String(nextPassengerCount),
        page: '1',
        limit: '20',
      });
      navigate(`/flights/search?${params.toString()}`);
    } catch (_lookupError) {
      if (requestId !== destinationLookupRequest.current) return;
      setDestinationSuggestionStatus('');
      const selectedDestination = selectedAirport;
      if (selectedDestination && originRef.current?.id === selectedDestination.id) {
        originRef.current = null;
        setOrigin(null);
      }
      const messages = {
        GPS_UNAVAILABLE: 'Vị trí không khả dụng. Điểm đến đã được chọn; hãy chọn điểm đi trong biểu mẫu.',
        GPS_INACCURATE: 'Vị trí chưa đủ chính xác để gợi ý sân bay. Điểm đến đã được chọn; hãy chọn điểm đi trong biểu mẫu.',
        SAME_AIRPORT: 'Sân bay gần vị trí của bạn trùng điểm đến. Hãy chọn một điểm đi khác trong biểu mẫu.',
        NO_NEARBY_AIRPORT: 'Không tìm thấy sân bay phù hợp gần vị trí của bạn. Điểm đến đã được chọn; hãy chọn điểm đi trong biểu mẫu.',
        AIRPORT_DATA_UNAVAILABLE: 'Không thể xác định sân bay từ dữ liệu API. Điểm đến đã được chọn; hãy chọn điểm đi trong biểu mẫu.',
      };
      const reason = _lookupError?.code === 1 || _lookupError?.message === 'GPS_UNAVAILABLE'
        ? 'GPS_UNAVAILABLE'
        : _lookupError?.message;
      const genericFallback = selectedAirport
        ? 'Không thể xác định sân bay gần bạn. Điểm đến đã được chọn; hãy chọn điểm đi trong biểu mẫu.'
        : 'Không thể xác nhận sân bay từ API. Hãy chọn điểm đi và điểm đến trong biểu mẫu.';
      setError(messages[reason] || genericFallback);
      setFocusOriginAfterDestination(true);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    cancelDestinationSuggestion();
    if (!origin || !destination) return setError('Chọn điểm đi và điểm đến để tiếp tục.');
    if (origin.id === destination.id) return setError('Điểm đi và điểm đến phải khác nhau.');
    if (!departureDate || departureDate < todayLocal()) return setError('Ngày khởi hành không được ở quá khứ.');
    const count = Number(passengers);
    if (!Number.isInteger(count) || count < 1) return setError('Số hành khách phải từ 1 trở lên.');
    const params = new URLSearchParams({
      departure_airport_id: String(origin.id),
      arrival_airport_id: String(destination.id),
      departure_date: departureDate,
      min_seats: String(count),
      page: '1',
      limit: '20',
    });
    navigate(`/flights/search?${params.toString()}`);
  };

  return (
    <div className="public-page home-page">
      <AppHeader />
      <main>
        <section className="home-hero home-hero--full-bleed">
          <div className="home-hero-inner">
            <div className="home-copy">
              <span className="eyebrow home-eyebrow">Mỗi hành trình, một câu chuyện</span>
              <h1>Bay đến nơi<br /><em>bạn muốn thuộc về.</em></h1>
              <p>Tìm chuyến bay phù hợp và bắt đầu lên kế hoạch cho chặng đường tiếp theo.</p>
              <div className="hero-route"><span className="hero-route-icon" aria-hidden="true">✈</span><span>Một chiều · Linh hoạt theo kế hoạch của bạn</span></div>
            </div>
            <div className="hero-sunrise" aria-hidden="true"><span className="sun-disc" /><span className="wing-shape" /></div>
          </div>
          <div className="search-card-wrap">
            <form className="flight-search-card" ref={searchFormRef} onSubmit={submit} noValidate>
              <div className="search-card-heading">
                <div><span className="eyebrow">Lên kế hoạch · Một chiều</span><h2>Tìm chuyến bay</h2></div>
                <p className="one-way-note" role="note">Hiện hỗ trợ tìm hành trình một chiều.</p>
              </div>
              <div className="search-route-row">
                <AirportCombobox id="origin-airport" peerId="destination-airport" coveredActionId="swap-airports" label="Điểm đi" value={origin} onChange={(airport) => { cancelDestinationSuggestion(); originRef.current = airport; setOrigin(airport); }} open={activeAirportField === 'origin'} onOpenChange={openOriginAirport} searchAirports={searchAirports} initialAirports={airports} placeholder="Thành phố hoặc sân bay" />
                <button id="swap-airports" className="swap-airports" type="button" aria-label="Đổi điểm đi và điểm đến" onClick={swapAirports}>↔</button>
                <AirportCombobox id="destination-airport" peerId="origin-airport" coveredActionId="swap-airports" label="Điểm đến" value={destination} onChange={(airport) => { cancelDestinationSuggestion(); setDestination(airport); }} open={activeAirportField === 'destination'} onOpenChange={openDestinationAirport} searchAirports={searchAirports} initialAirports={airports} placeholder="Thành phố hoặc sân bay" />
              </div>
              <div className="search-details-row">
                <label className="airport-field"><span>Ngày khởi hành</span><input aria-label="Departure date" type="date" min={todayLocal()} value={departureDate} onChange={(event) => { departureDateRef.current = event.target.value; setDepartureDate(event.target.value); }} /></label>
                <div className="one-way-note">Chọn sân bay đi, sân bay đến và ngày khởi hành.</div>
                <label className="airport-field passenger-field"><span>Hành khách</span><input aria-label="Passengers" type="number" min="1" step="1" value={passengers} onChange={(event) => { passengersRef.current = event.target.value; setPassengers(event.target.value); }} /></label>
                <button className="button button-secondary search-submit" type="submit">Tìm chuyến bay <span aria-hidden="true">→</span></button>
              </div>
              {airportLoading ? <p className="search-help" role="status">Đang tải sân bay…</p> : null}
              {airportError ? <p className="search-help" role="status">{airportError}</p> : null}
              {destinationSuggestionStatus ? <p className="search-help" role="status" aria-live="polite">{destinationSuggestionStatus}</p> : null}
              {error ? <p className="search-error" role="alert">{error}</p> : null}
            </form>
          </div>
        </section>

        <section className="destination-section" aria-labelledby="destinations-heading">
          <div className="section-heading"><div><span className="eyebrow">Gợi ý hành trình</span><h2 id="destinations-heading">Khám phá các điểm đến</h2></div><p>Một vài thành phố để bạn bắt đầu lên kế hoạch.</p></div>
          <div className="destination-list">{destinations.map((place, index) => <button className={`destination-card destination-card-${index + 1}`} type="button" key={place.code} aria-label={`Tìm chuyến bay đến ${place.city} (${place.code})`} onClick={() => chooseSuggestedDestination(place)}><div className="destination-art" style={{ backgroundImage: `url("${place.image}")` }} aria-hidden="true"><span>{place.code}</span></div><div><span className="destination-code">{place.code} · VIỆT NAM</span><h3>{place.city}</h3><p>{place.note}</p></div></button>)}</div>
        </section>
        <section className="home-note"><span className="note-mark" aria-hidden="true">✦</span><div><h2>Hành trình tốt bắt đầu từ lựa chọn phù hợp.</h2><p>So sánh giờ bay, chỗ còn trống và hạng vé để tìm chuyến đi hợp với kế hoạch của bạn.</p></div></section>
      </main>
      <footer className="site-footer"><span>Serene Flightways</span><span>Chúc bạn có một hành trình đáng nhớ.</span></footer>
    </div>
  );
}
