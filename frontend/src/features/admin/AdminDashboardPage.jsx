import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import './adminDashboard.css';

const modules = [
  { number: '01', icon: 'users', title: 'Người dùng', description: 'Tài khoản, trạng thái và hồ sơ người dùng.', to: '/admin/users', accent: 'teal' },
  { number: '02', icon: 'roles', title: 'Vai trò', description: 'Danh sách và thông tin các vai trò hiện có.', to: '/admin/roles', accent: 'amber' },
  { number: '03', icon: 'airlines', title: 'Hãng hàng không', description: 'Quản lý hãng bay và thông tin nhận diện.', to: '/admin/airlines', accent: 'navy' },
  { number: '04', icon: 'airports', title: 'Sân bay', description: 'Danh mục sân bay và mã IATA.', to: '/admin/airports', accent: 'teal' },
  { number: '05', icon: 'flights', title: 'Chuyến bay & hạng vé', description: 'Vào danh sách chuyến bay để xem hạng vé theo từng chuyến.', to: '/admin/flights', accent: 'amber' },
  { number: '06', icon: 'bookings', title: 'Đặt chỗ', description: 'Tra cứu và theo dõi các đặt chỗ.', to: '/admin/bookings', accent: 'navy' },
  { number: '07', icon: 'payments', title: 'Thanh toán', description: 'Xem giao dịch, chi tiết và báo cáo doanh thu.', to: '/admin/payments', accent: 'teal' },
  { number: '08', icon: 'promotions', title: 'Khuyến mại', description: 'Mã giảm giá, thời hạn và lượt sử dụng.', to: '/admin/promotions', accent: 'amber' },
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
};

function ModuleIcon({ name }) {
  return (
    <svg data-module-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {moduleIconPaths[name]}
    </svg>
  );
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  return (
    <div className="admin-dashboard-page">
      <AppHeader />
      <main className="admin-dashboard-main">
        <section className="admin-dashboard-hero" aria-labelledby="admin-dashboard-title">
          <div className="admin-dashboard-copy">
            <span className="admin-dashboard-kicker"><span aria-hidden="true" /> SERENE FLIGHTWAYS · OPERATIONS PORTAL</span>
            <h1 id="admin-dashboard-title">Trung tâm quản trị</h1>
            <p>Xin chào {user?.full_name || 'quản trị viên'}. Chọn khu vực quản lý để tiếp tục công việc.</p>
          </div>
          <div className="admin-dashboard-context" aria-label="Tài khoản đang đăng nhập">
            <span className="admin-dashboard-avatar" aria-hidden="true">{(user?.full_name || 'A').trim().charAt(0).toUpperCase()}</span>
            <span><small>ĐANG ĐĂNG NHẬP</small><strong>{user?.full_name || user?.email || 'Quản trị viên'}</strong></span>
          </div>
        </section>
        <section className="admin-module-section" aria-labelledby="admin-modules-title">
          <header className="admin-module-heading"><div><span className="admin-dashboard-kicker">QUẢN LÝ HỆ THỐNG</span><h2 id="admin-modules-title">Các khu vực quản trị</h2></div><p>Chọn một module để xem và quản lý dữ liệu hiện có.</p></header>
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
      <footer className="admin-dashboard-footer"><span>Serene Flightways</span><span>Không có số liệu tổng hợp giả lập trên trang này.</span></footer>
    </div>
  );
}
