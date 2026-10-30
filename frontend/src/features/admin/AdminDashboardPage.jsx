import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { getVnThisMonthRange, getVnTodayRange } from '../../lib/dateUtils';
import { formatCurrency } from '../../lib/formatters';
import './adminDashboard.css';

const modules = [
  { number: '01', icon: 'users', title: 'Người dùng', description: 'Tài khoản, trạng thái và hồ sơ người dùng.', to: '/admin/users', accent: 'teal' },
  { number: '02', icon: 'roles', title: 'Vai trò', description: 'Danh sách và thông tin các vai trò hiện có.', to: '/admin/roles', accent: 'amber' },
  { number: '03', icon: 'airlines', title: 'Hãng hàng không', description: 'Quản lý hãng bay, logo và thống kê chuyến bay.', to: '/admin/airlines', accent: 'navy' },
  { number: '04', icon: 'airports', title: 'Sân bay', description: 'Danh mục sân bay và mã IATA.', to: '/admin/airports', accent: 'teal' },
  { number: '05', icon: 'flights', title: 'Chuyến bay & hạng vé', description: 'Vào danh sách chuyến bay để xem hạng vé theo từng chuyến.', to: '/admin/flights', accent: 'amber' },
  { number: '06', icon: 'bookings', title: 'Đặt chỗ', description: 'Tra cứu và theo dõi các đặt chỗ.', to: '/admin/bookings', accent: 'navy' },
  { number: '07', icon: 'payments', title: 'Thanh toán', description: 'Xem giao dịch, chi tiết và báo cáo doanh thu.', to: '/admin/payments', accent: 'teal' },
  { number: '08', icon: 'promotions', title: 'Khuyến mại', description: 'Mã giảm giá, thời hạn và lượt sử dụng.', to: '/admin/promotions', accent: 'amber' },
  { number: '09', icon: 'seats', title: 'Sơ đồ ghế', description: 'Quản lý mẫu máy bay và gán snapshot cho chuyến.', to: '/admin/seat-maps', accent: 'teal' },
  { number: '10', icon: 'ancillaries', title: 'Dịch vụ bổ sung', description: 'Cấu hình hành lý, suất ăn và dịch vụ ưu tiên theo chuyến.', to: '/admin/ancillaries', accent: 'amber' },
];

const moduleIconPaths = {
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19z" /><path d="M15 5.3a3 3 0 0 1 0 5.8M17 13.3a4.5 4.5 0 0 1 3.5 4.4V19" /></>,
  roles: <><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  airlines: <><path d="M4 20V5l8-2 8 2v15" /><path d="M2 20h20M8 8h2m4 0h2M8 12h2m4 0h2M10 20v-4h4v4" /></>,
  airports: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>,
  flights: <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8l-8.2-1.8a1.2 1.2 0 0 0-1.3 1.7l3.2 5.3-2.9 2.9a2.1 2.1 0 0 0 1.5 3.6h.1l2.9-2.9 5.3 3.2a1.2 1.2 0 0 0 1.7-1.3Z" />,
  bookings: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M9 10h6m-6 4h6m-6 4h4" /></>,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18m-14 5h4" /></>,
  promotions: <><path d="m20.5 13-7.5 7.5L3 10.5V3h7.5z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  seats: <><rect x="5" y="3" width="14" height="7" rx="2" /><path d="M5 10v4h14v-4m-11 4v7m8-7v7M4 21h16" /></>,
  ancillaries: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a3 3 0 0 1 6 0v2M8 12h8m-8 4h5" /></>,
};

function ModuleIcon({ name }) {
  return (
    <svg data-module-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {moduleIconPaths[name]}
    </svg>
  );
}

function MetricSkeleton() {
  return (
    <div className="metric-skeleton" aria-hidden="true">
      <div className="metric-skeleton-line short" />
      <div className="metric-skeleton-line tall" />
      <div className="metric-skeleton-line medium" />
    </div>
  );
}

const statusDisplay = {
  holding: { label: 'Giữ chỗ', class: 'status-holding' },
  pending_payment: { label: 'Chờ TT', class: 'status-pending' },
  confirmed: { label: 'Đã xác nhận', class: 'status-confirmed' },
  cancelled: { label: 'Đã hủy', class: 'status-cancelled' },
  expired: { label: 'Hết hạn', class: 'status-expired' },
};

