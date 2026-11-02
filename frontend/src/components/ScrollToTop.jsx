import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * Tự động cuộn lên tận cùng đỉnh trang (top: 0, left: 0) mỗi khi chuyển trang,
 * đổi URL query parameters hoặc reload/refresh trang.
 * Tắt cơ chế scrollRestoration tự động của trình duyệt để chống tụt xuống dưới.
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body) {
        document.body.scrollTop = 0;
      }
    };

    // Cuộn ngay tức thì
    scrollToTop();

    // Đồng thời kiểm tra qua requestAnimationFrame và timeout nhẹ để đảm bảo
    // ngay cả khi các khối async data/hình ảnh load xong trang vẫn được ghim ở top
    const rId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(scrollToTop) : null;
    const timer = setTimeout(scrollToTop, 60);

    return () => {
      if (rId && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rId);
      }
      clearTimeout(timer);
    };
  }, [pathname, search]);

  return null;
}
