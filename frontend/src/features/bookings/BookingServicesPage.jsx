import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { AppFooter } from '../../components/AppFooter';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { money } from '../../lib/formatters';
import { createBookingsApi } from './bookingsApi';
import { SearchSummaryBanner } from '../flights/FlightResultsPage';
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
    <div className="public-page booking-page" style={{ background: '#f4f1ea', minHeight: '100vh' }}>
      <AppHeader />

      <main className="booking-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
        {/* 1. Header Banner Tuyến bay chuẩn đồng bộ 100% với trang Kết quả tìm kiếm */}
        <SearchSummaryBanner
          tripType={isRoundTrip ? 'round_trip' : 'one_way'}
          passengerCount={passengerCount}
          departureAirport={outboundFlight?.departureAirport}
          arrivalAirport={outboundFlight?.arrivalAirport}
          departureDate={outboundFlight?.departure_time}
          returnDate={inboundFlight?.departure_time}
          currentStep={3}
          editUrl={`/bookings/${id}`}
          editText="Xem lại đặt chỗ"
        />

        {error ? (
          <div style={{ marginTop: '1rem' }}>
            <Notice type="error">{error}</Notice>
          </div>
        ) : null}

        {/* 2. Layout 2 cột chuẩn: Cột dịch vụ bổ trợ bên trái + Cột Widget tóm tắt bên phải */}
        <div className="results-layout-grid" style={{ marginTop: '1.25rem' }}>
          {/* CỘT TRÁI: CÁC THẺ DỊCH VỤ BỔ TRỢ */}
          <section className="results-main-col">
            <h2 className="services-page-title" style={{ color: '#0f382c', fontWeight: 800, fontSize: '1.4rem', margin: '0.25rem 0 1rem' }}>
              Lựa chọn các tiện ích bổ sung cho hành trình bay trọn vẹn
            </h2>

            <div className="services-cards-wrapper">
              {/* THẺ 1: Chọn chỗ ngồi yêu thích */}
              <div
                className={`service-vj-card ${expandedCard === 'seat' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'seat' ? '' : 'seat')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square seat" style={{ background: '#eef7f5', color: '#0f6b66' }}>💺</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Chọn chỗ ngồi yêu thích</span>
                      </div>
                      <p className="service-card-desc">Chọn vị trí ngồi thoải mái gần cửa sổ hoặc lối đi trước giờ khởi hành</p>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <div className="service-toggle-icon">{expandedCard === 'seat' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'seat' ? (
                  <div className="service-expanded-panel">
                    <p className="service-card-desc">Hệ thống sẽ xếp ghế tự động hoàn toàn miễn phí hoặc bạn có thể chọn vị trí ưng ý khi làm thủ tục check-in trực tuyến.</p>
                  </div>
                ) : null}
              </div>

              {/* THẺ 2: Chọn hành lý & tiện ích hành lý */}
              <div
                className={`service-vj-card ${expandedCard === 'baggage' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'baggage' ? '' : 'baggage')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square baggage">🧳</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Hành lý ký gửi & Tiện ích hành trình</span>
                      </div>
                      <p className="service-card-desc">Lựa chọn các gói hành lý ký gửi phù hợp với nhu cầu hành lý của bạn</p>

                      <div className="service-routes-grid">
                        <div className="service-route-col">
                          <span className="service-route-header">
                            {originCode} <span style={{ color: '#0f6b66' }}>✈</span> {destCode}
                          </span>
                          <span className="service-route-detail">
                            Đã bao gồm 20kg hành lý ký gửi tiêu chuẩn
                          </span>
                        </div>
                        {isRoundTrip ? (
                          <div className="service-route-col">
                            <span className="service-route-header">
                              {destCode} <span style={{ color: '#0f6b66' }}>✈</span> {originCode}
                            </span>
                            <span className="service-route-detail">
                              Đã bao gồm 20kg hành lý ký gửi tiêu chuẩn
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <span className="service-price-highlight">{money(baggagePrice)}</span>
                    <div className="service-toggle-icon">{expandedCard === 'baggage' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'baggage' ? (
                  <div className="service-expanded-panel">
                    <div className="service-options-grid">
                      <div
                        className={`service-option-box ${selectedBaggage === 'none' ? 'is-selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedBaggage('none'); }}
                      >
                        <div className="service-option-text">
                          <span className="service-option-name">Chỉ 7kg xách tay</span>
                          <span className="service-option-note">Không kèm hành lý ký gửi</span>
                        </div>
                        <span className="service-option-cost">0 VND</span>
                      </div>
                      <div
                        className={`service-option-box ${selectedBaggage === '20kg' ? 'is-selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedBaggage('20kg'); }}
                      >
                        <div className="service-option-text">
                          <span className="service-option-name">Gói 20kg ký gửi (Khuyên dùng)</span>
                          <span className="service-option-note">Được mang dụng cụ thể thao</span>
                        </div>
                        <span className="service-option-cost">400.000 VND</span>
                      </div>
                      <div
                        className={`service-option-box ${selectedBaggage === '30kg' ? 'is-selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedBaggage('30kg'); }}
                      >
                        <div className="service-option-text">
                          <span className="service-option-name">Gói 30kg ký gửi</span>
                          <span className="service-option-note">Thoải mái mua sắm quà tặng</span>
                        </div>
                        <span className="service-option-cost">550.000 VND</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* THẺ 3: Suất ăn ẩm thực Serene Sky Dining */}
              <div
                className={`service-vj-card ${expandedCard === 'meal' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'meal' ? '' : 'meal')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square meal">🍱</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Suất ăn ẩm thực</span>
                        <span className="service-badge-sub" style={{ color: '#0f6b66' }}>Serene Sky Dining</span>
                      </div>

                      <div className="service-routes-grid">
                        <div className="service-route-col">
                          <span className="service-route-header">
                            {originCode} <span style={{ color: '#0f6b66' }}>✈</span> {destCode}
                          </span>
                          <span className="service-route-detail">{selectedMeal === 'standard' ? 'Suất ăn nhẹ theo tiêu chuẩn hãng' : 'Set ẩm thực cao cấp + Thức uống'}</span>
                        </div>
                        {isRoundTrip ? (
                          <div className="service-route-col">
                            <span className="service-route-header">
                              {destCode} <span style={{ color: '#0f6b66' }}>✈</span> {originCode}
                            </span>
                            <span className="service-route-detail">{selectedMeal === 'standard' ? 'Suất ăn nhẹ theo tiêu chuẩn hãng' : 'Set ẩm thực cao cấp + Thức uống'}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <span className="service-price-highlight">{money(mealPrice)}</span>
                    <div className="service-toggle-icon">{expandedCard === 'meal' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'meal' ? (
                  <div className="service-expanded-panel">
                    <div className="service-options-grid">
                      <div
                        className={`service-option-box ${selectedMeal === 'standard' ? 'is-selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedMeal('standard'); }}
                      >
                        <div className="service-option-text">
                          <span className="service-option-name">Suất ăn tiêu chuẩn (Mặc định)</span>
                          <span className="service-option-note">Bánh ngọt / Cơm nóng theo mùa</span>
                        </div>
                        <span className="service-option-cost">0 VND</span>
                      </div>
                      <div
                        className={`service-option-box ${selectedMeal === 'premium' ? 'is-selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedMeal('premium'); }}
                      >
                        <div className="service-option-text">
                          <span className="service-option-name">Set ẩm thực Serene Gourmet</span>
                          <span className="service-option-note">Món chính thượng hạng + Nước ép trái cây</span>
                        </div>
                        <span className="service-option-cost">85.000 VND</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* THẺ 4: Dịch vụ đưa đón sân bay Serene Transfer */}
              <div
                className={`service-vj-card ${expandedCard === 'taxi' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'taxi' ? '' : 'taxi')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square taxi">🚕</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Xe đưa đón sân bay (Airport Transfer)</span>
                      </div>
                      <p className="service-card-desc">Đặt trước xe đưa đón tiện nghi, đón chuẩn giờ tại sảnh đến</p>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <span className="service-price-highlight">{selectedTaxi ? '250.000 VND' : 'Chưa chọn'}</span>
                    <div className="service-toggle-icon">{expandedCard === 'taxi' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'taxi' ? (
                  <div className="service-expanded-panel">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedTaxi}
                        onChange={(e) => setSelectedTaxi(e.target.checked)}
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0f6b66' }}
                      />
                      <div>
                        <strong>Đặt xe 4 chỗ đón tại sân bay {destCity} ({destCode})</strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Đồng giá 250.000 VND về trung tâm thành phố trong bán kính 20km.</p>
                      </div>
                    </label>
                  </div>
                ) : null}
              </div>

              {/* THẺ 5: Bảo hiểm hành trình Serene Travel Shield */}
              <div
                className={`service-vj-card ${expandedCard === 'insurance' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'insurance' ? '' : 'insurance')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square insurance">🛡️</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Bảo hiểm hành trình Serene Travel Shield</span>
                      </div>
                      <div className="service-routes-grid" style={{ border: 'none', margin: 0, padding: 0 }}>
                        <span className="service-route-header">
                          {originCode} <span style={{ color: '#0f6b66' }}>✈</span> {destCode}
                        </span>
                      </div>
                      <p className="service-card-desc">
                        Bảo vệ toàn diện cho hành trình bay: bồi thường hoãn chuyến, thất lạc hành lý và hỗ trợ y tế khẩn cấp.
                      </p>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <span className="service-price-highlight">{money(insurancePrice)}</span>
                    <div className="service-toggle-icon">{expandedCard === 'insurance' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'insurance' ? (
                  <div className="service-expanded-panel">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedInsurance}
                        onChange={(e) => setSelectedInsurance(e.target.checked)}
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0f6b66' }}
                      />
                      <div>
                        <strong>Gói bảo hiểm toàn diện (72.000 VND / hành khách)</strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Hợp tác cùng đối tác bảo hiểm uy tín, cấp chứng nhận điện tử ngay sau khi đặt vé thành công.</p>
                      </div>
                    </label>
                  </div>
                ) : null}
              </div>

              {/* THẺ 6: Dịch vụ ưu tiên Serene Priority & Phòng chờ */}
              <div
                className={`service-vj-card ${expandedCard === 'vip' ? 'is-expanded' : ''}`}
                onClick={() => setExpandedCard(expandedCard === 'vip' ? '' : 'vip')}
              >
                <div className="service-card-main-row">
                  <div className="service-card-left-group">
                    <div className="service-icon-square vip">👤</div>
                    <div className="service-text-group">
                      <div className="service-title-container">
                        <span className="service-card-heading">Dịch vụ ưu tiên & Phòng chờ</span>
                        <span className="service-badge-new">Premium</span>
                      </div>
                      <p className="service-card-desc">Ưu tiên làm thủ tục tại quầy thương gia, lối đi an ninh nhanh chóng</p>
                    </div>
                  </div>
                  <div className="service-card-action-group">
                    <span className="service-price-highlight">{money(priorityPrice)}</span>
                    <div className="service-toggle-icon">{expandedCard === 'vip' ? '▲' : '❯'}</div>
                  </div>
                </div>
                {expandedCard === 'vip' ? (
                  <div className="service-expanded-panel">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedPriority}
                        onChange={(e) => setSelectedPriority(e.target.checked)}
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0f6b66' }}
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
          </section>

          {/* CỘT PHẢI: BOOKING SUMMARY WIDGET ĐỒNG BỘ 100% VỚI TRANG TÌM KIẾM */}
          <aside className="booking-summary-widget" aria-label="Thông tin đặt chỗ">
            <div className="booking-summary-header">
              <h3 className="booking-summary-title">THÔNG TIN ĐẶT CHỖ</h3>
            </div>

            <div className="booking-summary-body">
              {/* Thông tin hành khách */}
              <div className="summary-passenger-box">
                <span className="summary-box-label">Thông tin hành khách</span>
                <div className="summary-passenger-content">
                  <strong>{passengerCount} Người lớn</strong>
                </div>
              </div>

              {/* Chuyến đi */}
              <div className="summary-leg-card is-current">
                <div className="summary-leg-header">
                  <span className="summary-leg-name">Chuyến đi</span>
                  <strong className="summary-leg-price table-mono-cell tabular-nums">
                    {money(baseBookingAmount / (isRoundTrip ? 2 : 1))}
                  </strong>
                </div>
                <div className="summary-leg-route">
                  <span className="summary-leg-city">{originCity} ({originCode})</span>
                  <span className="summary-leg-arrow" aria-hidden="true">➔</span>
                  <span className="summary-leg-city">{destCity} ({destCode})</span>
                </div>
                <div className="summary-leg-details">
                  <div className="summary-flight-meta">
                    <strong className="summary-flight-time">{formatFlightTime(outboundFlight?.departure_time)}</strong>
                    <span className="summary-flight-carrier">{outboundFlight?.flight_number || 'SF101'}</span>
                  </div>
                </div>
                <div className="summary-pricing-breakdown">
                  <div className="pricing-row">
                    <span>Giá vé:</span>
                    <strong>{money(Math.round(baseBookingAmount * 0.75 / (isRoundTrip ? 2 : 1)))}</strong>
                  </div>
                  <div className="pricing-row">
                    <span>Thuế, phí:</span>
                    <strong>{money(Math.round(baseBookingAmount * 0.25 / (isRoundTrip ? 2 : 1)))}</strong>
                  </div>
                </div>
              </div>

              {/* Chuyến về (nếu có) */}
              {isRoundTrip ? (
                <div className="summary-leg-card is-current">
                  <div className="summary-leg-header">
                    <span className="summary-leg-name">Chuyến về</span>
                    <strong className="summary-leg-price table-mono-cell tabular-nums">
                      {money(baseBookingAmount / 2)}
                    </strong>
                  </div>
                  <div className="summary-leg-route">
                    <span className="summary-leg-city">{destCity} ({destCode})</span>
                    <span className="summary-leg-arrow" aria-hidden="true">➔</span>
                    <span className="summary-leg-city">{originCity} ({originCode})</span>
                  </div>
                  <div className="summary-leg-details">
                    <div className="summary-flight-meta">
                      <strong className="summary-flight-time">{formatFlightTime(inboundFlight?.departure_time)}</strong>
                      <span className="summary-flight-carrier">{inboundFlight?.flight_number || 'SF102'}</span>
                    </div>
                  </div>
                  <div className="summary-pricing-breakdown">
                    <div className="pricing-row">
                      <span>Giá vé:</span>
                      <strong>{money(Math.round(baseBookingAmount * 0.75 / 2))}</strong>
                    </div>
                    <div className="pricing-row">
                      <span>Thuế, phí:</span>
                      <strong>{money(Math.round(baseBookingAmount * 0.25 / 2))}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Dịch vụ bổ sung */}
              {totalAddonsPrice > 0 ? (
                <div className="summary-leg-card" style={{ background: '#f0fdfa', borderColor: '#ccfbf1' }}>
                  <div className="summary-leg-header">
                    <span className="summary-leg-name" style={{ color: '#0f6b66' }}>Dịch vụ bổ sung</span>
                    <strong className="summary-leg-price table-mono-cell tabular-nums" style={{ color: '#0f6b66' }}>
                      {money(totalAddonsPrice)}
                    </strong>
                  </div>
                  <div className="summary-pricing-breakdown" style={{ borderTop: 'none', paddingTop: 0 }}>
                    {baggagePrice > 0 ? <div className="pricing-row"><span>Hành lý ({selectedBaggage}):</span><strong>{money(baggagePrice)}</strong></div> : null}
                    {mealPrice > 0 ? <div className="pricing-row"><span>Suất ăn ẩm thực:</span><strong>{money(mealPrice)}</strong></div> : null}
                    {taxiPrice > 0 ? <div className="pricing-row"><span>Xe đưa đón:</span><strong>{money(taxiPrice)}</strong></div> : null}
                    {insurancePrice > 0 ? <div className="pricing-row"><span>Bảo hiểm Travel Shield:</span><strong>{money(insurancePrice)}</strong></div> : null}
                    {priorityPrice > 0 ? <div className="pricing-row"><span>Lối đi ưu tiên:</span><strong>{money(priorityPrice)}</strong></div> : null}
                  </div>
                </div>
              ) : null}

              {/* Hộp tổng tiền Teal & Amber chuẩn */}
              <div className="summary-total-strip">
                <span>TỔNG TIỀN</span>
                <span className="summary-total-amount">{money(grandTotal)}</span>
              </div>

              {/* Nút Đi tiếp Amber của Serene */}
              <button
                type="button"
                className="summary-continue-btn"
                disabled={submitting}
                onClick={handleProceedToPayment}
              >
                {submitting ? 'Đang chuyển tiếp…' : 'Đi tiếp ➔'}
              </button>
            </div>
          </aside>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
