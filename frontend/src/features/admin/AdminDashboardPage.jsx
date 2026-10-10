import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import './adminDashboard.css';

const modules = [
  { number: '01', icon: '◉', title: 'Người dùng', description: 'Tài khoản, trạng thái và hồ sơ người dùng.', to: '/admin/users', accent: 'teal' },
  { number: '02', icon: '⌘', title: 'Vai trò', description: 'Danh sách và thông tin các vai trò hiện có.', to: '/admin/roles', accent: 'amber' },
  { number: '03', icon: '✈', title: 'Hãng hàng không', description: 'Quản lý hãng bay và thông tin nhận diện.', to: '/admin/airlines', accent: 'navy' },
  { number: '04', icon: '⌖', title: 'Sân bay', description: 'Danh mục sân bay và mã IATA.', to: '/admin/airports', accent: 'teal' },
  { number: '05', icon: '↗', title: 'Chuyến bay & hạng vé', description: 'Vào danh sách chuyến bay để xem hạng vé theo từng chuyến.', to: '/admin/flights', accent: 'amber' },
  { number: '06', icon: '▤', title: 'Đặt chỗ', description: 'Tra cứu và theo dõi các đặt chỗ.', to: '/admin/bookings', accent: 'navy' },
  { number: '07', icon: '▱', title: 'Thanh toán', description: 'Xem giao dịch, chi tiết và báo cáo doanh thu.', to: '/admin/payments', accent: 'teal' },
  { number: '08', icon: '◇', title: 'Khuyến mại', description: 'Mã giảm giá, thời hạn và lượt sử dụng.', to: '/admin/promotions', accent: 'amber' },
];

export function AdminDashboardPage() {
  const { user } = useAuth();
  return (
    <div className="admin-dashboard-page">
      <AppHeader />
      <main className="admin-dashboard-main">
        <section className="admin-dashboard-hero" aria-labelledby="admin-dashboard-title">
          <div className="admin-dashboard-copy">
            <span className="admin-dashboard-kicker"><span aria-hidden="true" /> SERENE FLIGHTWAYS · ĐIỀU HÀNH</span>
            <h1 id="admin-dashboard-title">Trung tâm quản trị</h1>
            <p>Xin chào {user?.full_name || 'quản trị viên'}. Chọn một khu vực để tiếp tục công việc.</p>
          </div>
          <div className="admin-dashboard-route" aria-label="Kết nối hệ thống">
            <span className="admin-route-point">SGN</span><span className="admin-route-line" aria-hidden="true"><i>✈</i></span><span className="admin-route-point">HAN</span>
            <small>Hệ thống đặt vé</small>
          </div>
        </section>
        <section className="admin-module-section" aria-labelledby="admin-modules-title">
          <header className="admin-module-heading"><div><span className="admin-dashboard-kicker">ĐIỀU HƯỚNG HỆ THỐNG</span><h2 id="admin-modules-title">Khu vực làm việc</h2></div><p>Chỉ hiển thị các chức năng quản trị đã có trong ứng dụng.</p></header>
          <div className="admin-module-list">
            {modules.map((item) => (
              <Link className={`admin-module-link accent-${item.accent}`} to={item.to} key={item.number}>
                <span className="admin-module-number">{item.number}</span>
                <span className="admin-module-icon" aria-hidden="true">{item.icon}</span>
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
