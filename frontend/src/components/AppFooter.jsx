import React from 'react';
import { NavLink, Link } from 'react-router-dom';

export function AppFooter({ note }) {
  return (
    <footer className="site-footer serene-full-footer" aria-label="Chân trang Serene Flightways" data-purpose="site-footer">
      <div className="footer-top-columns">
        <div className="footer-col brand-col">
          <div className="footer-brand">
            <span className="brand-flight-icon" aria-hidden="true">✈</span>
            <strong className="whitespace-nowrap">Serene Flightways</strong>
          </div>
          <p className="brand-motto">
            Hệ thống tra cứu chuyến bay và đặt chỗ trực tuyến Serene Flightways. Cung cấp dữ liệu lịch trình minh bạch và dịch vụ hỗ trợ hành khách 24/7.
          </p>
          <div className="footer-hotline-box">
            <small className="font-mono">TỔNG ĐÀI HỖ TRỢ</small>
            <strong className="font-mono whitespace-nowrap">1900 6868</strong>
          </div>
        </div>

        <div className="footer-col">
          <h4>Điểm đến gợi ý</h4>
          <div className="footer-nav-links">
            <Link to="/flights/search?origin=HAN&destination=SGN">Hà Nội (HAN) ⇄ TP. HCM (SGN)</Link>
            <Link to="/flights/search?origin=SGN&destination=DAD">TP. HCM (SGN) ⇄ Đà Nẵng (DAD)</Link>
            <Link to="/flights/search?origin=HAN&destination=DAD">Hà Nội (HAN) ⇄ Đà Nẵng (DAD)</Link>
            <Link to="/flights/search?origin=SGN&destination=PQC">TP. HCM (SGN) ⇄ Phú Quốc (PQC)</Link>
            <Link to="/flights/search?origin=HAN&destination=CXR">Hà Nội (HAN) ⇄ Nha Trang (CXR)</Link>
          </div>
        </div>

        <div className="footer-col">
          <h4>Dịch vụ &amp; Pháp lý</h4>
          <div className="footer-nav-links">
            <NavLink to="/bookings/lookup">Tra cứu đặt chỗ</NavLink>
            <NavLink to="/bookings/my">Đặt chỗ của tôi</NavLink>
            <NavLink to="/profile">Hồ sơ khách hàng</NavLink>
            <NavLink to="/profile/security">Bảo mật tài khoản</NavLink>
            <span>Các chính sách và điều kiện vận chuyển đang được cập nhật.</span>
          </div>
        </div>

        <div className="footer-col app-col">
          <h4>Tra cứu hành trình</h4>
          <p>Tìm lịch bay theo sân bay đi, sân bay đến và ngày khởi hành bạn chọn.</p>
          <Link className="app-download-card app-search-link" to="/">
            <span className="download-icon" aria-hidden="true">✈</span>
            <span><small>Mở biểu mẫu</small><strong>Tìm chuyến bay</strong></span>
          </Link>
          <div className="footer-secure-badge">
            <small>Cổng VNPay · VietQR / payOS</small>
          </div>
        </div>

        <div className="footer-col newsletter-col">
          <h4>Bản tin Serene Club</h4>
          <p>Đăng ký nhận thông tin hành trình mới và thông báo lịch bay sớm nhất.</p>
          <form className="footer-newsletter-form" onSubmit={(e) => { e.preventDefault(); alert('Cảm ơn bạn đã đăng ký nhận bản tin Serene Flightways!'); }}>
            <input type="email" placeholder="Nhập email của bạn" required aria-label="Địa chỉ email nhận bản tin" />
            <button type="submit" className="button button-secondary">Đăng ký</button>
          </form>
          <small className="newsletter-note">Cam kết bảo mật thông tin liên hệ của hành khách.</small>
        </div>
      </div>

      {note ? (
        <div className="footer-system-notes">
          <span>{note}</span>
        </div>
      ) : null}

      <div className="footer-bottom-bar">
        <div className="footer-copyright">
          <span>© 2026 Hãng Hàng Không Serene Flightways. Bản quyền đã được bảo hộ.</span>
        </div>
        <div className="footer-legal-links font-mono">
          <span>Phân phối vé điện tử trực tuyến</span>
        </div>
      </div>
    </footer>
  );
}
