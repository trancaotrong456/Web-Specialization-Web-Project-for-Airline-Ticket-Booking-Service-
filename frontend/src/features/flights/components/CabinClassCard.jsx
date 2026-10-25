import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { homeCabinClasses } from '../homeData';

export function CabinClassCard() {
  const navigate = useNavigate();

  return (
    <section className="cabin-showcase-section" aria-labelledby="cabins-heading">
      <div className="section-header-row">
        <div>
          <span className="section-kicker">CẤU HÌNH KHOANG BAY</span>
          <h2 id="cabins-heading" className="section-title">
            Hạng vé và tiêu chuẩn phục vụ
          </h2>
        </div>
        <p className="section-sub-copy">
          Thông tin chi tiết về tiện ích ghế ngồi và định mức hành lý theo từng hạng vé trên chuyến bay.
        </p>
      </div>

      <div className="cabin-asymmetric-grid">
        {homeCabinClasses.map((cabin) => (
          <div key={cabin.id} className="cabin-editorial-card">
            <div
              className="cabin-media-frame"
              style={{ backgroundImage: `url("${cabin.image}")` }}
              aria-hidden="true"
            >
              <div className="cabin-media-tint" />
              <div className="cabin-badge-strip">
                <span className="cabin-badge-tag">{cabin.badge}</span>
                <span className="cabin-tag-spec">{cabin.tagText}</span>
              </div>
            </div>

            <div className="cabin-editorial-content">
              <h3 className="cabin-card-title">{cabin.title}</h3>
              <p className="cabin-card-desc">{cabin.desc}</p>

              <div className="cabin-features-list">
                <span className="features-header-text">TIÊU CHUẨN KÈM THEO:</span>
                <ul>
                  {cabin.features.map((feature, idx) => (
                    <li key={idx}>
                      <span className="feature-idx font-mono" aria-hidden="true">0{idx + 1}.</span>
                      <span className="feature-text">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="cabin-card-footer">
                <button
                  type="button"
                  className={`cabin-action-btn ${cabin.id === 'business' ? 'is-primary' : 'is-secondary'}`}
                  onClick={() => navigate('/flights/search')}
                >
                  <span>{cabin.ctaText}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
