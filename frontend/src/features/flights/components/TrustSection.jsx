import React from 'react';
import { homeTrustPoints, paymentMethods } from '../homeData';

export function TrustSection() {
  return (
    <section aria-labelledby="trust-section-heading" className="trust-editorial-section">
      <div className="section-header-row">
        <div>
          <span className="section-kicker">CHÍNH SÁCH VẬN HÀNH</span>
          <h2 id="trust-section-heading" className="section-title">
            3 nguyên tắc đặt giữ chỗ tại Serene Flightways
          </h2>
        </div>
        <p className="section-sub-copy">
          Quy định rõ ràng về giữ chỗ, thời hạn thanh toán và bảo đảm minh bạch giá vé cho khách hàng.
        </p>
      </div>

      {/* Danh sách văn bản 3 dòng tinh tế (không dùng thẻ viền) */}
      <div className="trust-text-list">
        {homeTrustPoints.map((point, index) => (
          <div key={point.id} className="trust-text-line">
            <span className="trust-text-num font-mono">0{index + 1}</span>
            <div className="trust-text-content">
              <strong className="trust-text-title">{point.title}</strong>
              <span className="trust-text-sep">—</span>
              <span className="trust-text-desc">{point.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="payment-support-box">
        <span className="payment-box-label">PHƯƠNG THỨC THANH TOÁN TRỰC TUYẾN:</span>
        <div className="payment-tags-list">
          {paymentMethods.map((method) => (
            <span key={method.name} className="payment-tag-item">
              {method.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
