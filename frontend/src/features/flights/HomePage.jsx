import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AirportCombobox } from './AirportCombobox';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';
import { findNearestSupportedAirport, MAX_GEOLOCATION_ACCURACY_METERS } from './airportCoordinates';

const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatWeekday = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[d.getDay()];
};

const destinations = [
  {
    code: 'DAD',
    city: 'Đà Nẵng',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Miền Trung',
    note: 'Thành phố của những cây cầu, bãi cát thoai thoải và di sản miền Trung.',
    image: '/images/destinations/da-nang.jpg',
  },
  {
    code: 'PQC',
    city: 'Phú Quốc',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Đảo ngọc',
    note: 'Đảo ngọc biển xanh ngọc bích, hoàng hôn rực rỡ và ẩm thực hải sản phong phú.',
    image: '/images/destinations/phu-quoc.jpg',
  },
  {
    code: 'CXR',
    city: 'Nha Trang',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: null,
    note: 'Vịnh biển thiên đường nhiệt đới, lặn ngắm san hô và khu nghỉ dưỡng tĩnh tại.',
    image: '/images/destinations/nha-trang.jpg',
  },
  {
    code: 'NRT',
    city: 'Tokyo Narita',
    country: 'NHẬT BẢN',
    tag: 'international',
    badge: 'Quốc tế',
    note: 'Khám phá đại lộ hoa anh đào, ẩm thực tinh hoa Kaiseki và nhịp đập Tokyo đương đại.',
    image: '/images/destinations/tokyo.jpg',
  },
  {
    code: 'HAN',
    city: 'Hà Nội',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Thủ đô di sản',
    note: 'Văn hoá ngàn năm, phố cổ trầm mặc và phong vị ẩm thực thanh nhã.',
    image: '/images/destinations/hanoi.jpg',
  },
  {
    code: 'SGN',
    city: 'TP. Hồ Chí Minh',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Đô thị phồn hoa',
    note: 'Nhịp sống sôi động, trung tâm kinh tế và điểm giao thoa ẩm thực bốn phương.',
    image: '/images/destinations/ho-chi-minh-city.jpg',
  },
];

