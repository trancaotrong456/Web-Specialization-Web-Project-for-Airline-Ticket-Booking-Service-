import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Search, Info } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AirportCombobox } from './AirportCombobox';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';
import { findNearestSupportedAirport, MAX_GEOLOCATION_ACCURACY_METERS } from './airportCoordinates';
import { FeatureGrid } from './components/FeatureGrid';
import { DestinationGrid } from './components/DestinationGrid';
import { CabinClassCard } from './components/CabinClassCard';
import { CtaBanner } from './components/CtaBanner';
import { TrustSection } from './components/TrustSection';

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
    if (nextType === 'multi_city') return;
    setError('');
    cancelDestinationSuggestion();
    setActiveAirportField(null);
    setTripType(nextType);
  };

  const handleTripModeTabKeyDown = (event, currentIndex) => {
    const availableOptions = tripModeOptions.filter(([type]) => type !== 'multi_city');
    const currentActiveIndex = availableOptions.findIndex(([type]) => type === tripType);
    let nextIndex = currentActiveIndex >= 0 ? currentActiveIndex : 0;
    if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % availableOptions.length;
    else if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + availableOptions.length) % availableOptions.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = availableOptions.length - 1;
    else return;

    event.preventDefault();
    selectTripType(availableOptions[nextIndex][0]);
    document.getElementById(`trip-tab-${availableOptions[nextIndex][0]}`)?.focus();
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
        setError('Số hành khách không hợp lệ.');
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
      setFocusOriginAfterDestination(Boolean(selectedAirport));
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

  const isReturnDateInvalid = Boolean(
    tripType === 'round_trip' &&
    returnDate &&
    departureDate &&
    returnDate < departureDate
  );

  return (
    <div className="public-page home-page">
      {/* 1 & 2. Main Hero & Header Container */}
      <div className="home-hero-header-container">
        <div className="hero-bg-media" aria-hidden="true">
          <img
            alt="Serene Flightways Banner Sky"
            className="hero-bg-img w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAd8g66VdNIy9TLJVIxr7zEPjYuoLvOI-S4uLwjOf9iBhCgdJnGZTML4dIMhboXXiAyew0_e7sm7MepyHzYPMiO5xrO98HQhI64BbC_Qj0b8pLOyF9VznRBN3qDeodXC7N45y_nmymBjqHFTibJARHXCCf6RwS9ffK-BKgRtbOj4lwysMr_8tDsNT4NaLS0sJtdGOPzNCQrNKR3cXwEJs9XOFPONpmHhHihF4k5tkvdurAtmmiX03VqIA"
            width="1920"
            height="1080"
            loading="eager"
          />
          <div className="hero-bg-overlay" />
        </div>

        {/* 1. Sticky / Navigation Header */}
        <AppHeader />

        {/* 2. Hero Section */}
        <section className="home-hero home-hero--full-bleed" aria-label="Tìm kiếm chuyến bay">
          <div className="home-hero-inner">
            <div className="home-copy">
              <h1 className="home-hero-headline">
                Đặt vé máy bay nội địa và quốc tế
              </h1>
              <p className="home-hero-description">
                Tra cứu lịch bay, so sánh giá vé và giữ chỗ trực tuyến.
              </p>
            </div>
          </div>

          {/* 3. Search Form Card */}
          <div className="search-card-wrap">
            <form id="flight-search-form" className="flight-search-card glass-card" ref={searchFormRef} onSubmit={submit} noValidate>
              <div className="search-card-header-bar">
                <div className="trip-type-tabs" role="tablist" aria-label="Loại hành trình">
                  {tripModeOptions.map(([type, label], index) => {
                    const isDisabled = type === 'multi_city';
                    return (
                      <button
                        key={type}
                        id={`trip-tab-${type}`}
                        className={`trip-type-tab${tripType === type ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={tripType === type}
                        aria-disabled={isDisabled ? 'true' : undefined}
                        aria-controls="trip-search-panel"
                        tabIndex={isDisabled ? -1 : (tripType === type ? 0 : -1)}
                        disabled={isDisabled}
                        onKeyDown={(event) => {
                          if (isDisabled) return;
                          handleTripModeTabKeyDown(event, index);
                        }}
                        onClick={() => {
                          if (isDisabled) return;
                          selectTripType(type);
                        }}
                      >
                        <span>{label}</span>
                        {isDisabled ? (
                          <span className="tab-badge-coming-soon" aria-hidden="true">Sắp ra mắt</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div id="trip-search-panel" role="tabpanel" aria-labelledby={`trip-tab-${tripType}`}>
                {tripType === 'one_way' ? <span className="sr-only">Hành trình một chiều</span> : null}
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
                      <ArrowRightLeft size={18} className="swap-icon-svg" aria-hidden="true" />
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
                    <small>{airlineLoading ? 'Đang tải danh sách…' : 'Bộ lọc không bắt buộc'}</small>
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
                    <small className="field-date-hint">{formatWeekday(departureDate) || 'Thứ Năm'}</small>
                  </label>

                  {tripType === 'round_trip' ? (
                    <label className={`airport-field search-detail-field date-picker-field${isReturnDateInvalid ? ' field-has-error' : ''}`}>
                      <span>Ngày về</span>
                      <input
                        aria-label="Return date"
                        type="date"
                        min={departureDate || todayLocal()}
                        value={returnDate}
                        onChange={(event) => setReturnDate(event.target.value)}
                        aria-invalid={isReturnDateInvalid ? 'true' : 'false'}
                      />
                      {isReturnDateInvalid ? (
                        <small className="field-date-hint field-date-hint--error" role="alert">
                          Ngày về phải từ ngày khởi hành trở đi
                        </small>
                      ) : (
                        <small className="field-date-hint">{formatWeekday(returnDate) || 'Chọn ngày về'}</small>
                      )}
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
                    <Search size={18} className="search-submit-icon-svg" aria-hidden="true" />
                    <span>Tìm chuyến bay</span>
                  </button>
                </div>

                {/* Dòng chú thích ngắn gọn duy nhất dưới form */}
                <div className="search-card-footnote">
                  <div className="footnote-left">
                    <Info size={16} className="footnote-icon" aria-hidden="true" />
                    <span className="footnote-text">
                      Kết quả phụ thuộc vào lịch bay hiện có trong hệ thống.
                    </span>
                  </div>
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
      </div>

      <main>
        {/* FeatureGrid */}
        <FeatureGrid />

        {/* 6. DestinationGrid (Phá nhịp với thẻ DAD chiếm 2 cột, lấy giá từ API) */}
        <DestinationGrid api={api} onSelectDestination={chooseSuggestedDestination} />

        {/* 7. CabinClassCard (2 thẻ cùng cấu trúc, chiều cao bằng nhau) */}
        <CabinClassCard />

        {/* 8. MỘT khối CTA duy nhất */}
        <CtaBanner />

        {/* 9. Mục mới: Vì sao chọn Serene & Phương thức thanh toán */}
        <TrustSection />
      </main>

      {/* 10. MainFooter */}
      <footer className="site-footer serene-full-footer" data-purpose="site-footer">
        <div className="footer-top-columns">
          <div className="footer-col brand-col">
            <div className="footer-brand">
              <span className="brand-flight-icon" aria-hidden="true">✈</span>
              <strong className="whitespace-nowrap">Serene Flightways</strong>
            </div>
            <p className="brand-motto">
              Hệ thống tra cứu chuyến bay và đặt chỗ trực tuyến Serene Flightways. Cung cấp dữ liệu lịch trình minh bạch và dịch vụ hỗ trợ hành khách 24/7.
            </p>
            <div className="footer-hotline-box">
              <small className="font-mono">TỔNG ĐÀI HỖ TRỢ</small>
              <strong className="font-mono whitespace-nowrap">1900 6868</strong>
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
              <li><span>Các chính sách và thông tin hợp tác đang được cập nhật.</span></li>
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

          <div className="footer-col newsletter-col">
            <h4>Bản tin Serene Club</h4>
            <p>Đăng ký nhận thông tin hành trình mới và đặc quyền ưu đãi sớm nhất.</p>
            <form className="footer-newsletter-form" onSubmit={(e) => { e.preventDefault(); alert('Cảm ơn bạn đã đăng ký nhận bản tin Serene Flightways!'); }}>
              <input type="email" placeholder="Nhập email của bạn" required aria-label="Địa chỉ email nhận bản tin" />
              <button type="submit" className="button button-secondary">Đăng ký</button>
            </form>
            <small className="newsletter-note">Cam kết bảo mật thông tin theo tiêu chuẩn quốc tế.</small>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div className="footer-copyright">
            <span>© 2026 Hãng Hàng Không Serene Flightways. Bản quyền đã được bảo hộ.</span>
          </div>
          <div className="footer-legal-links font-mono">
            <span>Phân phối vé điện tử trực tuyến</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
