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

      // 2. Doanh thu tháng này
      request(`/payments/revenue?from_date=${thisMonth.from_date}&to_date=${thisMonth.to_date}&group_by=month`)
        .then((res) => {
          if (!active) return;
          setMetrics((m) => ({
            ...m,
            monthRevenue: { loading: false, error: null, value: res?.total_revenue ?? 0 },
          }));
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
    }

    return () => {
      active = false;
    };
  }, [request]);

  const totalBookings = Object.values(metrics.bookingStatuses.counts).reduce((a, b) => a + b, 0);

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

        {/* Khối chỉ số hoạt động đặt lên trên */}
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
            <article className="admin-metric-card" aria-labelledby="metric-revenue-today">
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
            </article>

            {/* Card 2: Doanh thu tháng này */}
            <article className="admin-metric-card" aria-labelledby="metric-revenue-month">
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
            </article>

            {/* Card 3: Chuyến bay trong 24h & tỉ lệ ghế đã đặt hoặc đang giữ */}
            <article className="admin-metric-card" aria-labelledby="metric-flights-24h">
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
            </article>

            {/* Card 4: Đặt chỗ theo 5 trạng thái */}
            <article className="admin-metric-card span-responsive" aria-labelledby="metric-bookings-status">
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
            </article>
          </div>
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