const tripModeOptions = [
  ['round_trip', 'Khứ hồi'],
  ['one_way', 'Một chiều'],
  ['multi_city', 'Nhiều chặng'],
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
  const [returnDate, setReturnDate] = useState('');
  const [tripType, setTripType] = useState('one_way');
  const [itineraryLegs, setItineraryLegs] = useState(() => [
    { id: 1, origin: null, destination: null, date: todayLocal() },
    { id: 2, origin: null, destination: null, date: '' },
  ]);
  const [passengers, setPassengers] = useState('1');
  const [airlineId, setAirlineId] = useState('');
  const [airlines, setAirlines] = useState([]);
  const [airlineLoading, setAirlineLoading] = useState(true);
  const [airlineError, setAirlineError] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [error, setError] = useState('');
  const [destinationSuggestionStatus, setDestinationSuggestionStatus] = useState('');
  const [focusOriginAfterDestination, setFocusOriginAfterDestination] = useState(false);
  const searchFormRef = useRef(null);
  const destinationLookupRequest = useRef(0);
  const originRef = useRef(null);
  const departureDateRef = useRef(departureDate);
  const passengersRef = useRef(passengers);
  const nextLegId = useRef(3);

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
    let active = true;
    api.searchAirlines({ page: 1, limit: 100 }).then((result) => {
      if (!Array.isArray(result?.data)) throw new Error('AIRLINE_DATA_UNAVAILABLE');
      if (active) setAirlines(result.data);
    }).catch(() => {
      if (active) setAirlineError('Chưa tải được danh sách hãng bay. Bạn vẫn có thể tìm tất cả hãng.');
    }).finally(() => { if (active) setAirlineLoading(false); });
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

  const updateLeg = (legId, updates) => {
    setItineraryLegs((current) => current.map((leg) => leg.id === legId ? { ...leg, ...updates } : leg));
  };

  const addItineraryLeg = () => {
    setItineraryLegs((current) => {
      if (current.length >= 4) return current;
      return [...current, { id: nextLegId.current++, origin: null, destination: null, date: '' }];
    });
  };

  const removeItineraryLeg = (legId) => {
    setItineraryLegs((current) => current.length <= 2 ? current : current.filter((leg) => leg.id !== legId));
    if (String(activeAirportField || '').startsWith(`leg-${legId}-`)) setActiveAirportField(null);
  };

  const selectTripType = (nextType) => {
    setError('');
    cancelDestinationSuggestion();
    setActiveAirportField(null);
    setTripType(nextType);
  };

  const handleTripModeTabKeyDown = (event, currentIndex) => {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tripModeOptions.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tripModeOptions.length) % tripModeOptions.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tripModeOptions.length - 1;
    else return;

    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    selectTripType(tripModeOptions[nextIndex][0]);
    tabs?.[nextIndex]?.focus();
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
        ...(airlineId ? { airline_id: airlineId } : {}),
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
    const count = Number(passengers);
    if (!Number.isInteger(count) || count < 1) return setError('Số hành khách phải từ 1 trở lên.');

    if (tripType === 'multi_city') {
      if (itineraryLegs.some((leg) => !leg.origin || !leg.destination || !leg.date)) {
        return setError('Vui lòng chọn sân bay đi, sân bay đến và ngày bay cho từng chặng.');
      }
      if (itineraryLegs.some((leg) => String(leg.origin.id) === String(leg.destination.id))) {
        return setError('Điểm đi và điểm đến phải khác nhau trong từng chặng.');
      }
      if (itineraryLegs.some((leg) => leg.date < todayLocal())) {
        return setError('Ngày khởi hành của mỗi chặng không được ở quá khứ.');
      }
      if (itineraryLegs.some((leg, index) => index > 0 && leg.date < itineraryLegs[index - 1].date)) {
        return setError('Ngày của các chặng phải theo thứ tự thời gian.');
      }
      const params = new URLSearchParams({
        trip_type: 'multi_city',
        passengers: String(count),
        legs: JSON.stringify(itineraryLegs.map((leg) => ({
          departure_airport_id: String(leg.origin.id),
          arrival_airport_id: String(leg.destination.id),
          departure_date: leg.date,
        }))),
        ...(airlineId ? { airline_id: airlineId } : {}),
      });
      navigate(`/flights/search?${params.toString()}`);
      return;
    }

    if (!origin || !destination) return setError('Chọn điểm đi và điểm đến để tiếp tục.');
    if (origin.id === destination.id) return setError('Điểm đi và điểm đến phải khác nhau.');
    if (!departureDate || departureDate < todayLocal()) return setError('Ngày khởi hành không được ở quá khứ.');

    if (tripType === 'round_trip') {
      if (!returnDate) return setError('Chọn ngày về để tìm chuyến khứ hồi.');
      if (returnDate < departureDate) return setError('Ngày về phải từ ngày khởi hành trở đi.');
      const params = new URLSearchParams({
        trip_type: 'round_trip',
        passengers: String(count),
        legs: JSON.stringify([
          { departure_airport_id: String(origin.id), arrival_airport_id: String(destination.id), departure_date: departureDate },
          { departure_airport_id: String(destination.id), arrival_airport_id: String(origin.id), departure_date: returnDate },
        ]),
        ...(airlineId ? { airline_id: airlineId } : {}),
      });
      navigate(`/flights/search?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({
      departure_airport_id: String(origin.id),
      arrival_airport_id: String(destination.id),
      departure_date: departureDate,
      min_seats: String(count),
      ...(airlineId ? { airline_id: airlineId } : {}),
      page: '1',
      limit: '20',
    });
    navigate(`/flights/search?${params.toString()}`);
  };

  const filteredDestinations = destinationFilter === 'all'
    ? destinations
    : destinations.filter((item) => item.tag === destinationFilter);

  return (
    <div className="public-page home-page">
      <AppHeader />
      <main>
        {/* HERO SECTION */}
        <section className="home-hero home-hero--full-bleed">
          <div className="home-hero-inner">
            <div className="home-copy">
              <div className="luxury-badge-pill" role="note">
                <span className="badge-glow-dot" aria-hidden="true" />
                <span>✦ HÃNG HÀNG KHÔNG THẾ HỆ MỚI CHÂU Á</span>
              </div>
              <h1 className="home-hero-headline">
                <span className="headline-lead">Trải Nghiệm Đẳng Cấp</span>
                <span className="headline-main">Trên Mỗi Chuyến <em>Bay</em></span>
                <span className="headline-tagline">Bay đến nơi <em>bạn muốn thuộc về.</em></span>
              </h1>
              <p className="hero-description">
                Kết nối Hà Nội, TP. Hồ Chí Minh, Đà Nẵng và những trung tâm phồn hoa châu lục với sự an yên tĩnh lặng, ẩm thực tinh hoa cùng lòng hiếu khách thuần khiết Việt Nam.
              </p>
              <div className="hero-stats-row" aria-label="Công cụ tìm chuyến bay">
                <div className="hero-stat-pill">
                  <span className="stat-icon" aria-hidden="true">✈</span>
                  <div className="stat-text">
                    <strong>Chọn hành trình</strong>
                    <small>Tra cứu theo sân bay</small>
                  </div>
                </div>
                <div className="hero-stat-pill">
                  <span className="stat-icon" aria-hidden="true">◷</span>
                  <div className="stat-text">
                    <strong>Chọn ngày bay</strong>
                    <small>Xem lịch bay hiện có</small>
                  </div>
                </div>
                <div className="hero-stat-pill">
                  <span className="stat-icon" aria-hidden="true">▤</span>
                  <div className="stat-text">
                    <strong>So sánh lựa chọn</strong>
                    <small>Chuyến bay và hạng vé</small>
                  </div>
                </div>
              </div>
              <div className="hero-route">
                <span className="hero-route-icon" aria-hidden="true">✈</span>
                <span>{tripType === 'round_trip' ? 'Khứ hồi · Lượt đi và lượt về trong cùng hành trình' : tripType === 'multi_city' ? 'Nhiều chặng · Tự sắp xếp hành trình của bạn' : 'Một chiều · Linh hoạt theo kế hoạch của bạn'}</span>
              </div>
            </div>
            <div className="hero-sunrise" aria-hidden="true">
              <span className="sun-disc" />
              <span className="wing-shape" />
            </div>
          </div>

          {/* SEARCH FORM CARD */}
          <div className="search-card-wrap">
            <form id="flight-search-form" className="flight-search-card" ref={searchFormRef} onSubmit={submit} noValidate>
              <div className="search-card-header-bar">
                <div className="trip-type-tabs" role="tablist" aria-label="Loại hành trình">
                  {tripModeOptions.map(([type, label], index) => (
                    <button
                      key={type}
                      id={`trip-tab-${type}`}
                      className={`trip-type-tab${tripType === type ? ' is-active' : ''}`}
                      type="button"
                      role="tab"
                      aria-selected={tripType === type}
                      aria-controls="trip-search-panel"
                      tabIndex={tripType === type ? 0 : -1}
                      onKeyDown={(event) => handleTripModeTabKeyDown(event, index)}
                      onClick={() => selectTripType(type)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="search-card-context">Hãng bay hiển thị theo chuyến có trong kết quả</p>
              </div>

              <div id="trip-search-panel" role="tabpanel" aria-labelledby={`trip-tab-${tripType}`}>
              {tripType === 'multi_city' ? (
                <section className="multi-city-itinerary" aria-label="Các chặng trong hành trình">
                  {itineraryLegs.map((leg, index) => {
                    const previousDate = index > 0 ? itineraryLegs[index - 1].date : todayLocal();
                    const originFieldId = `multi-leg-${leg.id}-origin`;
                    const destinationFieldId = `multi-leg-${leg.id}-destination`;
                    return (
                      <fieldset className="multi-city-leg" key={leg.id} aria-label={`Chặng ${index + 1}`}>
                        <legend><span className="leg-number">{String(index + 1).padStart(2, '0')}</span> Chặng {index + 1}</legend>
                        <div className="multi-city-leg-row">
                          <AirportCombobox
                            id={originFieldId}
                            peerId={destinationFieldId}
                            label="Điểm đi"
                            value={leg.origin}
                            onChange={(airport) => updateLeg(leg.id, { origin: airport })}
                            open={activeAirportField === `leg-${leg.id}-origin`}
                            onOpenChange={(open) => setActiveAirportField(open ? `leg-${leg.id}-origin` : null)}
                            searchAirports={searchAirports}
                            initialAirports={airports}
                            placeholder="Chọn sân bay khởi hành"
                          />
                          <button
                            className="swap-airports multi-leg-swap"
                            type="button"
                            aria-label={`Đổi điểm đi và điểm đến chặng ${index + 1}`}
                            onClick={() => updateLeg(leg.id, { origin: leg.destination, destination: leg.origin })}
                          >⇄</button>
                          <AirportCombobox
                            id={destinationFieldId}
                            peerId={originFieldId}
                            label="Điểm đến"
                            value={leg.destination}
                            onChange={(airport) => updateLeg(leg.id, { destination: airport })}
                            open={activeAirportField === `leg-${leg.id}-destination`}
                            onOpenChange={(open) => setActiveAirportField(open ? `leg-${leg.id}-destination` : null)}
                            searchAirports={searchAirports}
                            initialAirports={airports}
                            placeholder="Chọn sân bay đến"
                          />
                          <label className="airport-field search-detail-field multi-leg-date">
                            <span>Ngày khởi hành</span>
                            <input
                              aria-label={`Ngày khởi hành chặng ${index + 1}`}
                              type="date"
                              min={previousDate || todayLocal()}
                              value={leg.date}
                              onChange={(event) => updateLeg(leg.id, { date: event.target.value })}
                            />
                            <small>{formatWeekday(leg.date) || (index ? 'Sau ngày chặng trước' : 'Chọn ngày khởi hành')}</small>
                          </label>
                          <button
                            className="remove-itinerary-leg"
                            type="button"
                            aria-label={`Xóa chặng ${index + 1}`}
                            disabled={itineraryLegs.length <= 2}
                            onClick={() => removeItineraryLeg(leg.id)}
                          >×</button>
                        </div>
                      </fieldset>
                    );
                  })}
                  <div className="multi-city-actions">
                    <p>Hành trình gồm {itineraryLegs.length}/4 chặng tối đa.</p>
                    <button type="button" className="add-itinerary-leg" onClick={addItineraryLeg} disabled={itineraryLegs.length >= 4}>
                      <span aria-hidden="true">＋</span> Thêm chặng
                    </button>
                  </div>
                </section>
              ) : (
              <div className="search-route-row">
                <AirportCombobox
                  id="origin-airport"
                  peerId="destination-airport"
                  coveredActionId="swap-airports"
                  label="Điểm đi"
                  value={origin}
                  onChange={(airport) => { cancelDestinationSuggestion(); originRef.current = airport; setOrigin(airport); }}
                  open={activeAirportField === 'origin'}
                  onOpenChange={openOriginAirport}
                  searchAirports={searchAirports}
                  initialAirports={airports}
                  placeholder="Thành phố hoặc sân bay"
                />
                <button
                  id="swap-airports"
                  className="swap-airports"
                  type="button"
                  aria-label="Đổi điểm đi và điểm đến"
                  onClick={swapAirports}
                  title="Đổi chiều bay"
                >
                  ⇄
                </button>
                <AirportCombobox
                  id="destination-airport"
                  peerId="origin-airport"
                  coveredActionId="swap-airports"
                  label="Điểm đến"
                  value={destination}
                  onChange={(airport) => { cancelDestinationSuggestion(); setDestination(airport); }}
                  open={activeAirportField === 'destination'}
                  onOpenChange={openDestinationAirport}
                  searchAirports={searchAirports}
                  initialAirports={airports}
                  placeholder="Thành phố hoặc sân bay"
                />
              </div>
              )}

              <div className={`search-details-row search-details-row--${tripType}`}>
                <label className="airport-field search-detail-field airline-field">
                  <span>Hãng hàng không</span>
                  <select
                    aria-label="Hãng hàng không"
                    value={airlineId}
                    onChange={(event) => setAirlineId(event.target.value)}
                    disabled={airlineLoading || Boolean(airlineError)}
                  >
                    <option value="">Tất cả hãng</option>
                    {airlines.map((airline) => (
                      <option key={airline.id} value={String(airline.id)}>
                        {airline.iata_code ? `${airline.iata_code} · ` : ''}{airline.name}
                      </option>
                    ))}
                  </select>
                  <small aria-hidden="true">{airlineLoading ? 'Đang tải danh sách…' : 'Bộ lọc không bắt buộc'}</small>
                </label>

                <label className="airport-field search-detail-field date-picker-field">
                  <span>{tripType === 'multi_city' ? 'Hành trình' : 'Ngày khởi hành'}</span>
                  {tripType === 'multi_city' ? (
                    <span className="itinerary-passenger-summary">{itineraryLegs.length} chặng · chọn {passengers} hành khách bên dưới</span>
                  ) : (
                  <input
                    aria-label="Departure date"
                    type="date"
                    min={todayLocal()}
                    value={departureDate}
                    onChange={(event) => { departureDateRef.current = event.target.value; setDepartureDate(event.target.value); }}
                  />
                  )}
                  <small className="field-date-hint">{formatWeekday(departureDate)}</small>
                </label>

                {tripType === 'round_trip' ? (
                  <label className="airport-field search-detail-field date-picker-field">
                    <span>Ngày về</span>
                    <input
                      aria-label="Return date"
                      type="date"
                      min={departureDate || todayLocal()}
                      value={returnDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                    />
                    <small className="field-date-hint">{formatWeekday(returnDate) || 'Chọn ngày về'}</small>
                  </label>
                ) : null}

                <label className="airport-field search-detail-field passenger-field">
                  <span>Số hành khách</span>
                  <input
                    aria-label="Passengers"
                    type="number"
                    min="1"
                    step="1"
                    value={passengers}
                    onChange={(event) => { passengersRef.current = event.target.value; setPassengers(event.target.value); }}
                  />
                  <small>Tối thiểu 1 hành khách</small>
                </label>

                <button className="button button-secondary search-submit" type="submit">
                  <span className="search-submit-icon" aria-hidden="true">🔍</span>
                  <span>Tìm chuyến bay</span>
                </button>
              </div>

              <div className="search-card-live-bar">
                <div className="live-status-pill">
                  <span className="search-info-mark" aria-hidden="true">i</span>
                  <span>
                    Lịch bay và giá vé sẽ được tra cứu theo thông tin bạn chọn.
                  </span>
                </div>
                <p className="one-way-note" role="note">
                  {tripType === 'round_trip' ? 'Khứ hồi · Chọn chuyến đi và chuyến về theo lịch bay hiện có.' : tripType === 'multi_city' ? 'Nhiều chặng · Mỗi chặng được tra cứu riêng theo lịch bay hiện có.' : 'Hành trình một chiều · Kết quả phụ thuộc vào lịch bay hiện có.'}
                </p>
              </div>
              </div>

              {airportLoading ? <p className="search-help" role="status">Đang tải sân bay…</p> : null}
              {airportError ? <p className="search-help" role="status">{airportError}</p> : null}
              {airlineLoading ? <p className="search-help" role="status">Đang tải danh sách hãng bay…</p> : null}
              {airlineError ? <p className="search-help" role="status">{airlineError}</p> : null}
              {destinationSuggestionStatus ? <p className="search-help" role="status" aria-live="polite">{destinationSuggestionStatus}</p> : null}
              {error ? <p className="search-error" role="alert">{error}</p> : null}
            </form>
          </div>
        </section>

        {/* 4 QUICK VALUE PROPOSITIONS */}
        <section className="home-quick-features-wrap" aria-label="Cam kết dịch vụ">
          <div className="home-quick-features">
            <div className="feature-item">
              <div className="feature-icon-box feature-icon-ticket">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
                  <path d="M13 5v2m0 4v2m0 4v2" />
                </svg>
              </div>
              <div className="feature-content">
                <h3>Thông tin hành lý</h3>
                <p>Đối chiếu thông tin được hiển thị cùng từng lựa chọn chuyến bay.</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon-box feature-icon-luggage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="6" y="7" width="12" height="14" rx="2" />
                  <path d="M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                </svg>
              </div>
              <div className="feature-content">
                <h3>So sánh hạng vé</h3>
                <p>Xem các hạng vé và thông tin đi kèm trước khi chọn chuyến.</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon-box feature-icon-lotus">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 2C9 7 4 9 4 14a8 8 0 0 0 16 0c0-5-5-7-8-12z" />
                  <path d="M12 12c-2 2-3 4-3 6a3 3 0 0 0 6 0c0-2-1-4-3-6z" />
                </svg>
              </div>
              <div className="feature-content">
                <h3>Chọn chuyến phù hợp</h3>
                <p>So sánh lịch bay và lựa chọn hạng vé theo kế hoạch của bạn.</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon-box feature-icon-support">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </div>
              <div className="feature-content">
                <h3>Quản lý đặt chỗ</h3>
                <p>Tra cứu thông tin đặt chỗ từ các mục quản lý tài khoản sau khi đăng nhập.</p>
              </div>
            </div>
          </div>
        </section>

        {/* DESTINATIONS SECTION */}
        <section className="destination-section" aria-labelledby="destinations-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow destination-eyebrow">✦ HÀNH TRÌNH KHỞI SỰ CẢM HỨNG</span>
              <h2 id="destinations-heading">Khám phá các điểm đến nổi bật</h2>
              <p className="destination-subtext">Chọn một điểm đến để tra cứu lịch bay và giá vé thực tế đang có.</p>
            </div>
            <div className="destination-filters">
              <div className="filter-pills" role="tablist" aria-label="Bộ lọc điểm đến">
                <button
                  type="button"
                  role="tab"
                  className={`filter-pill ${destinationFilter === 'all' ? 'is-active' : ''}`}
                  aria-selected={destinationFilter === 'all'}
                  onClick={() => setDestinationFilter('all')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={destinationFilter === 'domestic'}
                  className={`filter-pill ${destinationFilter === 'domestic' ? 'is-active' : ''}`}
                  onClick={() => setDestinationFilter('domestic')}
                >
                  Nội địa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={destinationFilter === 'international'}
                  className={`filter-pill ${destinationFilter === 'international' ? 'is-active' : ''}`}
                  onClick={() => setDestinationFilter('international')}
                >
                  Quốc tế
                </button>
              </div>
              <a href="#destinations-heading" className="view-all-routes">Xem tất cả chặng →</a>
            </div>
          </div>

          <div className="destination-list">
            {filteredDestinations.map((place, index) => {
              return (
                <button
                  className={`destination-card destination-card-${index + 1}`}
                  type="button"
                  key={place.code}
                  aria-label={`Tìm chuyến bay đến ${place.city} (${place.code})`}
                  onClick={() => chooseSuggestedDestination(place)}
                >
                  <div className="destination-art" style={{ backgroundImage: `url("${place.image}")` }} aria-hidden="true">
                    {place.badge ? <span className="destination-badge-tag">{place.badge}</span> : null}
                    <div className="destination-art-scrim" />
                    <span className="destination-art-code">{place.code}</span>
                  </div>
                  <div className="destination-card-meta">
                    <div className="destination-card-top-row">
                      <span className="destination-code">{place.code} · {place.country}</span>
                    </div>
                    <h3>{place.city}</h3>
                    <p>{place.note}</p>
                    <div className="destination-card-bottom-row">
                      <span className="destination-search-hint">Tra cứu lịch bay và giá vé</span>
                      <span className="destination-book-btn">Tìm chuyến đến <span aria-hidden="true">→</span></span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* LUXURY CABIN SHOWCASE */}
        <section className="luxury-cabins-section" aria-labelledby="cabins-heading">
          <div className="cabins-heading-center">
            <span className="eyebrow">KHÔNG GIAN KHOANG KHÁCH</span>
            <h2 id="cabins-heading">Đẳng Cấp Trên Mỗi Độ Cao</h2>
            <p>Được thiết kế tỉ mỉ mang lại sự thư thái tuyệt đối và phong thái tôn nghiêm cho từng hành khách.</p>
          </div>
          <div className="cabins-grid">
            <div className="cabin-card cabin-business">
              <div className="cabin-image" style={{ backgroundImage: 'url("/images/cabins/business-class.jpg")' }}>
                <span className="cabin-badge">✦ Serene Business Class</span>
              </div>
              <div className="cabin-body">
                <div className="cabin-header">
                  <h3>Hạng Thương Gia Đỉnh Cao</h3>
                  <span className="cabin-link-text">Ưu đãi toàn diện</span>
                </div>
                <p className="cabin-desc">Khám phá lựa chọn hạng vé cao hơn và xem quyền lợi thực tế được cung cấp cho từng chuyến bay.</p>
                <ul className="cabin-perks">
                  <li><span className="perk-check">✓</span> Không gian nghỉ ngơi riêng tư</li>
                  <li><span className="perk-check">✓</span> Tiện ích theo hạng vé</li>
                  <li><span className="perk-check">✓</span> Quyền lợi hiển thị khi chọn vé</li>
                  <li><span className="perk-check">✓</span> Điều kiện áp dụng theo chuyến bay</li>
                </ul>
                <div className="cabin-footer">
                  <span className="cabin-footer-note">Ưu đãi Bay thảnh thơi nội sân bay</span>
                  <button type="button" className="button button-primary cabin-action" onClick={() => navigate('/flights/search')}>
                    Khám phá Hạng Thương Gia
                  </button>
                </div>
              </div>
            </div>

            <div className="cabin-card cabin-economy">
              <div className="cabin-image" style={{ backgroundImage: 'url("/images/cabins/economy-plus.jpg")' }}>
                <span className="cabin-badge cabin-badge-emerald">✦ Serene Economy Plus</span>
              </div>
              <div className="cabin-body">
                <div className="cabin-header">
                  <h3>Phổ Thông Đặc Biệt</h3>
                  <span className="cabin-link-text">Độ rộng vượt trội</span>
                </div>
                <p className="cabin-desc">Tìm hiểu lựa chọn phổ thông và đối chiếu các thông tin được hiển thị theo chuyến bay.</p>
                <ul className="cabin-perks">
                  <li><span className="perk-check">✓</span> Lựa chọn hạng vé phổ thông</li>
                  <li><span className="perk-check">✓</span> Giá vé theo dữ liệu chuyến bay</li>
                  <li><span className="perk-check">✓</span> Điều kiện vé được trình bày rõ ràng</li>
                  <li><span className="perk-check">✓</span> Chọn hành trình theo nhu cầu</li>
                </ul>
                <div className="cabin-footer">
                  <span className="cabin-footer-note">Xem lựa chọn đang mở bán</span>
                  <button type="button" className="button button-outline cabin-action" onClick={() => navigate('/flights/search')}>
                    Tìm hiểu chi tiết
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FLEET BANNER */}
        <section className="fleet-banner-strip-wrap">
          <div className="fleet-banner-strip">
            <div className="fleet-banner-content">
              <div className="fleet-icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                </svg>
              </div>
              <div className="fleet-info">
                <h4>Lên kế hoạch theo lịch bay hiện có</h4>
                <p>Chọn điểm đi, điểm đến và ngày khởi hành để tra cứu các chuyến bay đang được cung cấp trong hệ thống.</p>
              </div>
            </div>
            <div className="fleet-stats">
              <a href="#flight-search-form" className="fleet-link">Tìm chuyến bay →</a>
            </div>
          </div>
        </section>

        {/* NEWSLETTER & MOBILE APP */}
        <section className="club-promo-section">
          <div className="club-promo-card">
            <div className="club-promo-left">
              <span className="club-badge">✦ LÊN KẾ HOẠCH HÀNH TRÌNH</span>
              <h2>Tìm chuyến bay phù hợp với kế hoạch của bạn</h2>
              <p>Chọn điểm đi, điểm đến và ngày bay để xem lịch bay cùng giá vé theo dữ liệu hiện có.</p>
              <a href="#flight-search-form" className="button button-secondary club-search-link">Tra cứu chuyến bay <span aria-hidden="true">→</span></a>
              <div className="club-trust-badges">
                <span>✓ Không cần tài khoản để tra cứu</span>
                <span>✓ Giá và lịch bay lấy từ kết quả tìm kiếm</span>
              </div>
            </div>
            <div className="club-promo-right">
              <div className="mobile-app-card">
                <div className="qr-code-box" aria-hidden="true"><span>✈</span></div>
                <div className="app-info">
                  <small className="app-kicker">TÌM KIẾM TRỰC TUYẾN</small>
                  <h4>Lịch bay theo hành trình</h4>
                  <p>Kết quả và giá vé được hiển thị sau khi bạn tra cứu thông tin chuyến đi.</p>
                  <a className="app-badge app-search-link" href="#flight-search-form">Bắt đầu tìm kiếm</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOME NOTE */}
        <section className="home-note">
          <span className="note-mark" aria-hidden="true">✦</span>
          <div>
            <h2>Hành trình tốt bắt đầu từ lựa chọn phù hợp.</h2>
            <p>So sánh giờ bay, chỗ còn trống và hạng vé để tìm chuyến đi hợp với kế hoạch của bạn.</p>
          </div>
        </section>
      </main>

      {/* FULL LUXURY FOOTER */}
      <footer className="site-footer serene-full-footer">
        <span className="sr-only">Serene Flightways</span>
        <div className="footer-top-columns">
          <div className="footer-col brand-col">
            <div className="footer-brand">
              <span className="brand-flight-icon" aria-hidden="true">✈</span>
              <strong>Serene Flightways</strong>
            </div>
            <p className="brand-motto">
              Tất cả tầm nhìn tinh tế &amp; dịch vụ chuẩn mực kết tinh trong mỗi chặng bay, khát khao nâng tầm hàng không Việt Nam vươn xa trên trường quốc tế.
            </p>
            <div className="footer-hotline-box">
              <small>TỔNG ĐÀI 24/7</small>
              <strong>1900 6868</strong>
            </div>
            <div className="footer-cert-tags">
              <span>ASA Member</span>
              <span>CAAV Certified</span>
              <span>IOSA 2024</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Điểm đến gợi ý</h4>
            <ul>
              <li><button type="button" onClick={() => chooseSuggestedDestination({ code: 'HAN', city: 'Hà Nội' })}>Hà Nội (HAN)</button></li>
              <li><button type="button" onClick={() => chooseSuggestedDestination({ code: 'SGN', city: 'TP. Hồ Chí Minh' })}>TP. Hồ Chí Minh (SGN)</button></li>
              <li><button type="button" onClick={() => chooseSuggestedDestination({ code: 'DAD', city: 'Đà Nẵng' })}>Đà Nẵng (DAD)</button></li>
              <li><button type="button" onClick={() => chooseSuggestedDestination({ code: 'PQC', city: 'Phú Quốc' })}>Phú Quốc (PQC)</button></li>
              <li><button type="button" onClick={() => chooseSuggestedDestination({ code: 'CXR', city: 'Nha Trang' })}>Nha Trang (CXR)</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Dịch vụ &amp; Pháp lý</h4>
            <ul>
              <li><NavLink to="/bookings/lookup">Tra cứu đặt chỗ</NavLink></li>
              <li><a href="#destinations-heading">Chính sách hành lý</a></li>
              <li><a href="#destinations-heading">Điều kiện vận chuyển</a></li>
              <li><a href="#destinations-heading">Bảo vệ thông tin cá nhân</a></li>
              <li><a href="#destinations-heading">Hợp tác doanh nghiệp</a></li>
            </ul>
          </div>

          <div className="footer-col app-col">
            <h4>Tra cứu hành trình</h4>
            <p>Tìm lịch bay theo sân bay đi, sân bay đến và ngày khởi hành bạn chọn.</p>
            <a className="app-download-card app-search-link" href="#flight-search-form">
              <span className="download-icon" aria-hidden="true">✈</span>
              <span><small>Mở biểu mẫu</small><strong>Tìm chuyến bay</strong></span>
            </a>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div className="footer-copyright">
            <span>© 2026 Hãng Hàng Không Serene Flightways. Bản quyền đã được bảo hộ.</span>
          </div>
          <div className="footer-legal-links">
            <span>Cục Hàng không Dân dụng Việt Nam</span>
            <span>•</span>
            <span>Bảo mật chuẩn quốc tế SSL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