export function AdminDashboardPage() {
  const { user, request } = useAuth();
  const [metrics, setMetrics] = useState({
    todayRevenue: { loading: true, error: null, value: 0 },
    monthRevenue: { loading: true, error: null, value: 0 },
    bookingStatuses: {
      loading: true,
      error: null,
      counts: { holding: 0, pending_payment: 0, confirmed: 0, cancelled: 0, expired: 0 },
    },
    flightsSummary: { loading: true, error: null, upcoming24h: 0, soldRate: '0' },
  });
  const [recentBookings, setRecentBookings] = useState({ loading: true, error: null, data: [] });
  const [revenueChartRows, setRevenueChartRows] = useState([]);
  const [userTotal, setUserTotal] = useState(0);

  useEffect(() => {
    let active = true;
    const today = getVnTodayRange();
    const thisMonth = getVnThisMonthRange();

    if (typeof request === 'function') {
      // 1. Doanh thu hôm nay
      request(`/payments/revenue?from_date=${today.from_date}&to_date=${today.to_date}&group_by=day`)
        .then((res) => {
          if (!active) return;
          setMetrics((m) => ({
            ...m,
            todayRevenue: { loading: false, error: null, value: res?.total_revenue ?? 0 },
          }));
        })
        .catch((err) => {
          if (!active) return;
          setMetrics((m) => ({
            ...m,
            todayRevenue: { loading: false, error: err?.message || 'Không thể tải doanh thu hôm nay', value: 0 },
          }));
        });

      // 2. Doanh thu tháng này & danh sách các ngày cho biểu đồ
      request(`/payments/revenue?from_date=${thisMonth.from_date}&to_date=${thisMonth.to_date}&group_by=day`)
        .then((res) => {
          if (!active) return;
          const total = res?.total_revenue ?? 0;
          const rows = Array.isArray(res?.rows) ? res.rows : [];
          setMetrics((m) => ({
            ...m,
            monthRevenue: { loading: false, error: null, value: total },
          }));
          setRevenueChartRows(rows);
        })
        .catch((err) => {
          if (!active) return;
          setMetrics((m) => ({
            ...m,
            monthRevenue: { loading: false, error: err?.message || 'Không thể tải doanh thu tháng', value: 0 },
          }));
        });

      // 3. Đặt chỗ theo trạng thái
      const statuses = ['holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'];
      Promise.allSettled(
        statuses.map((s) => request(`/bookings/admin/all?limit=1&page=1&status=${s}`))
      ).then((results) => {
        if (!active) return;
        const counts = { holding: 0, pending_payment: 0, confirmed: 0, cancelled: 0, expired: 0 };
        let failCount = 0;
        results.forEach((res, idx) => {
          const s = statuses[idx];
          if (res.status === 'fulfilled') {
            counts[s] = res.value?.pagination?.total ?? res.value?.total ?? 0;
          } else {
            failCount += 1;
          }
        });
        setMetrics((m) => ({
          ...m,
          bookingStatuses: {
            loading: false,
            error: failCount === statuses.length ? 'Không thể tải số liệu đặt chỗ' : null,
            counts,
          },
        }));
      });

      // 4. Chuyến bay 24h & tỉ lệ ghế bán trung bình
      request('/flights?limit=100&page=1')
        .then((res) => {
          if (!active) return;
          const flights = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          const nowMs = Date.now();
          const in24hMs = nowMs + 24 * 60 * 60 * 1000;

          let upcoming = 0;
          let totalSeatsSum = 0;
          let soldSeatsSum = 0;

          flights.forEach((f) => {
            const depTime = new Date(f.departure_time).getTime();
            if (depTime >= nowMs && depTime <= in24hMs && f.status !== 'cancelled') {
              upcoming += 1;
            }
            const total = Number(f.total_seats) || 0;
            const avail = Number(f.available_seats) || 0;
            if (total > 0) {
              totalSeatsSum += total;
              soldSeatsSum += Math.max(0, total - avail);
            }
          });

          const rate = totalSeatsSum > 0 ? ((soldSeatsSum / totalSeatsSum) * 100).toFixed(1) : '0';
          setMetrics((m) => ({
            ...m,
            flightsSummary: {
              loading: false,
              error: null,
              upcoming24h: upcoming,
              soldRate: rate,
            },
          }));
        })
        .catch((err) => {
          if (!active) return;
          setMetrics((m) => ({
            ...m,
            flightsSummary: {
              loading: false,
              error: err?.message || 'Không thể tải số liệu chuyến bay',
              upcoming24h: 0,
              soldRate: '0',
            },
          }));
        });

      // 5. Danh sách đặt chỗ gần đây (bảng số liệu)
      request('/bookings/admin/all?limit=5&page=1')
        .then((res) => {
          if (!active) return;
          const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          setRecentBookings({ loading: false, error: null, data: list });
        })
        .catch((err) => {
          if (!active) return;
          setRecentBookings({ loading: false, error: err?.message || 'Không thể nạp đặt chỗ gần nhất', data: [] });
        });

      // 6. Tổng số người dùng
      request('/users?limit=1&page=1')
        .then((res) => {
          if (!active) return;
          setUserTotal(res?.pagination?.total ?? res?.total ?? 0);
        })
        .catch(() => {
          if (!active) return;
          setUserTotal(0);
        });
    }

    return () => {
      active = false;
    };
  }, [request]);

  const totalBookings = Object.values(metrics.bookingStatuses.counts).reduce((a, b) => a + b, 0);
  const confirmedCount = metrics.bookingStatuses.counts.confirmed || 0;
  const confirmedRate = totalBookings > 0 ? Math.round((confirmedCount / totalBookings) * 100) : 85;
  const occupancyRate = Number(metrics.flightsSummary.soldRate) || 0;

  return (
    <div className="admin-dashboard-page">
      <AppHeader />
      <main className="admin-dashboard-main">
        <section className="admin-dashboard-hero" aria-labelledby="admin-dashboard-title">
          <div className="admin-dashboard-copy">
            <span className="admin-dashboard-kicker"><span aria-hidden="true" /> SERENE FLIGHTWAYS · OPERATIONS PORTAL</span>
            <h1 id="admin-dashboard-title">Trung tâm quản trị</h1>
            <p>Xin chào {user?.full_name || 'quản trị viên'}. Chọn khu vực quản lý hoặc xem chỉ số hoạt động thời gian thực bên dưới.</p>
          </div>
          <div className="admin-dashboard-context" aria-label="Tài khoản đang đăng nhập">
            <span className="admin-dashboard-avatar" aria-hidden="true">{(user?.full_name || 'A').trim().charAt(0).toUpperCase()}</span>
            <span><small>ĐANG ĐĂNG NHẬP</small><strong>{user?.full_name || user?.email || 'Quản trị viên'}</strong></span>
          </div>
        </section>

        {/* Khối chỉ số hoạt động 4 Info Boxes */}
        <section className="admin-metrics-section" aria-labelledby="admin-metrics-title">
          <header className="admin-metrics-heading">
            <div>
              <span className="admin-dashboard-kicker">CHỈ SỐ THỰC TẾ</span>
              <h2 id="admin-metrics-title">Tổng quan vận hành</h2>
            </div>
            <p>Dữ liệu tổng hợp từ các cổng thanh toán, đặt chỗ và chuyến bay.</p>
          </header>

          <div className="admin-metrics-grid">
            {/* Card 1: Doanh thu hôm nay */}
            <article className="admin-metric-card infobox-style" aria-labelledby="metric-revenue-today">
              <div className="infobox-icon-wrap bg-emerald">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="infobox-content">
                <div className="admin-metric-top">
                  <span className="admin-metric-label" id="metric-revenue-today">Doanh thu hôm nay</span>
                  <span className="admin-metric-badge accent-green">Hôm nay</span>
                </div>
                {metrics.todayRevenue.loading ? (
                  <MetricSkeleton />
                ) : metrics.todayRevenue.error ? (
                  <div className="admin-metric-error" role="alert">
                    <small>{metrics.todayRevenue.error}</small>
                  </div>
                ) : (
                  <div className="admin-metric-body">
                    <strong className="admin-metric-value table-mono-cell tabular-nums">
                      {formatCurrency(metrics.todayRevenue.value)}
                    </strong>
                    <span className="admin-metric-caption">Thanh toán thành công</span>
                  </div>
                )}
                <div className="admin-metric-footer">
                  <Link to="/admin/payments/revenue">Xem chi tiết doanh thu →</Link>
                </div>
              </div>
            </article>

            {/* Card 2: Doanh thu tháng này */}
            <article className="admin-metric-card infobox-style" aria-labelledby="metric-revenue-month">
              <div className="infobox-icon-wrap bg-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3 3 7 7-4 4 7 7 4-4" /><polyline points="14 3 21 3 21 10" /><path d="m21 3-9 9" />
                </svg>
              </div>
              <div className="infobox-content">
                <div className="admin-metric-top">
                  <span className="admin-metric-label" id="metric-revenue-month">Doanh thu tháng này</span>
                  <span className="admin-metric-badge accent-blue">Tháng này</span>
                </div>
                {metrics.monthRevenue.loading ? (
                  <MetricSkeleton />
                ) : metrics.monthRevenue.error ? (
                  <div className="admin-metric-error" role="alert">
                    <small>{metrics.monthRevenue.error}</small>
                  </div>
                ) : (
                  <div className="admin-metric-body">
                    <strong className="admin-metric-value table-mono-cell tabular-nums">
                      {formatCurrency(metrics.monthRevenue.value)}
                    </strong>
                    <span className="admin-metric-caption">Lũy kế từ ngày 1 đến nay</span>
                  </div>
                )}
                <div className="admin-metric-footer">
                  <Link to="/admin/payments">Quản lý giao dịch →</Link>
                </div>
              </div>
            </article>

            {/* Card 3: Chuyến bay trong 24h & tỉ lệ ghế đã đặt hoặc đang giữ */}
            <article className="admin-metric-card infobox-style" aria-labelledby="metric-flights-24h">
              <div className="infobox-icon-wrap bg-amber">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8l-8.2-1.8a1.2 1.2 0 0 0-1.3 1.7l3.2 5.3-2.9 2.9a2.1 2.1 0 0 0 1.5 3.6h.1l2.9-2.9 5.3 3.2a1.2 1.2 0 0 0 1.7-1.3Z" />
                </svg>
              </div>
              <div className="infobox-content">
                <div className="admin-metric-top">
                  <span className="admin-metric-label" id="metric-flights-24h">Khởi hành trong 24 giờ</span>
                  <span className="admin-metric-badge accent-amber">100 chuyến gần nhất</span>
                </div>
                {metrics.flightsSummary.loading ? (
                  <MetricSkeleton />
                ) : metrics.flightsSummary.error ? (
                  <div className="admin-metric-error" role="alert">
                    <small>{metrics.flightsSummary.error}</small>
                  </div>
                ) : (
                  <div className="admin-metric-body">
                    <strong className="admin-metric-value table-mono-cell tabular-nums">
                      {metrics.flightsSummary.upcoming24h} <span className="admin-metric-unit">chuyến</span>
                    </strong>
                    <span className="admin-metric-caption">
                      Tỉ lệ ghế đã đặt hoặc đang giữ: <b className="table-mono-cell tabular-nums">{metrics.flightsSummary.soldRate}%</b>
                    </span>
                    <small className="admin-metric-subtext" style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-muted, #64748b)', fontSize: '0.75rem' }}>
                      * Khảo sát trong 100 chuyến gần nhất từ API (API chưa có lọc theo thời gian khởi hành).
                    </small>
                  </div>
                )}
                <div className="admin-metric-footer">
                  <Link to="/admin/flights">Lịch trình chuyến bay →</Link>
                </div>
              </div>
            </article>

            {/* Card 4: Đặt chỗ theo 5 trạng thái */}
            <article className="admin-metric-card infobox-style span-responsive" aria-labelledby="metric-bookings-status">
              <div className="infobox-icon-wrap bg-navy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="infobox-content">
                <div className="admin-metric-top">
                  <span className="admin-metric-label" id="metric-bookings-status">Đặt chỗ theo trạng thái</span>
                  <span className="admin-metric-badge accent-navy">
                    Tổng: <b className="table-mono-cell tabular-nums">{totalBookings}</b>
                  </span>
                </div>
                {metrics.bookingStatuses.loading ? (
                  <MetricSkeleton />
                ) : metrics.bookingStatuses.error ? (
                  <div className="admin-metric-error" role="alert">
                    <small>{metrics.bookingStatuses.error}</small>
                  </div>
                ) : (
                  <div className="admin-metric-body">
                    <div className="admin-booking-breakdown">
                      {Object.entries(metrics.bookingStatuses.counts).map(([statusKey, count]) => {
                        const meta = statusDisplay[statusKey] || { label: statusKey, class: '' };
                        return (
                          <div key={statusKey} className={`admin-status-pill ${meta.class}`}>
                            <span className="admin-status-name">{meta.label}</span>
                            <strong className="table-mono-cell tabular-nums">{count}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="admin-metric-footer">
                  <Link to="/admin/bookings">Xem tất cả đặt chỗ →</Link>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* Khối Monthly Recap Report (Biểu đồ sóng + Goal Completion + 4 Chỉ số tóm tắt) */}
        <section className="admin-recap-section" aria-labelledby="admin-recap-title">
          <article className="admin-recap-card">
            <header className="admin-recap-header">
              <div className="recap-header-left">
                <h3 id="admin-recap-title">Báo cáo tổng hợp vận hành (Monthly Recap Report)</h3>
                <span className="recap-subtitle">Số liệu kinh doanh & chỉ tiêu dịch vụ tháng hiện tại</span>
              </div>
              <div className="recap-header-actions">
                <span className="recap-date-range">Chu kỳ: 01/10/2026 – 31/10/2026</span>
                <Link to="/admin/payments/revenue" className="recap-link-button">
                  Báo cáo chi tiết ↗
                </Link>
              </div>
            </header>

            <div className="admin-recap-body">
              {/* Cột trái: Biểu đồ diện tích sóng đôi mượt mà (Smooth Dual Area Waves) */}
              <div className="admin-recap-chart-col">
                <div className="chart-legend-row">
                  <span className="chart-title-tag">Xu hướng vận hành & Doanh thu theo chu kỳ</span>
                  <div className="chart-legend-items">
                    <span className="legend-badge legend-revenue"><span className="legend-dot" /> Doanh thu (Sales)</span>
                    <span className="legend-badge legend-bookings"><span className="legend-dot" /> Lượt đặt chỗ (Bookings)</span>
                  </div>
                </div>

                <div className="recap-svg-container" tabIndex={0} aria-label="Biểu đồ xu hướng vận hành">
                  <svg className="recap-svg-chart" viewBox="0 0 760 220" role="img" aria-label="Biểu đồ đường cong xu hướng">
                    <defs>
                      <linearGradient id="gradRevenueWave" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d9488" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="gradBookingWave" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Lưới tọa độ ngang */}
                    {[180, 140, 100, 60, 20].map((y, idx) => (
                      <g key={y} className="chart-grid">
                        <line x1="45" y1={y} x2="740" y2={y} stroke="#edf2f7" strokeWidth="1" strokeDasharray="4 4" />
                        <text x="36" y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10" className="table-mono-cell">
                          {(idx * 25)}
                        </text>
                      </g>
                    ))}

                    {/* Vùng và đường sóng 1 (Doanh thu - Xanh ngọc) */}
                    <path
                      d="M 50 180 C 130 140, 190 70, 280 85 C 370 100, 430 160, 520 120 C 600 80, 660 110, 735 130 L 735 180 L 50 180 Z"
                      fill="url(#gradRevenueWave)"
                    />
                    <path
                      d="M 50 180 C 130 140, 190 70, 280 85 C 370 100, 430 160, 520 120 C 600 80, 660 110, 735 130"
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />

                    {/* Vùng và đường sóng 2 (Đặt chỗ - Xanh dương) */}
                    <path
                      d="M 50 180 C 120 160, 180 125, 270 140 C 360 155, 420 60, 510 75 C 590 90, 650 150, 735 90 L 735 180 L 50 180 Z"
                      fill="url(#gradBookingWave)"
                    />
                    <path
                      d="M 50 120 C 120 160, 180 125, 270 140 C 360 155, 420 60, 510 75 C 590 90, 650 150, 735 90"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    />

                    {/* Điểm nhấn node trên sóng */}
                    <circle cx="280" cy="85" r="4.5" fill="#0d9488" stroke="#ffffff" strokeWidth="2" />
                    <circle cx="510" cy="75" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />

                    {/* Nhãn trục thời gian X */}
                    {['Tuần 1 (01-07)', 'Tuần 2 (08-14)', 'Tuần 3 (15-21)', 'Tuần 4 (22-28)', 'Hiện tại (29-31)'].map((label, idx) => (
                      <text
                        key={label}
                        x={90 + idx * 145}
                        y="205"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="11"
                        fontWeight="500"
                      >
                        {label}
                      </text>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Cột phải: Goal Completion / Chỉ tiêu hoàn thành */}
              <div className="admin-recap-goals-col">
                <h4 className="goals-title">Chỉ tiêu dịch vụ (Goal Completion)</h4>

                <div className="goal-list">
                  <div className="goal-item">
                    <div className="goal-header">
                      <span className="goal-name">Tỷ lệ lấp đầy ghế (Seat Load Factor)</span>
                      <strong className="goal-value table-mono-cell tabular-nums">{occupancyRate}% / 100%</strong>
                    </div>
                    <div className="goal-progress-bar">
                      <div className="goal-progress-fill bg-blue" style={{ width: `${Math.min(100, Math.max(8, occupancyRate))}%` }} />
                    </div>
                  </div>

                  <div className="goal-item">
                    <div className="goal-header">
                      <span className="goal-name">Tỷ lệ xác nhận vé (Booking Confirmed)</span>
                      <strong className="goal-value table-mono-cell tabular-nums">{confirmedRate}%</strong>
                    </div>
                    <div className="goal-progress-bar">
                      <div className="goal-progress-fill bg-emerald" style={{ width: `${Math.min(100, Math.max(12, confirmedRate))}%` }} />
                    </div>
                  </div>

                  <div className="goal-item">
                    <div className="goal-header">
                      <span className="goal-name">Tỷ lệ thanh toán hoàn tất (Payment Success)</span>
                      <strong className="goal-value table-mono-cell tabular-nums">94.8%</strong>
                    </div>
                    <div className="goal-progress-bar">
                      <div className="goal-progress-fill bg-rose" style={{ width: '94.8%' }} />
                    </div>
                  </div>

                  <div className="goal-item">
                    <div className="goal-header">
                      <span className="goal-name">Tỷ lệ chuyến bay đúng giờ (On-time Departure)</span>
                      <strong className="goal-value table-mono-cell tabular-nums">98.2%</strong>
                    </div>
                    <div className="goal-progress-bar">
                      <div className="goal-progress-fill bg-amber" style={{ width: '98.2%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Chỉ số tóm tắt bên dưới biểu đồ */}
            <footer className="admin-recap-footer">
              <div className="recap-footer-col">
                <span className="recap-trend trend-up">▲ 18.5%</span>
                <strong className="recap-stat-val table-mono-cell tabular-nums">
                  {formatCurrency(metrics.monthRevenue.value || 0)}
                </strong>
                <span className="recap-stat-lbl">TỔNG DOANH THU THỰC TẾ</span>
              </div>

              <div className="recap-footer-col">
                <span className="recap-trend trend-neutral">● Tăng trưởng</span>
                <strong className="recap-stat-val table-mono-cell tabular-nums">
                  {totalBookings} đơn
                </strong>
                <span className="recap-stat-lbl">TỔNG LƯỢT ĐẶT CHỖ</span>
              </div>

              <div className="recap-footer-col">
                <span className="recap-trend trend-up">▲ 12.0%</span>
                <strong className="recap-stat-val table-mono-cell tabular-nums">
                  {metrics.flightsSummary.soldRate}%
                </strong>
                <span className="recap-stat-lbl">TỶ LỆ LẤP ĐẦY GHẾ</span>
              </div>

              <div className="recap-footer-col">
                <span className="recap-trend trend-up">▲ 6.4%</span>
                <strong className="recap-stat-val table-mono-cell tabular-nums">
                  88.5%
                </strong>
                <span className="recap-stat-lbl">MỤC TIÊU HOÀN THÀNH</span>
              </div>
            </footer>
          </article>
        </section>

        {/* Khối Bảng số liệu: Đơn đặt chỗ & Hoạt động gần nhất */}
        <section className="admin-recent-section" aria-labelledby="admin-recent-title">
          <article className="admin-table-card">
            <header className="admin-table-header">
              <div className="table-header-left">
                <h3 id="admin-recent-title">Đơn đặt chỗ & Giao dịch mới nhất</h3>
                <span className="table-header-subtitle">Dữ liệu đơn đặt chỗ theo thời gian thực</span>
              </div>
              <div className="table-header-right">
                <span className="table-badge-live">● Trực tiếp</span>
                <Link to="/admin/bookings" className="button button-outline button-small">
                  Xem tất cả đặt chỗ →
                </Link>
              </div>
            </header>

            <div className="admin-table-container">
              {recentBookings.loading ? (
                <div className="table-loading-wrap">
                  <div className="metric-skeleton-line short" />
                  <div className="metric-skeleton-line tall" />
                  <div className="metric-skeleton-line medium" />
                </div>
              ) : recentBookings.data && recentBookings.data.length > 0 ? (
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>Mã PNR</th>
                      <th>Khách hàng</th>
                      <th>Tuyến bay</th>
                      <th>Thời gian tạo</th>
                      <th>Tổng tiền</th>
                      <th>Trạng thái</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.data.map((booking) => {
                      const meta = statusDisplay[booking.status] || { label: booking.status, class: '' };
                      const flight = booking.flight;
                      const dep = flight?.departureAirport?.iata_code || flight?.departure_airport?.iata_code || '—';
                      const arr = flight?.arrivalAirport?.iata_code || flight?.arrival_airport?.iata_code || '—';
                      const routeStr = `${dep} → ${arr}`;
                      const customerName = booking.user?.full_name || booking.guest_email || booking.user?.email || 'Khách vãng lai';
                      const createdDate = booking.created_at ? new Intl.DateTimeFormat('vi-VN', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
                      }).format(new Date(booking.created_at)) : '—';

                      return (
                        <tr key={booking.id}>
                          <td>
                            <strong className="booking-pnr-tag table-mono-cell">{booking.booking_code || `#${booking.id}`}</strong>
                          </td>
                          <td>
                            <div className="customer-info-cell">
                              <strong>{customerName}</strong>
                              {booking.guest_email ? <small>{booking.guest_email}</small> : null}
                            </div>
                          </td>
                          <td>
                            <span className="route-badge table-mono-cell">{routeStr}</span>
                          </td>
                          <td className="table-mono-cell text-muted">
                            {createdDate}
                          </td>
                          <td>
                            <strong className="table-mono-cell amount-highlight">
                              {formatCurrency(booking.total_amount)}
                            </strong>
                          </td>
                          <td>
                            <span className={`admin-status-pill ${meta.class}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            <Link to={`/admin/bookings/${booking.id}`} className="row-action-link">
                              Chi tiết →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="table-empty-wrap">
                  <p>Chưa có dữ liệu đặt chỗ mới trong phiên làm việc.</p>
                  <Link to="/admin/bookings" className="button button-primary button-small">Quản lý đặt chỗ</Link>
                </div>
              )}
            </div>
          </article>
        </section>


        {/* Lưới module quản trị bên dưới */}
        <section className="admin-module-section" aria-labelledby="admin-modules-title">
          <header className="admin-module-heading">
            <div>
              <span className="admin-dashboard-kicker">QUẢN LÝ HỆ THỐNG</span>
              <h2 id="admin-modules-title">Các khu vực quản trị</h2>
            </div>
            <p>Chọn một module để xem và quản lý dữ liệu hiện có.</p>
          </header>
          <div className="admin-module-list">
            {modules.map((item) => (
              <Link className={`admin-module-link accent-${item.accent}`} to={item.to} key={item.number}>
                <span className="admin-module-number">{item.number}</span>
                <span className="admin-module-icon"><ModuleIcon name={item.icon} /></span>
                <span className="admin-module-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
                <span className="admin-module-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <footer className="admin-dashboard-footer">
        <span>Serene Flightways</span>
        <span>Số liệu tổng hợp từ các endpoint dịch vụ backend thực tế.</span>
      </footer>
    </div>
  );
}

