import React from 'react';
import { NavLink, Link } from 'react-router-dom';

export function AppFooter({ note }) {
  return (
    <footer className="site-footer serene-full-footer" aria-label="Chân trang Serene Flightways" data-aos="fade-up">
      <span className="sr-only">Serene Flightways</span>
      <div className="footer-top-columns">
        <div className="footer-col brand-col">
          <div className="footer-brand">
            <span className="brand-flight-icon" aria-hidden="true">✈</span>
            <strong className="whitespace-nowrap">Serene Flightways</strong>
          </div>
          <p className="brand-motto">
            Tất cả tầm nhìn tinh tế &amp; dịch vụ chuẩn mực kết tinh trong mỗi chặng bay, khát khao nâng tầm hàng không Việt Nam vươn xa trên trường quốc tế.
          </p>
          <div className="footer-hotline-box">
            <small>TỔNG ĐÀI 24/7</small>
            <strong className="whitespace-nowrap">1900 6868</strong>
          </div>
          <div className="footer-cert-tags">
            <span>ASA Member</span>
            <span>CAAV Certified</span>
            <span>IOSA 2024</span>
          </div>
        </div>

        <div className="footer-col">
          <h4>Điểm đến nổi bật</h4>
          <div className="footer-nav-links">
            <Link to="/flights/search?origin=HAN&destination=SGN">Hà Nội (HAN) ⇄ TP. Hồ Chí Minh (SGN)</Link>
            <Link to="/flights/search?origin=SGN&destination=DAD">TP. Hồ Chí Minh (SGN) ⇄ Đà Nẵng (DAD)</Link>
            <Link to="/flights/search?origin=HAN&destination=DAD">Hà Nội (HAN) ⇄ Đà Nẵng (DAD)</Link>
            <Link to="/flights/search?origin=SGN&destination=PQC">TP. Hồ Chí Minh (SGN) ⇄ Phú Quốc (PQC)</Link>
            <Link to="/flights/search?origin=HAN&destination=CXR">Hà Nội (HAN) ⇄ Nha Trang (CXR)</Link>
          </div>
        </div>

        <div className="footer-col">
          <h4>Dịch vụ &amp; Hỗ trợ</h4>
          <div className="footer-nav-links">
            <NavLink to="/bookings/lookup">Tra cứu đặt chỗ (PNR)</NavLink>
            <NavLink to="/bookings/my">Đặt chỗ của tôi</NavLink>
            <NavLink to="/profile">Hồ sơ khách hàng</NavLink>
            <NavLink to="/profile/security">Bảo mật tài khoản</NavLink>
            <span>Chính sách giá vé &amp; điều kiện vận chuyển</span>
          </div>
        </div>

        <div className="footer-col app-col">
          <h4>Tra cứu hành trình</h4>
          <p>Tìm kiếm lịch bay và giá vé thời gian thực được kết nối trực tiếp với hệ thống.</p>
          <Link className="app-download-card app-search-link" to="/">
            <span className="download-icon" aria-hidden="true">✈</span>
            <span><small>Tìm vé máy bay</small><strong>Lên kế hoạch bay</strong></span>
          </Link>
          <div className="footer-secure-badge">
            <small>✓ Thanh toán an toàn qua VNPAY &amp; VietQR</small>
          </div>
        </div>
      </div>

      <div className="footer-system-notes">
        <span>Giờ bay hiển thị theo giờ Việt Nam (UTC+7).</span>
        <span>Thông tin đặt chỗ được xử lý theo trạng thái từ hệ thống.</span>
        <span>Thanh toán được xác nhận từ trạng thái hệ thống.</span>
        <span>Thông tin tài khoản được bảo vệ theo chính sách của hệ thống.</span>
        {note ? <span>{note}</span> : null}
      </div>

      <div className="footer-bottom-bar">
        <div className="footer-copyright">
          <span>© 2026 Hãng Hàng Không Serene Flightways. Bản quyền đã được bảo hộ.</span>
        </div>
        <div className="footer-legal-links">
          <span>Cục Hàng không Dân dụng Việt Nam</span>
        </div>
      </div>
    </footer>
  );
}
