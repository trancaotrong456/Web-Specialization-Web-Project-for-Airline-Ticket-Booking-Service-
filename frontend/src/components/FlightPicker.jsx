import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../app/AuthProvider';
import { formatFlightPickerLabel } from '../lib/dateUtils';
import './flightPicker.css';

/**
 * FlightPicker - Bộ chọn chuyến bay thay cho ô nhập Flight ID thô.
 * Hiển thị theo định dạng: "Hãng · HAN→SGN · 06:00 25/10"
 * Tìm kiếm theo tuyến (mã IATA, tên sân bay, thành phố) hoặc ngày bay (DD/MM, YYYY-MM-DD).
 * Giá trị gửi đi / nhận vào vẫn là số nguyên flight_id.
 */
export function FlightPicker({
  id = 'flight-picker-input',
  label = 'Chuyến bay',
  value = '',
  onChange,
  onSelectFlight,
  placeholder = 'Tìm theo tuyến, ngày (HAN→SGN, 25/10) hoặc nhập ID…',
  required = false,
  disabled = false,
  className = '',
}) {
  const { request } = useAuth();
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState(null);
  const containerRef = useRef(null);

  // Tải danh sách chuyến bay ban đầu từ API hiện có (/flights?limit=50)
  useEffect(() => {
    let active = true;
    const fetchFlights = async () => {
      if (!request) return;
      setLoading(true);
      setError('');
      try {
        const res = await request('/flights?page=1&limit=50');
        if (!active) return;
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setFlights(list);
      } catch (err) {
        if (active) setError(err.message || 'Không thể tải danh sách chuyến bay.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchFlights();
    return () => { active = false; };
  }, [request]);

  // Nếu đã có value (ID), tìm flight trong danh sách hoặc gọi API lấy chi tiết
  useEffect(() => {
    if (!value) {
      setSelectedFlight(null);
      return;
    }
    const found = flights.find((f) => String(f.id) === String(value));
    if (found) {
      setSelectedFlight(found);
      if (onSelectFlight) onSelectFlight(found);
    } else if (request && !selectedFlight) {
      let active = true;
      request(`/flights/${value}`)
        .then((res) => {
          if (!active) return;
          const flightData = res?.data || res;
          if (flightData && flightData.id) {
            setSelectedFlight(flightData);
            if (onSelectFlight) onSelectFlight(flightData);
          }
        })
        .catch(() => {});
      return () => { active = false; };
    }
  }, [value, flights, request, onSelectFlight, selectedFlight]);

  // Đóng dropdown khi bấm ra ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lọc chuyến bay theo tuyến, ngày, hãng hoặc mã ID
  const filteredFlights = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter((flight) => {
      if (String(flight.id) === q) return true;
      const labelText = formatFlightPickerLabel(flight).toLowerCase();
      if (labelText.includes(q)) return true;
      const depIata = (flight.departureAirport?.iata_code || '').toLowerCase();
      const arrIata = (flight.arrivalAirport?.iata_code || '').toLowerCase();
      const depCity = (flight.departureAirport?.city || '').toLowerCase();
      const arrCity = (flight.arrivalAirport?.city || '').toLowerCase();
      const airline = (flight.airline?.name || flight.airline?.iata_code || '').toLowerCase();
      return (
        depIata.includes(q) ||
        arrIata.includes(q) ||
        `${depIata}->${arrIata}`.includes(q) ||
        `${depIata}→${arrIata}`.includes(q) ||
        depCity.includes(q) ||
        arrCity.includes(q) ||
        airline.includes(q)
      );
    });
  }, [flights, query]);

  const handleSelect = (flight) => {
    setSelectedFlight(flight);
    setIsOpen(false);
    setQuery('');
    if (onChange) {
      const syntheticEvent = { target: { value: String(flight.id), name: id } };
      onChange(syntheticEvent);
    }
    if (onSelectFlight) {
      onSelectFlight(flight);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    // Vẫn gọi onChange để tương thích với các bài test nhập ID trực tiếp
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <div className={`flight-picker-container field ${className}`} ref={containerRef}>
      <label htmlFor={id} className="field-label">
        <span>{label}</span>
      </label>

      <div className="flight-picker-control">
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="field-input flight-picker-input"
          autoComplete="off"
        />

        {selectedFlight ? (
          <div className="flight-picker-badge" title={formatFlightPickerLabel(selectedFlight)}>
            <span className="flight-picker-badge-text">
              {formatFlightPickerLabel(selectedFlight)}
            </span>
            <button
              type="button"
              className="flight-picker-badge-clear"
              aria-label="Xóa chuyến bay đã chọn"
              onClick={() => {
                setSelectedFlight(null);
                setQuery('');
                if (onChange) onChange({ target: { value: '', name: id } });
                if (onSelectFlight) onSelectFlight(null);
              }}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      <small className="flight-picker-hint">
        Hiển thị 50 chuyến đầu theo thứ tự của máy chủ (sắp xếp theo thời gian khởi hành tăng dần). Định dạng: Hãng · Đi→Đến · Giờ Ngày.
      </small>

      {isOpen && !disabled ? (
        <div className="flight-picker-dropdown" role="listbox" aria-label="Danh sách gợi ý chuyến bay">
          {loading ? (
            <div className="flight-picker-loading">Đang nạp chuyến bay…</div>
          ) : error ? (
            <div className="flight-picker-error">{error}</div>
          ) : filteredFlights.length === 0 ? (
            <div className="flight-picker-empty">
              Không tìm thấy chuyến bay phù hợp với “{query}”.
            </div>
          ) : (
            filteredFlights.map((flight) => (
              <button
                type="button"
                key={flight.id}
                role="option"
                aria-selected={String(value) === String(flight.id)}
                className={`flight-picker-option ${String(value) === String(flight.id) ? 'is-selected' : ''}`}
                onClick={() => handleSelect(flight)}
              >
                <div className="flight-picker-option-main">
                  <strong>{formatFlightPickerLabel(flight)}</strong>
                  <small className="flight-picker-option-meta">
                    Mã #{flight.id} · {flight.departureAirport?.city || '—'} → {flight.arrivalAirport?.city || '—'} · {flight.available_seats ?? '—'} ghế trống
                  </small>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
