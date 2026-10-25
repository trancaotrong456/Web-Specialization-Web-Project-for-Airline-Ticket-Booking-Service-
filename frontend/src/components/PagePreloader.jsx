import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AOS from 'aos';

/**
 * PagePreloader: Hiệu ứng Animation nạp trang & chuyển trang hoàng gia Serene Flightways.
 * - Xuất hiện khi mở web hoặc nhấn F5 (Refresh).
 * - Tự động fade-out êm dịu và kích hoạt AOS.refreshHard().
 * - Kèm thanh tiến trình hàng không trên đỉnh trang (Top Runway Bar) mỗi khi chuyển trang.
 */
export function PagePreloader() {
  // Bỏ qua trong môi trường kiểm thử tự động để bảo toàn tốc độ & độ ổn định 100%
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') {
    return null;
  }

  const [isLoading, setIsLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [routeProgress, setRouteProgress] = useState(false);
  const location = useLocation();

  // Hàm hỗ trợ làm mới hiệu ứng AOS khi chuyển trang (tránh gán vào table để bảng không bao giờ bị ẩn)
  const triggerScrollAnimations = () => {
    try {
      if (typeof document === 'undefined') return;
      AOS.refresh();
    } catch {
      // An toàn trong môi trường bất đồng bộ
    }
  };

  // 1. Initial Page Load & Refresh Animation
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, 650);

    const doneTimer = setTimeout(() => {
      setIsLoading(false);
      triggerScrollAnimations();
      try {
        AOS.refreshHard();
      } catch {
        // Fallback an toàn nếu AOS chưa sẵn sàng
      }
    }, 950);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  // 2. Chuyển đổi trang (Route Transition)
  useEffect(() => {
    if (isLoading) return;

    setRouteProgress(true);
    window.scrollTo({ top: 0, behavior: 'instant' });

    const timer = setTimeout(() => {
      setRouteProgress(false);
      triggerScrollAnimations();
    }, 450);

    return () => clearTimeout(timer);
  }, [location.pathname, location.search, isLoading]);

  return (
    <>
      {/* Top Runway Navigation Bar chạy khi đổi route */}
      {routeProgress && <div className="serene-top-runway-bar" aria-hidden="true" />}

      {/* Fullscreen Royal Preloader cho lần nạp đầu hoặc F5 Refresh */}
      {isLoading && (
        <div
          className={`serene-preloader-backdrop ${isExiting ? 'serene-preloader-exit' : ''}`}
          role="status"
          aria-live="polite"
          aria-label="Đang nạp dữ liệu chuyến bay"
        >
          <div className="serene-preloader-card">
            {/* Vòng quay la bàn hàng không dát vàng */}
            <div className="serene-compass-spinner">
              <svg className="serene-compass-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="46" stroke="rgba(201, 162, 75, 0.25)" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="50" cy="50" r="38" stroke="url(#goldGradient)" strokeWidth="2.5" strokeDasharray="180 60" />
                <defs>
                  <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#C9A24B" />
                    <stop offset="50%" stopColor="#F5E0A0" />
                    <stop offset="100%" stopColor="#0D9488" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Biểu tượng phi cơ phản lực bay ở tâm */}
              <div className="serene-center-aircraft">
                <svg viewBox="0 0 24 24" fill="none" stroke="#C9A24B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                </svg>
              </div>
            </div>

            {/* Thương hiệu Serene Flightways */}
            <div className="serene-preloader-brand">
              <span className="preloader-eyebrow">PREMIUM AIRLINE EXPERIENCE</span>
              <h2 className="preloader-title">SERENE FLIGHTWAYS</h2>
              <p className="preloader-subtitle">Đang nạp hành trình bay của bạn...</p>
            </div>

            {/* Thanh tiến trình phát quang dát vàng */}
            <div className="serene-preloader-progress-track">
              <div className="serene-preloader-progress-bar" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
