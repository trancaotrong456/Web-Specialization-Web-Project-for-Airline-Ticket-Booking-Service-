import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
    <div className="public-page booking-page" style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <AppHeader />

      <main className="services-unified-container">
        {/* 1. Header Banner Tuyến bay đồng bộ với trang Đặt chỗ */}
        <section className="services-step-header" aria-label="Thông tin tuyến bay">
          <div className="services-step-route-info">
            <span className="services-step-trip-badge">
              <span>✈</span>
              <span>{isRoundTrip ? 'CHUYẾN BAY KHỨ HỒI' : 'CHUYẾN BAY MỘT CHIỀU'} · {passengerCount} HÀNH KHÁCH</span>
            </span>
            <h1 className="services-step-route-title">
              <span>{originCity} ({originCode})</span>
              <span className="route-arrow">➔</span>
              <span>{destCity} ({destCode})</span>
            </h1>
          </div>

          <div className="services-stepper-badges" aria-label="Quy trình đặt vé">
            <div className="services-stepper-step is-done" title="Bước 1: Chọn chuyến bay">✈</div>
            <div className="services-stepper-step is-done" title="Bước 2: Thông tin hành khách">👤</div>
            <div className="services-stepper-step is-active" title="Bước 3: Dịch vụ bổ sung">🛒</div>
            <div className="services-stepper-step" title="Bước 4: Thanh toán">💲</div>
          </div>
        </section>

        {error ? (
          <div style={{ marginTop: '1rem' }}>
            <Notice type="error">{error}</Notice>
          </div>
        ) : null}

        {/* 2. Container chính: Cột danh sách dịch vụ (trái) + Cột Thông tin đặt chỗ (phải) */}
        <div className="services-checkout-layout">
          {/* CỘT TRÁI: CÁC THẺ DỊCH VỤ BỔ TRỢ */}
          <section className="services-main-col">
            <h2 className="services-page-title">
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
                    <div className="service-icon-square seat">💺</div>
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
                            {originCode} <span style={{ color: '#0e3d36' }}>✈</span> {destCode}
                          </span>
                          <span className="service-route-detail">
                            Đã bao gồm 20kg hành lý ký gửi tiêu chuẩn
                          </span>
                        </div>
                        {isRoundTrip ? (
                          <div className="service-route-col">
                            <span className="service-route-header">
                              {destCode} <span style={{ color: '#0e3d36' }}>✈</span> {originCode}
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
                        <span className="service-badge-sub">Serene Sky Dining</span>
                      </div>

                      <div className="service-routes-grid">
                        <div className="service-route-col">
                          <span className="service-route-header">
                            {originCode} <span style={{ color: '#0e3d36' }}>✈</span> {destCode}
                          </span>
                          <span className="service-route-detail">{selectedMeal === 'standard' ? 'Suất ăn nhẹ theo tiêu chuẩn hãng' : 'Set ẩm thực cao cấp + Thức uống'}</span>
                        </div>
                        {isRoundTrip ? (
                          <div className="service-route-col">
                            <span className="service-route-header">
                              {destCode} <span style={{ color: '#0e3d36' }}>✈</span> {originCode}
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
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0e3d36' }}
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
                          {originCode} <span style={{ color: '#0e3d36' }}>✈</span> {destCode}
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
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0e3d36' }}
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
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#0e3d36' }}
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

          {/* CỘT PHẢI: THÔNG TIN ĐẶT CHỖ (SIDEBAR ĐỒNG BỘ 100% VỚI TRANG ĐẶT CHỖ) */}
          <aside className="services-summary-sidebar" aria-label="Tóm tắt thông tin đặt chỗ">
            <div className="services-sidebar-top-bar">
              <h2 className="services-sidebar-headline">THÔNG TIN ĐẶT CHỖ</h2>
              <button className="services-detail-badge-btn" type="button" onClick={() => navigate(`/bookings/${id}`)}>
                Chi Tiết
              </button>
            </div>

            {/* Accordion: Thông tin hành khách */}
            <div className="services-sidebar-group">
              <div
                className="services-acc-bar"
                onClick={() => setOpenPassengerAccordion(!openPassengerAccordion)}
              >
                <span className="services-acc-label">Thông tin hành khách</span>
                <span>{openPassengerAccordion ? '▲' : '▼'}</span>
              </div>
              {openPassengerAccordion ? (
                <div style={{ padding: '0 1.25rem 0.85rem 1.25rem', fontSize: '0.82rem', color: '#475569' }}>
                  {(booking?.passengers || [{ passenger_name: 'Hành khách 1' }]).map((p, idx) => (
                    <div key={idx} style={{ padding: '0.25rem 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{idx + 1}. {p.passenger_name}</span>
                      <span style={{ color: '#0e3d36', fontWeight: 600 }}>Người lớn</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Accordion: Chuyến đi */}
            <div className="services-sidebar-group">
              <div
                className="services-acc-bar"
                onClick={() => setOpenOutboundAccordion(!openOutboundAccordion)}
              >
                <span className="services-acc-label">Chuyến đi</span>
                <span className="services-leg-cost-tag">
                  {money(baseBookingAmount / (isRoundTrip ? 2 : 1))} <span>✎</span>
                </span>
              </div>
              {openOutboundAccordion ? (
                <div className="services-leg-breakdown">
                  <span className="services-leg-names">
                    {originCity} ({originCode}) <span style={{ color: '#0e3d36' }}>✈</span> {destCity} ({destCode})
                  </span>
                  <span className="services-leg-submeta">
                    {formatFlightDate(outboundFlight?.departure_time)} | {formatFlightTime(outboundFlight?.departure_time)} | {outboundFlight?.flight_number || 'SF101'}
                  </span>
                  <div className="services-fee-row">
                    <span>Giá vé</span>
                    <span>{money(Math.round(baseBookingAmount * 0.75 / (isRoundTrip ? 2 : 1)))}</span>
                  </div>
                  <div className="services-fee-row">
                    <span>Thuế, phí</span>
                    <span>{money(Math.round(baseBookingAmount * 0.25 / (isRoundTrip ? 2 : 1)))}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Accordion: Chuyến về (nếu có) */}
            {isRoundTrip ? (
              <div className="services-sidebar-group">
                <div
                  className="services-acc-bar"
                  onClick={() => setOpenInboundAccordion(!openInboundAccordion)}
                >
                  <span className="services-acc-label">Chuyến về</span>
                  <span className="services-leg-cost-tag">
                    {money(baseBookingAmount / 2)} <span>✎</span>
                  </span>
                </div>
                {openInboundAccordion ? (
                  <div className="services-leg-breakdown">
                    <span className="services-leg-names">
                      {destCity} ({destCode}) <span style={{ color: '#0e3d36' }}>✈</span> {originCity} ({originCode})
                    </span>
                    <span className="services-leg-submeta">
                      {formatFlightDate(inboundFlight?.departure_time)} | {formatFlightTime(inboundFlight?.departure_time)} | {inboundFlight?.flight_number || 'SF102'}
                    </span>
                    <div className="services-fee-row">
                      <span>Giá vé</span>
                      <span>{money(Math.round(baseBookingAmount * 0.75 / 2))}</span>
                    </div>
                    <div className="services-fee-row">
                      <span>Thuế, phí</span>
                      <span>{money(Math.round(baseBookingAmount * 0.25 / 2))}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Accordion: Dịch vụ bổ sung */}
            {totalAddonsPrice > 0 ? (
              <div className="services-sidebar-group">
                <div className="services-acc-bar">
                  <span className="services-acc-label">Dịch vụ bổ sung</span>
                  <span className="services-leg-cost-tag">
                    {money(totalAddonsPrice)}
                  </span>
                </div>
                <div style={{ padding: '0 0 0.5rem 0' }}>
                  {baggagePrice > 0 ? (
                    <div className="services-addon-line">
                      <span className="addon-name">Hành lý ký gửi ({selectedBaggage})</span>
                      <span className="addon-cost">{money(baggagePrice)}</span>
                    </div>
                  ) : null}
                  {mealPrice > 0 ? (
                    <div className="services-addon-line">
                      <span className="addon-name">Ẩm thực Serene Gourmet</span>
                      <span className="addon-cost">{money(mealPrice)}</span>
                    </div>
                  ) : null}
                  {taxiPrice > 0 ? (
                    <div className="services-addon-line">
                      <span className="addon-name">Xe đưa đón sân bay</span>
                      <span className="addon-cost">{money(taxiPrice)}</span>
                    </div>
                  ) : null}
                  {insurancePrice > 0 ? (
                    <div className="services-addon-line">
                      <span className="addon-name">Bảo hiểm Serene Travel Shield</span>
                      <span className="addon-cost">{money(insurancePrice)}</span>
                    </div>
                  ) : null}
                  {priorityPrice > 0 ? (
                    <div className="services-addon-line">
                      <span className="addon-name">Lối đi ưu tiên Serene Priority</span>
                      <span className="addon-cost">{money(priorityPrice)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Hộp Tổng Tiền phong cách đồng bộ */}
            <div className="services-total-card-box">
              <span className="label-total">Tổng tiền</span>
              <span className="val-total">{money(grandTotal)}</span>
            </div>
          </aside>
        </div>

        {/* 3. Bottom Bar Cố định: Quay lại | Tổng tiền | Đi tiếp */}
        <footer className="services-bottom-action-bar">
          <button
            className="button-back"
            type="button"
            onClick={() => navigate(-1)}
          >
            ‹ Quay lại
          </button>

          <div className="services-bottom-next-group">
            <div className="services-bottom-price-stack">
              <span>Tổng tiền thanh toán</span>
              <strong>{money(grandTotal)}</strong>
            </div>

            <button
              className="button-continue"
              type="button"
              disabled={submitting}
              onClick={handleProceedToPayment}
            >
              <span>{submitting ? 'Đang chuyển tiếp…' : 'Đi tiếp'}</span>
              <span>➔</span>
            </button>
          </div>
        </footer>
      </main>

      <AppFooter />
    </div>
  );
}
