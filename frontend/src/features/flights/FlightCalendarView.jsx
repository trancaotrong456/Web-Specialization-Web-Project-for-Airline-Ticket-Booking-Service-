import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './flightCalendar.css';

const WEEKDAYS = [
  { short: 'T2', full: 'Thứ Hai', dayIndex: 1 },
  { short: 'T3', full: 'Thứ Ba', dayIndex: 2 },
  { short: 'T4', full: 'Thứ Tư', dayIndex: 3 },
  { short: 'T5', full: 'Thứ Năm', dayIndex: 4 },
  { short: 'T6', full: 'Thứ Sáu', dayIndex: 5 },
  { short: 'T7', full: 'Thứ Bảy', dayIndex: 6, isWeekend: true },
  { short: 'CN', full: 'Chủ Nhật', dayIndex: 0, isWeekend: true },
];

const statusLabels = {
  scheduled: 'Theo lịch',
  delayed: 'Hoãn chuyến',
  boarding: 'Đang lên máy bay',
  departed: 'Đã cất cánh',
  arrived: 'Đã đến',
  cancelled: 'Đã hủy',
  completed: 'Hoàn tất',
};

const formatTimeOnly = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDateFull = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
};

const formatVND = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(amount || 0));

const isSameCalendarDay = (d1, d2) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const isCurrentDay = (d) => isSameCalendarDay(d, new Date());

// Get start of week (Monday) for a given date
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Generate 7 days for the week
const getWeekDays = (anchorDate) => {
  const start = getStartOfWeek(anchorDate);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    days.push(current);
  }
  return days;
};

// Generate Month grid cells (35 or 42 cells)
const getMonthGridDays = (year, month) => {
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Day of week: 0 (Sun) to 6 (Sat). Convert to Mon=0 ... Sun=6
  let firstDayIndex = firstDayOfMonth.getDay() - 1;
  if (firstDayIndex === -1) firstDayIndex = 6;

  const days = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }

  // Next month leading days to complete grid
  const totalCells = days.length > 35 ? 42 : 35;
  const remaining = totalCells - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false,
    });
  }

  return days;
};

