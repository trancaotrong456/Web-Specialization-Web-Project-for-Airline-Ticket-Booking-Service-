import React from 'react';
import { ArrowRight, Check } from 'lucide-react';

export function CtaBanner() {
  return (
    <section aria-label="Khối kế hoạch hành trình" className="single-cta-section">
      <div className="single-cta-ticket-strip">
        <div className="cta-strip-body">
          <div className="cta-strip-left">
            <span className="cta-kicker">LÊN KẾ HOẠCH THEO LỊCH BAY</span>
            <h3 className="single-cta-heading">Tìm chuyến bay phù hợp với bạn</h3>
            <p className="single-cta-desc">
              Chọn điểm đi, điểm đến và ngày bay để tra cứu các chuyến bay và giá vé thực tế trong hệ thống Serene Flightways.
            </p>
            <div className="cta-strip-rules">
              <span className="cta-rule-item">
                <Check size={14} className="cta-check-icon" aria-hidden="true" />
                <span>Không yêu cầu tài khoản để tra cứu</span>
              </span>
              <span className="cta-rule-sep">•</span>
              <span className="cta-rule-item">
                <Check size={14} className="cta-check-icon" aria-hidden="true" />
                <span>Giá hiển thị trực tiếp từ hệ thống</span>
              </span>
            </div>
          </div>
          <div className="cta-strip-right">
            <a href="#flight-search-form" className="cta-ticket-btn">
              <span>Tra cứu chuyến bay</span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
