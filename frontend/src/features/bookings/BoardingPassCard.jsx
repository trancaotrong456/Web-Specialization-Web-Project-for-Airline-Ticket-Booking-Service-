import React from 'react';
import { Calendar, Download } from 'lucide-react';
import { formatDay, formatTime, formatVnDateTime } from '../../lib/dateUtils';
import { StatusBadge } from '../../components/StatusBadge';
import './boardingPass.css';

/**
 * Thoát ký tự văn bản theo chuẩn RFC 5545 (Section 3.3.11 TEXT):
 * Dấu gạch chéo ngược \, dấu chấm phẩy ;, dấu phẩy , và xuống dòng \n
 */
export function escapeIcsText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Định dạng ngày giờ UTC có hậu tố Z (YYYYMMDDTHHmmssZ) theo RFC 5545
 */
export function formatIcsDate(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Tạo nội dung tệp iCalendar (.ics) chuẩn RFC 5545 trực tiếp từ trình duyệt
 */
export function generateFlightIcsContent({ booking, flight, passengers, seatInfo }) {
  if (!flight || !flight.departure_time) return '';

  const startUtc = formatIcsDate(flight.departure_time);
  const endUtc = flight.arrival_time
    ? formatIcsDate(flight.arrival_time)
    : formatIcsDate(new Date(new Date(flight.departure_time).getTime() + 2 * 3600000));

  const depCode = flight.departureAirport?.iata_code || 'DEP';
  const arrCode = flight.arrivalAirport?.iata_code || 'ARR';
  const depName = flight.departureAirport?.name || flight.departureAirport?.city || depCode;
  const arrName = flight.arrivalAirport?.name || flight.arrivalAirport?.city || arrCode;
  const airlineName = flight.airline?.name || 'Serene Flightways';
  const flightNo = flight.flight_number || `SF-${flight.id || ''}`;
  const pnr = booking?.booking_code || 'PNR';

  const passengerNames = (passengers || []).map((p) => p.passenger_name).filter(Boolean).join(', ') || 'Hành khách';
  const seatsSummary = seatInfo || 'Theo thông tin vé';

  const descriptionLines = [
    `Chuyến bay: ${airlineName} ${flightNo}`,
    `Mã đặt chỗ (PNR): ${pnr}`,
    `Hành khách: ${passengerNames}`,
    `Chỗ ngồi: ${seatsSummary}`,
    `Khởi hành: ${depName} (${depCode}) lúc ${formatVnDateTime(flight.departure_time)}`,
    `Hạ cánh: ${arrName} (${arrCode}) lúc ${formatVnDateTime(flight.arrival_time)}`,
    'Quý khách vui lòng có mặt tại sân bay ít nhất 90 phút trước giờ khởi hành để làm thủ tục check-in.',
  ];

  const escapedSummary = escapeIcsText(`✈ Chuyến bay ${airlineName} ${flightNo} (${depCode} → ${arrCode}) [${pnr}]`);
  const escapedDescription = descriptionLines.map((line) => escapeIcsText(line)).join('\\n');
  const escapedLocation = escapeIcsText(`${depName} (${depCode}) → ${arrName} (${arrCode})`);
  const uid = `booking-${booking?.id || Date.now()}-${Date.now()}@sereneflightways.com`;
  const stamp = formatIcsDate(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Serene Flightways//Electronic Ticket//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapedSummary}`,
    `DESCRIPTION:${escapedDescription}`,
    `LOCATION:${escapedLocation}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT120M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Nhắc nhở: Chuyến bay ${flightNo} sẽ khởi hành sau 2 giờ`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Tải file .ics trực tiếp phía trình duyệt
 */
export function downloadIcsFile(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * BoardingPassCard: Thẻ vé điện tử dạng Boarding Pass hàng không cao cấp
 */
export function BoardingPassCard({ booking, onDownloadPdf, downloadingPdf }) {
  if (!booking) return null;

  const flight = booking.flight || {};
  const passengers = Array.isArray(booking.passengers) ? booking.passengers : [];
  const seatAssignments = Array.isArray(booking.seatAssignments) ? booking.seatAssignments : [];
  const fareClass = booking.fareClass || booking.fare_class || {};

  const depAirport = flight.departureAirport || {};
  const arrAirport = flight.arrivalAirport || {};
  const depCode = depAirport.iata_code || 'HAN';
  const arrCode = arrAirport.iata_code || 'SGN';
  const airlineName = flight.airline?.name || 'Serene Flightways';
  const flightNumber = flight.flight_number || `SF${flight.id || '101'}`;
  const pnr = booking.booking_code || `#${booking.id}`;

  // Ghế của từng hành khách
  const passengerSeatMap = passengers.map((p) => {
    const assigned = seatAssignments.find(
      (s) => Number(s.booking_passenger_id) === Number(p.id) || Number(s.passenger_id) === Number(p.id)
    );
    const seatNo = assigned?.seat_no || p.seat_number || 'Chưa gán';
    return {
      name: p.passenger_name || 'Hành khách',
      passport: p.passport_no || '',
      seat: seatNo,
    };
  });

  const seatSummaryStr = passengerSeatMap.map((p) => `${p.name}: ${p.seat}`).join(' · ');

  const handleAddToCalendar = () => {
    const icsData = generateFlightIcsContent({
      booking,
      flight,
      passengers,
      seatInfo: seatSummaryStr,
    });
    const filename = `chuyen-bay-${pnr}-${depCode}-${arrCode}.ics`;
    downloadIcsFile(filename, icsData);
  };

  return (
    <div className="boarding-pass-wrapper" aria-label="Thẻ lên máy bay điện tử">
      <div className="boarding-pass-card">
        {/* Phần thân chính vé (Main Pass) */}
        <div className="boarding-pass-main">
          {/* Header vé */}
          <div className="bp-header">
            <div className="bp-brand">
              <span className="bp-brand-icon" aria-hidden="true">✈</span>
              <div>
                <strong>{airlineName}</strong>
                <small>Thẻ lên máy bay điện tử (E-Boarding Pass)</small>
              </div>
            </div>
            <div className="bp-pnr-box">
              <span className="bp-pnr-label">MÃ ĐẶT CHỖ (PNR)</span>
              <strong className="bp-pnr-code table-mono-cell tabular-nums">{pnr}</strong>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge status={booking.status} />
              </div>
            </div>
          </div>

          {/* Tuyến bay & thời gian */}
          <div className="bp-route-container">
            <div className="bp-airport bp-origin">
              <span className="bp-iata font-mono">{depCode}</span>
              <span className="bp-city">{depAirport.city || depAirport.name || 'Điểm đi'}</span>
              <span className="bp-time font-mono tabular-nums">
                {flight.departure_time ? formatTime(flight.departure_time) : '—:—'}
              </span>
              <small className="bp-date">
                {flight.departure_time ? formatDay(flight.departure_time) : ''}
              </small>
            </div>

            <div className="bp-flight-path" aria-hidden="true">
              <span className="bp-flight-duration">{flightNumber}</span>
              <div className="bp-path-line">
                <span className="bp-dot" />
                <span className="bp-plane-icon">✈</span>
                <span className="bp-dot" />
              </div>
              <span className="bp-class-tag">{fareClass.class_name || 'Hạng vé'}</span>
            </div>

            <div className="bp-airport bp-destination">
              <span className="bp-iata font-mono">{arrCode}</span>
              <span className="bp-city">{arrAirport.city || arrAirport.name || 'Điểm đến'}</span>
              <span className="bp-time font-mono tabular-nums">
                {flight.arrival_time ? formatTime(flight.arrival_time) : '—:—'}
              </span>
              <small className="bp-date">
                {flight.arrival_time ? formatDay(flight.arrival_time) : ''}
              </small>
            </div>
          </div>

          {/* Danh sách hành khách & số ghế */}
          <div className="bp-passengers-section">
            <span className="bp-section-title">HÀNH KHÁCH &amp; CHỖ NGỒI</span>
            <div className="bp-passenger-grid">
              {passengerSeatMap.length > 0 ? (
                passengerSeatMap.map((p, idx) => (
                  <div key={idx} className="bp-passenger-item">
                    <div className="bp-passenger-info">
                      <span className="bp-passenger-name"><strong>{p.name}</strong></span>
                      {p.passport ? (
                        <small className="bp-passenger-sub font-mono">{p.passport}</small>
                      ) : null}
                    </div>
                    <div className="bp-passenger-seat">
                      <span className="bp-seat-label">GHẾ</span>
                      <strong className="bp-seat-number font-mono">{p.seat}</strong>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bp-passenger-item">
                  <span className="bp-passenger-name">Hành khách theo mã đặt chỗ</span>
                  <div className="bp-passenger-seat">
                    <span className="bp-seat-label">GHẾ</span>
                    <strong className="bp-seat-number font-mono">Tự động</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Đường cắt đứt nét răng cưa giữa thân và cuống vé */}
        <div className="bp-perforation" aria-hidden="true">
          <div className="bp-notch bp-notch-top" />
          <div className="bp-perforated-line" />
          <div className="bp-notch bp-notch-bottom" />
        </div>

        {/* Cuống vé thu nhỏ (Stub / Tear-off) */}
        <div className="boarding-pass-stub">
          <div className="bp-stub-header">
            <span>CUỐNG VÉ</span>
            <strong className="font-mono">{flightNumber}</strong>
          </div>

          <div className="bp-stub-content">
            <div className="bp-stub-row">
              <small>HÀNH KHÁCH</small>
              <strong className="bp-stub-passenger">
                {passengerSeatMap[0]?.name || 'Hành khách'}
                {passengerSeatMap.length > 1 ? ` (+${passengerSeatMap.length - 1})` : ''}
              </strong>
            </div>

            <div className="bp-stub-row">
              <small>CHẶNG BAY</small>
              <strong className="font-mono">{depCode} → {arrCode}</strong>
            </div>

            <div className="bp-stub-row">
              <small>MÃ PNR</small>
              <strong className="font-mono">{pnr}</strong>
            </div>

            <div className="bp-stub-row bp-stub-seats">
              <small>SỐ GHẾ</small>
              <strong className="font-mono">
                {passengerSeatMap.map((p) => p.seat).join(', ') || 'Chưa chọn'}
              </strong>
            </div>
          </div>

          {/* Vạch mã vạch mô phỏng trang trí */}
          <div className="bp-barcode-block" aria-hidden="true">
            <div className="bp-barcode-lines" />
            <span className="bp-barcode-text font-mono">{pnr}</span>
            <small className="bp-barcode-note" style={{ fontSize: '0.65rem', color: 'var(--color-muted, #94a3b8)', display: 'block', textAlign: 'center', marginTop: '2px' }}>
              (Hình minh họa trang trí)
            </small>
          </div>
        </div>
      </div>

      {/* Thanh nút hành động: Tải vé PDF + Thêm vào lịch */}
      <div className="boarding-pass-actions">
        {booking.status === 'confirmed' && onDownloadPdf ? (
          <button
            className="button button-primary bp-action-btn"
            type="button"
            disabled={downloadingPdf}
            onClick={onDownloadPdf}
          >
            <Download size={16} aria-hidden="true" />
            <span>{downloadingPdf ? 'Đang chuẩn bị tệp PDF…' : 'Tải vé điện tử PDF'}</span>
          </button>
        ) : null}

        <button
          className="button button-outline bp-action-btn bp-calendar-btn"
          type="button"
          onClick={handleAddToCalendar}
          title="Tải tệp .ics để thêm lịch bay vào Google Calendar, Outlook hoặc Apple Calendar"
        >
          <Calendar size={16} aria-hidden="true" />
          <span>Thêm vào lịch (.ics)</span>
        </button>
      </div>
    </div>
  );
}
