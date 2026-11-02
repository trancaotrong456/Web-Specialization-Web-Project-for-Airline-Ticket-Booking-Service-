import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AppFooter } from '../../components/AppFooter';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { money } from '../../lib/formatters';
import { createBookingsApi } from './bookingsApi';
import './bookingServices.css';

export function BookingServicesPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, request } = useAuth();
  const api = useMemo(() => createBookingsApi(request), [request]);

  const guestEmail = location.state?.guestEmail || sessionStorage.getItem(`booking_guest_email_${id}`) || '';
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(!location.state?.booking);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Expanded card state to show/hide options
  const [expandedCard, setExpandedCard] = useState('baggage');

  // Add-on selections state
  const [selectedBaggage, setSelectedBaggage] = useState('20kg');
  const [selectedMeal, setSelectedMeal] = useState('standard');
  const [selectedTaxi, setSelectedTaxi] = useState(false);
  const [selectedInsurance, setSelectedInsurance] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState(false);

  // Accordion state in Sidebar
  const [openPassengerAccordion, setOpenPassengerAccordion] = useState(true);
  const [openOutboundAccordion, setOpenOutboundAccordion] = useState(true);
  const [openInboundAccordion, setOpenInboundAccordion] = useState(true);

  // Fetch booking detail if not present in location state
  useEffect(() => {
    if (booking) return;
    let active = true;
    api.bookingDetail(id, user ? undefined : guestEmail)
      .then((data) => {
        if (active) {
          setBooking(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || 'Không thể tải thông tin đặt chỗ.');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [api, booking, guestEmail, id, user]);

  const flight = booking?.flight;
  const segments = booking?.itinerarySegments || [];
  const outboundFlight = flight;
  const inboundSegment = segments.find((s) => Number(s.leg_order) === 2);
  const inboundFlight = inboundSegment?.flight;
  const isRoundTrip = Boolean(inboundFlight) || booking?.trip_type === 'round_trip';

  const passengerCount = Math.max(1, booking?.passengers?.length || 1);

  // Calculate prices
  const baseBookingAmount = Number(booking?.total_amount || 0);

  const baggagePrice = selectedBaggage === '20kg' ? 400000 : selectedBaggage === '30kg' ? 550000 : selectedBaggage === '40kg' ? 700000 : 0;
  const mealPrice = selectedMeal === 'premium' ? 85000 * passengerCount : 0;
  const taxiPrice = selectedTaxi ? 250000 : 0;
  const insurancePrice = selectedInsurance ? 72000 * passengerCount : 0;
  const priorityPrice = selectedPriority ? 120000 * passengerCount : 0;

  const totalAddonsPrice = baggagePrice + mealPrice + taxiPrice + insurancePrice + priorityPrice;
  const grandTotal = baseBookingAmount + totalAddonsPrice;

  // Flight formatting helpers
  const originCode = outboundFlight?.departureAirport?.iata_code || 'SGN';
  const originCity = outboundFlight?.departureAirport?.city || outboundFlight?.departureAirport?.name || 'Tp. Hồ Chí Minh';
  const destCode = outboundFlight?.arrivalAirport?.iata_code || 'HAN';
  const destCity = outboundFlight?.arrivalAirport?.city || outboundFlight?.arrivalAirport?.name || 'Hà Nội';

  const formatFlightTime = (val) => {
    if (!val) return '10:00';
    try {
      const d = new Date(val);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '10:00';
    }
  };

  const formatFlightDate = (val) => {
    if (!val) return 'T3, 03/11/2026';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return 'T3, 03/11/2026';
    }
  };

  const handleProceedToPayment = async () => {
    setSubmitting(true);
    try {
      navigate(`/bookings/${id}/payment`, {
        state: {
          booking: { ...booking, total_amount: grandTotal },
          guestEmail
        }
      });
    } catch {
      navigate(`/bookings/${id}/payment`, {
        state: { booking, guestEmail }
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-page booking-page">
        <AppHeader />
        <main className="booking-main">
          <LoadingView label="Đang tải dịch vụ bổ sung cho chuyến bay…" />
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="services-page-wrapper">
      <AppHeader />

      {/* 1. Header Banner Tuyến bay phong cách Serene Flightways & Stepper 4 bước */}
      <div className="services-flight-banner">
        <div className="services-banner-left">
          <div className="services-trip-type-label">
            <span>✈</span>
            <span>{isRoundTrip ? 'CHUYẾN BAY KHỨ HỒI' : 'CHUYẾN BAY MỘT CHIỀU'} | {passengerCount} Người lớn</span>
          </div>
          <div className="services-route-locations">
            <div className="services-location-item">
              <span className="loc-dot origin" />
              <span>Điểm khởi hành:</span>
              <span className="loc-name">{originCity} ( {originCode} )</span>
            </div>
            <div className="services-location-item">
              <span className="loc-dot dest" />
              <span>Điểm đến:</span>
              <span className="loc-name">{destCity} ( {destCode} )</span>
            </div>
          </div>
        </div>

        <div className="services-stepper-badges">
          <div className="services-stepper-circle is-done" title="Chọn chuyến bay">✈</div>
          <div className="services-stepper-circle is-done" title="Thông tin hành khách">👤</div>
          <div className="services-stepper-circle is-active" title="Dịch vụ bổ sung">🛒</div>
          <div className="services-stepper-circle" title="Thanh toán">💲</div>
        </div>
      </div>

      {error ? (
        <div style={{ maxWidth: 1240, margin: '1rem auto', padding: '0 1rem' }}>
          <Notice type="error">{error}</Notice>
        </div>
      ) : null}

      {/* 2. Container chính: Cột danh sách dịch vụ (trái) + Cột Thông tin đặt chỗ (phải) */}
      <div className="services-main-container">
        {/* CỘT TRÁI: CÁC THẺ DỊCH VỤ BỔ TRỢ */}
        <div>
          <h2 className="services-headline">
            Lựa chọn các tiện ích bổ sung cho hành trình bay trọn vẹn
          </h2>

          <div className="services-card-list">
            {/* THẺ 1: Chọn chỗ ngồi yêu thích */}
            <div
              className={`service-item-card ${expandedCard === 'seat' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'seat' ? '' : 'seat')}
            >
              <div className="service-card-left">
                <div className="service-icon-box seat">💺</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Chọn chỗ ngồi yêu thích</span>
                  </div>
                  <p className="service-desc-text">Chọn vị trí ngồi thoải mái gần cửa sổ hoặc lối đi trước giờ khởi hành</p>
                </div>
              </div>
              <div className="service-card-right">
                <div className="service-chevron-btn">{expandedCard === 'seat' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'seat' ? (
              <div className="service-expand-content">
                <p className="service-desc-text">Hệ thống sẽ xếp ghế tự động hoàn toàn miễn phí hoặc bạn có thể chọn vị trí ưng ý khi làm thủ tục check-in trực tuyến.</p>
              </div>
            ) : null}

            {/* THẺ 2: Chọn hành lý & tiện ích hành lý */}
            <div
              className={`service-item-card ${expandedCard === 'baggage' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'baggage' ? '' : 'baggage')}
            >
              <div className="service-card-left">
                <div className="service-icon-box baggage">🧳</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Hành lý ký gửi & Tiện ích hành trình</span>
                  </div>
                  <p className="service-desc-text">Lựa chọn các gói hành lý ký gửi phù hợp với nhu cầu hành lý của bạn</p>

                  <div className="services-legs-summary">
                    <div className="service-leg-col">
                      <span className="service-leg-title">
                        {originCode} <span style={{ color: '#0f766e' }}>✈</span> {destCode}
                      </span>
                      <span className="service-leg-detail">
                        Đã bao gồm 20kg hành lý ký gửi tiêu chuẩn
                      </span>
                    </div>
                    {isRoundTrip ? (
                      <div className="service-leg-col">
                        <span className="service-leg-title">
                          {destCode} <span style={{ color: '#0f766e' }}>✈</span> {originCode}
                        </span>
                        <span className="service-leg-detail">
                          Đã bao gồm 20kg hành lý ký gửi tiêu chuẩn
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="service-card-right">
                <span className="service-price-tag">{money(baggagePrice)}</span>
                <div className="service-chevron-btn">{expandedCard === 'baggage' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'baggage' ? (
              <div className="service-expand-content">
                <div className="service-option-list">
                  <div
                    className={`service-option-item ${selectedBaggage === 'none' ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedBaggage('none'); }}
                  >
                    <div className="service-option-info">
                      <span className="service-option-title">Chỉ 7kg xách tay</span>
                      <span className="service-option-desc">Không kèm hành lý ký gửi</span>
                    </div>
                    <span className="service-option-price">0 VND</span>
                  </div>
                  <div
                    className={`service-option-item ${selectedBaggage === '20kg' ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedBaggage('20kg'); }}
                  >
                    <div className="service-option-info">
                      <span className="service-option-title">Gói 20kg ký gửi (Khuyên dùng)</span>
                      <span className="service-option-desc">Được mang dụng cụ thể thao</span>
                    </div>
                    <span className="service-option-price">400.000 VND</span>
                  </div>
                  <div
                    className={`service-option-item ${selectedBaggage === '30kg' ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedBaggage('30kg'); }}
                  >
                    <div className="service-option-info">
                      <span className="service-option-title">Gói 30kg ký gửi</span>
                      <span className="service-option-desc">Thoải mái mua sắm quà tặng</span>
                    </div>
                    <span className="service-option-price">550.000 VND</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* THẺ 3: Suất ăn ẩm thực Serene Sky Dining */}
            <div
              className={`service-item-card ${expandedCard === 'meal' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'meal' ? '' : 'meal')}
            >
              <div className="service-card-left">
                <div className="service-icon-box meal">🍱</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Suất ăn ẩm thực</span>
                    <span className="service-sub-tag">Serene Sky Dining</span>
                  </div>

                  <div className="services-legs-summary">
                    <div className="service-leg-col">
                      <span className="service-leg-title">
                        {originCode} <span style={{ color: '#0f766e' }}>✈</span> {destCode}
                      </span>
                      <span className="service-leg-detail">{selectedMeal === 'standard' ? 'Suất ăn nhẹ theo tiêu chuẩn hãng' : 'Set ẩm thực cao cấp + Thức uống'}</span>
                    </div>
                    {isRoundTrip ? (
                      <div className="service-leg-col">
                        <span className="service-leg-title">
                          {destCode} <span style={{ color: '#0f766e' }}>✈</span> {originCode}
                        </span>
                        <span className="service-leg-detail">{selectedMeal === 'standard' ? 'Suất ăn nhẹ theo tiêu chuẩn hãng' : 'Set ẩm thực cao cấp + Thức uống'}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="service-card-right">
                <span className="service-price-tag">{money(mealPrice)}</span>
                <div className="service-chevron-btn">{expandedCard === 'meal' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'meal' ? (
              <div className="service-expand-content">
                <div className="service-option-list">
                  <div
                    className={`service-option-item ${selectedMeal === 'standard' ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedMeal('standard'); }}
                  >
                    <div className="service-option-info">
                      <span className="service-option-title">Suất ăn tiêu chuẩn (Mặc định)</span>
                      <span className="service-option-desc">Bánh ngọt / Cơm nóng theo mùa</span>
                    </div>
                    <span className="service-option-price">0 VND</span>
                  </div>
                  <div
                    className={`service-option-item ${selectedMeal === 'premium' ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedMeal('premium'); }}
                  >
                    <div className="service-option-info">
                      <span className="service-option-title">Set ẩm thực Serene Gourmet</span>
                      <span className="service-option-desc">Món chính thượng hạng + Nước ép trái cây</span>
                    </div>
                    <span className="service-option-price">85.000 VND</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* THẺ 4: Dịch vụ đưa đón sân bay Serene Transfer */}
            <div
              className={`service-item-card ${expandedCard === 'taxi' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'taxi' ? '' : 'taxi')}
            >
              <div className="service-card-left">
                <div className="service-icon-box taxi">🚕</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Xe đưa đón sân bay (Airport Transfer)</span>
                  </div>
                  <p className="service-desc-text">Đặt trước xe đưa đón tiện nghi, đón chuẩn giờ tại sảnh đến</p>
                </div>
              </div>
              <div className="service-card-right">
                <span className="service-price-tag">{selectedTaxi ? '250.000 VND' : 'Chưa chọn'}</span>
                <div className="service-chevron-btn">{expandedCard === 'taxi' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'taxi' ? (
              <div className="service-expand-content">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedTaxi}
                    onChange={(e) => setSelectedTaxi(e.target.checked)}
                    style={{ width: '1.2rem', height: '1.2rem' }}
                  />
                  <div>
                    <strong>Đặt xe 4 chỗ đón tại sân bay {destCity} ({destCode})</strong>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Đồng giá 250.000 VND về trung tâm thành phố trong bán kính 20km.</p>
                  </div>
                </label>
              </div>
            ) : null}

            {/* THẺ 5: Bảo hiểm hành trình Serene Travel Shield */}
            <div
              className={`service-item-card ${expandedCard === 'insurance' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'insurance' ? '' : 'insurance')}
            >
              <div className="service-card-left">
                <div className="service-icon-box insurance">🛡️</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Bảo hiểm hành trình Serene Travel Shield</span>
                  </div>
                  <div className="services-legs-summary" style={{ border: 'none', margin: 0, padding: 0 }}>
                    <span className="service-leg-title">
                      {originCode} <span style={{ color: '#0f766e' }}>✈</span> {destCode}
                    </span>
                  </div>
                  <p className="service-desc-text">
                    Bảo vệ toàn diện cho hành trình bay: bồi thường hoãn chuyến, thất lạc hành lý và hỗ trợ y tế khẩn cấp.
                  </p>
                </div>
              </div>
              <div className="service-card-right">
                <span className="service-price-tag">{money(insurancePrice)}</span>
                <div className="service-chevron-btn">{expandedCard === 'insurance' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'insurance' ? (
              <div className="service-expand-content">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedInsurance}
                    onChange={(e) => setSelectedInsurance(e.target.checked)}
                    style={{ width: '1.2rem', height: '1.2rem' }}
                  />
                  <div>
                    <strong>Gói bảo hiểm toàn diện (72.000 VND / hành khách)</strong>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Hợp tác cùng đối tác bảo hiểm uy tín, cấp chứng nhận điện tử ngay sau khi đặt vé thành công.</p>
                  </div>
                </label>
              </div>
            ) : null}

            {/* THẺ 6: Dịch vụ ưu tiên Serene Priority & Phòng chờ */}
            <div
              className={`service-item-card ${expandedCard === 'vip' ? 'is-expanded' : ''}`}
              onClick={() => setExpandedCard(expandedCard === 'vip' ? '' : 'vip')}
            >
              <div className="service-card-left">
                <div className="service-icon-box vip">👤</div>
                <div className="service-info-col">
                  <div className="service-title-row">
                    <span className="service-main-title">Dịch vụ ưu tiên & Phòng chờ</span>
                    <span className="service-new-tag">Premium</span>
                  </div>
                  <p className="service-desc-text">Ưu tiên làm thủ tục tại quầy thương gia, lối đi an ninh nhanh chóng</p>
                </div>
              </div>
              <div className="service-card-right">
                <span className="service-price-tag">{money(priorityPrice)}</span>
                <div className="service-chevron-btn">{expandedCard === 'vip' ? '▲' : '❯'}</div>
              </div>
            </div>
            {expandedCard === 'vip' ? (
              <div className="service-expand-content">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.checked)}
                    style={{ width: '1.2rem', height: '1.2rem' }}
                  />
                  <div>
                    <strong>Lối đi ưu tiên Serene Priority Pass (120.000 VND / hành khách)</strong>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Không cần xếp hàng lâu, thủ tục nhanh chóng tại quầy ưu tiên riêng biệt.</p>
                  </div>
                </label>
              </div>
            ) : null}
          </div>
        </div>

        {/* CỘT PHẢI: THÔNG TIN ĐẶT CHỖ (SIDEBAR PHONG CÁCH SERENE FLIGHTWAYS) */}
        <div className="services-sidebar-card">
          <div className="services-sidebar-header">
            <span className="services-sidebar-title">THÔNG TIN ĐẶT CHỖ</span>
            <button className="services-detail-link-btn" type="button" onClick={() => navigate(`/bookings/${id}`)}>
              Chi Tiết
            </button>
          </div>

          {/* Accordion: Thông tin hành khách */}
          <div className="services-sidebar-section">
            <div
              className="services-accordion-header"
              onClick={() => setOpenPassengerAccordion(!openPassengerAccordion)}
            >
              <span className="services-acc-title">Thông tin hành khách</span>
              <span>{openPassengerAccordion ? '▲' : '▼'}</span>
            </div>
            {openPassengerAccordion ? (
              <div style={{ padding: '0 1.25rem 0.85rem 1.25rem', fontSize: '0.82rem', color: '#475569' }}>
                {(booking?.passengers || [{ passenger_name: 'Hành khách 1' }]).map((p, idx) => (
                  <div key={idx} style={{ padding: '0.25rem 0', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{idx + 1}. {p.passenger_name}</span>
                    <span style={{ color: '#0f766e', fontWeight: 600 }}>Người lớn</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Accordion: Chuyến đi */}
          <div className="services-sidebar-section">
            <div
              className="services-accordion-header"
              onClick={() => setOpenOutboundAccordion(!openOutboundAccordion)}
            >
              <span className="services-acc-title">Chuyến đi</span>
              <span className="services-leg-badge">
                {money(baseBookingAmount / (isRoundTrip ? 2 : 1))} <span>✎</span>
              </span>
            </div>
            {openOutboundAccordion ? (
              <div className="services-leg-route-desc">
                <span className="services-leg-route-name">
                  {originCity} ({originCode}) <span style={{ color: '#0f766e' }}>✈</span> {destCity} ({destCode})
                </span>
                <span className="services-leg-meta">
                  {formatFlightDate(outboundFlight?.departure_time)} | {formatFlightTime(outboundFlight?.departure_time)} | {outboundFlight?.flight_number || 'SF101'}
                </span>
                <div className="services-breakdown-row" style={{ padding: '0.35rem 0' }}>
                  <span>Giá vé</span>
                  <span>{money(Math.round(baseBookingAmount * 0.75 / (isRoundTrip ? 2 : 1)))}</span>
                </div>
                <div className="services-breakdown-row" style={{ padding: '0.35rem 0' }}>
                  <span>Thuế, phí</span>
                  <span>{money(Math.round(baseBookingAmount * 0.25 / (isRoundTrip ? 2 : 1)))}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Accordion: Chuyến về (nếu có) */}
          {isRoundTrip ? (
            <div className="services-sidebar-section">
              <div
                className="services-accordion-header"
                onClick={() => setOpenInboundAccordion(!openInboundAccordion)}
              >
                <span className="services-acc-title">Chuyến về</span>
                <span className="services-leg-badge">
                  {money(baseBookingAmount / 2)} <span>✎</span>
                </span>
              </div>
              {openInboundAccordion ? (
                <div className="services-leg-route-desc">
                  <span className="services-leg-route-name">
                    {destCity} ({destCode}) <span style={{ color: '#0f766e' }}>✈</span> {originCity} ({originCode})
                  </span>
                  <span className="services-leg-meta">
                    {formatFlightDate(inboundFlight?.departure_time)} | {formatFlightTime(inboundFlight?.departure_time)} | {inboundFlight?.flight_number || 'SF102'}
                  </span>
                  <div className="services-breakdown-row" style={{ padding: '0.35rem 0' }}>
                    <span>Giá vé</span>
                    <span>{money(Math.round(baseBookingAmount * 0.75 / 2))}</span>
                  </div>
                  <div className="services-breakdown-row" style={{ padding: '0.35rem 0' }}>
                    <span>Thuế, phí</span>
                    <span>{money(Math.round(baseBookingAmount * 0.25 / 2))}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Accordion: Dịch vụ bổ sung */}
          {totalAddonsPrice > 0 ? (
            <div className="services-sidebar-section">
              <div className="services-accordion-header">
                <span className="services-acc-title">Dịch vụ bổ sung</span>
                <span className="services-leg-badge" style={{ color: '#0f766e' }}>
                  {money(totalAddonsPrice)}
                </span>
              </div>
              <div style={{ padding: '0 0 0.5rem 0' }}>
                {baggagePrice > 0 ? (
                  <div className="services-addon-item">
                    <span className="addon-title">Hành lý ký gửi ({selectedBaggage})</span>
                    <span className="addon-price">{money(baggagePrice)}</span>
                  </div>
                ) : null}
                {mealPrice > 0 ? (
                  <div className="services-addon-item">
                    <span className="addon-title">Ẩm thực Serene Gourmet</span>
                    <span className="addon-price">{money(mealPrice)}</span>
                  </div>
                ) : null}
                {taxiPrice > 0 ? (
                  <div className="services-addon-item">
                    <span className="addon-title">Xe đưa đón sân bay</span>
                    <span className="addon-price">{money(taxiPrice)}</span>
                  </div>
                ) : null}
                {insurancePrice > 0 ? (
                  <div className="services-addon-item">
                    <span className="addon-title">Bảo hiểm Serene Travel Shield</span>
                    <span className="addon-price">{money(insurancePrice)}</span>
                  </div>
                ) : null}
                {priorityPrice > 0 ? (
                  <div className="services-addon-item">
                    <span className="addon-title">Lối đi ưu tiên Serene Priority</span>
                    <span className="addon-price">{money(priorityPrice)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Banner Tổng Tiền phong cách Serene */}
          <div className="services-total-banner">
            <span className="services-total-caption">Tổng tiền</span>
            <span className="services-total-amount">{money(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* 3. Bottom Bar Cố định: Quay lại | Tổng tiền | Đi tiếp */}
      <footer className="services-bottom-bar">
        <button
          className="services-bottom-back-btn"
          type="button"
          onClick={() => navigate(-1)}
        >
          ‹ Quay lại
        </button>

        <div className="services-bottom-center-total">
          <span className="services-center-caption">Tổng tiền</span>
          <span className="services-center-val">
            {money(grandTotal)} <small>Chi tiết ▾</small>
          </span>
        </div>

        <button
          className="services-bottom-next-btn"
          type="button"
          disabled={submitting}
          onClick={handleProceedToPayment}
        >
          <span>{submitting ? 'Đang chuyển tiếp…' : 'Đi tiếp'}</span>
          <span>➔</span>
        </button>
      </footer>
    </div>
  );
}