export function FlightCalendarView({
  flights = [],
  loading = false,
  statusFilter = '',
  onStatusFilterChange,
  statusOptions = [],
}) {
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [selectedDayModal, setSelectedDayModal] = useState(null); // { date, flights }

  // Navigation handlers
  const handlePrev = () => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(prev.getMonth() - 1);
      } else {
        next.setDate(prev.getDate() - 7);
      }
      return next;
    });
  };

  const handleNext = () => {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(prev.getMonth() + 1);
      } else {
        next.setDate(prev.getDate() + 7);
      }
      return next;
    });
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  // Month grid calculations
  const currentYear = anchorDate.getFullYear();
  const currentMonth = anchorDate.getMonth();

  const monthGridDays = useMemo(() => {
    return getMonthGridDays(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const weekDays = useMemo(() => {
    return getWeekDays(anchorDate);
  }, [anchorDate]);

  // Flights lookup map by date key YYYY-MM-DD
  const flightsByDate = useMemo(() => {
    const map = new Map();
    flights.forEach((flight) => {
      if (!flight.departure_time) return;
      const d = new Date(flight.departure_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(flight);
    });

    // Sort flights in each day chronologically
    map.forEach((list) => {
      list.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
    });

    return map;
  }, [flights]);

  const getDayFlights = (date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return flightsByDate.get(key) || [];
  };

  // Filtered flights for the period & statistics
  const periodFlights = useMemo(() => {
    if (viewMode === 'month') {
      return flights.filter((f) => {
        if (!f.departure_time) return false;
        const d = new Date(f.departure_time);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      });
    }
    const start = weekDays[0];
    const end = new Date(weekDays[6]);
    end.setHours(23, 59, 59, 999);
    return flights.filter((f) => {
      if (!f.departure_time) return false;
      const d = new Date(f.departure_time);
      return d >= start && d <= end;
    });
  }, [flights, viewMode, currentYear, currentMonth, weekDays]);

  const stats = useMemo(() => {
    const counts = { total: periodFlights.length, scheduled: 0, delayed: 0, boarding: 0, completed: 0, cancelled: 0 };
    periodFlights.forEach((f) => {
      if (counts[f.status] !== undefined) counts[f.status]++;
      else if (f.status === 'departed' || f.status === 'arrived') counts.completed++;
    });
    return counts;
  }, [periodFlights]);

  // Period label title
  const periodTitle = useMemo(() => {
    if (viewMode === 'month') {
      const monthName = anchorDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }
    const startStr = `${String(weekDays[0].getDate()).padStart(2, '0')}/${String(weekDays[0].getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${String(weekDays[6].getDate()).padStart(2, '0')}/${String(weekDays[6].getMonth() + 1).padStart(2, '0')}/${weekDays[6].getFullYear()}`;
    return `${startStr} – ${endStr}`;
  }, [anchorDate, viewMode, weekDays]);

  return (
    <div className="flight-calendar-container" aria-label="Lịch chuyến bay">
      {/* Top Header Toolbar */}
      <div className="flight-calendar-header">
        <div className="calendar-nav-group">
          <button
            className="calendar-nav-btn today-btn"
            type="button"
            onClick={handleToday}
            aria-label="Đi đến hôm nay"
          >
            Hôm nay
          </button>
          <button
            className="calendar-nav-btn"
            type="button"
            onClick={handlePrev}
            aria-label={viewMode === 'month' ? 'Tháng trước' : 'Tuần trước'}
          >
            ‹
          </button>
          <h2 className="calendar-period-title">{periodTitle}</h2>
          <button
            className="calendar-nav-btn"
            type="button"
            onClick={handleNext}
            aria-label={viewMode === 'month' ? 'Tháng sau' : 'Tuần sau'}
          >
            ›
          </button>
        </div>

        {/* View Mode Toggle & Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {onStatusFilterChange ? (
            <label htmlFor="calendar-status-select" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
              <span>Lọc:</span>
              <select
                id="calendar-status-select"
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
                style={{ height: '2.1rem', padding: '0 0.5rem', borderRadius: '0.45rem', border: '1px solid #d5e0e1', fontSize: '0.82rem' }}
              >
                <option value="">Tất cả trạng thái</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="calendar-mode-toggle" role="group" aria-label="Chế độ xem lịch">
            <button
              className={`calendar-mode-btn ${viewMode === 'week' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setViewMode('week')}
            >
              <span aria-hidden="true">📅</span> Theo tuần
            </button>
            <button
              className={`calendar-mode-btn ${viewMode === 'month' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setViewMode('month')}
            >
              <span aria-hidden="true">🗓️</span> Theo tháng
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats Bar */}
      <div className="calendar-stats-bar">
        <span>Tổng cộng: <strong>{stats.total} chuyến bay</strong> trong giai đoạn này</span>
        <span aria-hidden="true">•</span>
        <span className="calendar-stat-item">
          <span className="calendar-stat-dot dot-scheduled" /> Theo lịch: <strong>{stats.scheduled}</strong>
        </span>
        <span className="calendar-stat-item">
          <span className="calendar-stat-dot dot-delayed" /> Hoãn chuyến: <strong>{stats.delayed}</strong>
        </span>
        <span className="calendar-stat-item">
          <span className="calendar-stat-dot dot-completed" /> Hoàn tất/Đã bay: <strong>{stats.completed}</strong>
        </span>
        {stats.cancelled > 0 ? (
          <span className="calendar-stat-item">
            <span className="calendar-stat-dot dot-cancelled" /> Đã hủy: <strong>{stats.cancelled}</strong>
          </span>
        ) : null}
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' ? (
        <div className="month-grid-shell">
          <div className="month-weekday-header">
            {WEEKDAYS.map((day) => (
              <div key={day.short} className={`month-weekday-cell ${day.isWeekend ? 'is-weekend' : ''}`}>
                {day.full} ({day.short})
              </div>
            ))}
          </div>

          <div className="month-days-grid">
            {monthGridDays.map(({ date, isCurrentMonth }, idx) => {
              const dayFlights = getDayFlights(date);
              const today = isCurrentDay(date);

              return (
                <div
                  key={idx}
                  className={`month-day-cell ${!isCurrentMonth ? 'is-other-month' : ''} ${today ? 'is-today' : ''}`}
                  onClick={() => {
                    if (dayFlights.length > 0) {
                      setSelectedDayModal({ date, flights: dayFlights });
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${date.toLocaleDateString('vi-VN')}, ${dayFlights.length} chuyến bay`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dayFlights.length > 0) {
                      setSelectedDayModal({ date, flights: dayFlights });
                    }
                  }}
                >
                  <div className="day-cell-top">
                    <span className="day-number">{date.getDate()}</span>
                    {dayFlights.length > 0 ? (
                      <span className="day-count-badge">{dayFlights.length} chuyến</span>
                    ) : null}
                  </div>

                  <div className="day-flights-list">
                    {dayFlights.slice(0, 3).map((flight) => (
                      <div
                        key={flight.id}
                        className={`flight-chip chip-${flight.status}`}
                        title={`${flight.airline?.name || 'Hãng bay'} #${flight.id}: ${flight.departureAirport?.iata_code} → ${flight.arrivalAirport?.iata_code} (${statusLabels[flight.status] || flight.status})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFlight(flight);
                        }}
                      >
                        <span className="chip-time">{formatTimeOnly(flight.departure_time)}</span>
                        <span className="chip-route">
                          {flight.departureAirport?.iata_code || '—'}→{flight.arrivalAirport?.iata_code || '—'}
                        </span>
                      </div>
                    ))}

                    {dayFlights.length > 3 ? (
                      <button
                        className="more-flights-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDayModal({ date, flights: dayFlights });
                        }}
                      >
                        +{dayFlights.length - 3} chuyến nữa
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* WEEK VIEW */}
      {viewMode === 'week' ? (
        <div className="week-view-shell">
          {weekDays.map((date, idx) => {
            const dayFlights = getDayFlights(date);
            const today = isCurrentDay(date);
            const weekday = WEEKDAYS[idx];

            return (
              <div key={idx} className={`week-day-column ${today ? 'is-today' : ''}`}>
                <div className="week-col-header">
                  <span className="week-day-name">{weekday.full}</span>
                  <span className="week-day-date">
                    {String(date.getDate()).padStart(2, '0')}/{String(date.getMonth() + 1).padStart(2, '0')}
                  </span>
                  <span className="week-day-badge">
                    {dayFlights.length} chuyến bay
                  </span>
                </div>

                <div className="week-col-body">
                  {dayFlights.length === 0 ? (
                    <div className="week-col-empty">
                      <span>Không có chuyến bay</span>
                    </div>
                  ) : (
                    dayFlights.map((flight) => (
                      <article
                        key={flight.id}
                        className="week-flight-card"
                        onClick={() => setSelectedFlight(flight)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedFlight(flight)}
                      >
                        <div className="week-flight-card-top">
                          <span className="week-flight-carrier">
                            {flight.airline?.iata_code || ''} #{flight.id}
                          </span>
                          <span className={`status-badge status-${flight.status}`} style={{ fontSize: '0.66rem', padding: '0.1rem 0.35rem' }}>
                            {statusLabels[flight.status] || flight.status}
                          </span>
                        </div>

                        <div className="week-flight-time">
                          {formatTimeOnly(flight.departure_time)} – {formatTimeOnly(flight.arrival_time)}
                        </div>

                        <div className="week-flight-route">
                          <strong>{flight.departureAirport?.iata_code || '—'}</strong>
                          <span aria-hidden="true">→</span>
                          <strong>{flight.arrivalAirport?.iata_code || '—'}</strong>
                        </div>

                        <div className="week-flight-seats">
                          {flight.available_seats ?? '—'} / {flight.total_seats ?? '—'} ghế trống
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* MODAL 1: FLIGHT DETAIL MODAL */}
      {selectedFlight ? (
        <div
          className="calendar-modal-scrim"
          onClick={() => setSelectedFlight(null)}
          onKeyDown={(e) => e.key === 'Escape' && setSelectedFlight(null)}
          tabIndex={-1}
        >
          <div
            className="calendar-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-flight-modal-title"
          >
            <div className="calendar-modal-header">
              <h2 id="calendar-flight-modal-title">
                Chi tiết chuyến bay #{selectedFlight.id}
              </h2>
              <button
                className="calendar-modal-close"
                type="button"
                onClick={() => setSelectedFlight(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="calendar-modal-body">
              {/* Airline and Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64777b', textTransform: 'uppercase' }}>Hãng hàng không</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 750, color: '#102f35' }}>
                    {selectedFlight.airline?.name || '—'} ({selectedFlight.airline?.iata_code || '—'})
                  </div>
                </div>
                <span className={`status-badge status-${selectedFlight.status}`}>
                  {statusLabels[selectedFlight.status] || selectedFlight.status}
                </span>
              </div>

              {/* Route Banner */}
              <div className="modal-route-display">
                <div className="modal-route-point">
                  <strong>{selectedFlight.departureAirport?.iata_code || '—'}</strong>
                  <span>{selectedFlight.departureAirport?.city || selectedFlight.departureAirport?.name || 'Sân bay đi'}</span>
                </div>
                <div className="modal-route-arrow">
                  <span aria-hidden="true">✈</span>
                  <small style={{ fontSize: '0.72rem', color: '#64777b' }}>Trực tiếp</small>
                </div>
                <div className="modal-route-point" style={{ textAlign: 'right' }}>
                  <strong>{selectedFlight.arrivalAirport?.iata_code || '—'}</strong>
                  <span>{selectedFlight.arrivalAirport?.city || selectedFlight.arrivalAirport?.name || 'Sân bay đến'}</span>
                </div>
              </div>

              {/* Timing Grid */}
              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <dt>Giờ khởi hành dự kiến</dt>
                  <dd>{formatDateFull(selectedFlight.departure_time)}</dd>
                </div>
                <div className="modal-info-item">
                  <dt>Giờ đến dự kiến</dt>
                  <dd>{formatDateFull(selectedFlight.arrival_time)}</dd>
                </div>
                <div className="modal-info-item">
                  <dt>Tổng số ghế</dt>
                  <dd>{selectedFlight.total_seats ?? '—'} ghế</dd>
                </div>
                <div className="modal-info-item">
                  <dt>Ghế còn trống</dt>
                  <dd style={{ color: '#00514d' }}>{selectedFlight.available_seats ?? '—'} ghế</dd>
                </div>
              </div>

              {/* Fare classes summary if present */}
              {selectedFlight.fareClasses && selectedFlight.fareClasses.length > 0 ? (
                <div className="modal-fare-classes">
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#556c70', textTransform: 'uppercase' }}>
                    Hạng vé &amp; Giá mở bán
                  </span>
                  {selectedFlight.fareClasses.map((fare) => (
                    <div key={fare.id} className="modal-fare-row">
                      <span><strong>{fare.class_name}</strong></span>
                      <span style={{ fontWeight: 750, color: '#00514d' }}>{formatVND(fare.price)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="calendar-modal-footer">
              <button
                className="button button-outline"
                type="button"
                onClick={() => setSelectedFlight(null)}
              >
                Đóng
              </button>
              <Link
                className="button button-primary"
                to={`/admin/flights/${selectedFlight.id}`}
              >
                Xem chi tiết &amp; Quản trị
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL 2: DAY FLIGHTS LIST MODAL */}
      {selectedDayModal ? (
        <div
          className="calendar-modal-scrim"
          onClick={() => setSelectedDayModal(null)}
          onKeyDown={(e) => e.key === 'Escape' && setSelectedDayModal(null)}
          tabIndex={-1}
        >
          <div
            className="calendar-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-modal-title"
          >
            <div className="calendar-modal-header">
              <h2 id="calendar-day-modal-title">
                Lịch bay ngày {selectedDayModal.date.toLocaleDateString('vi-VN', { dateStyle: 'full' })}
              </h2>
              <button
                className="calendar-modal-close"
                type="button"
                onClick={() => setSelectedDayModal(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="calendar-modal-body">
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#556c70' }}>
                Tổng cộng có <strong>{selectedDayModal.flights.length} chuyến bay</strong> trong ngày này:
              </p>

              <div className="day-modal-flights-list">
                {selectedDayModal.flights.map((flight) => (
                  <div key={flight.id} className="day-modal-flight-item">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 800, color: '#00514d', fontSize: '0.95rem' }}>
                          {formatTimeOnly(flight.departure_time)}
                        </span>
                        <span style={{ fontWeight: 700, color: '#102f35', fontSize: '0.9rem' }}>
                          {flight.departureAirport?.iata_code} → {flight.arrivalAirport?.iata_code}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64777b' }}>
                        {flight.airline?.name || 'Hãng bay'} #{flight.id} • Còn {flight.available_seats ?? '—'} ghế
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span className={`status-badge status-${flight.status}`}>
                        {statusLabels[flight.status] || flight.status}
                      </span>
                      <button
                        className="button button-outline"
                        style={{ padding: '0.35rem 0.65rem', minHeight: 'auto', fontSize: '0.76rem' }}
                        type="button"
                        onClick={() => {
                          setSelectedDayModal(null);
                          setSelectedFlight(flight);
                        }}
                      >
                        Chi tiết
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="calendar-modal-footer">
              <button
                className="button button-primary"
                type="button"
                onClick={() => setSelectedDayModal(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
