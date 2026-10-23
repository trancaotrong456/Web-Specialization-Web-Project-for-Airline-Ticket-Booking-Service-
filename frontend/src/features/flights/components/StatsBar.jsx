import React from 'react';
import { homeOperationalNotice } from '../homeData';

export function StatsBar() {
  return (
    <section aria-label="Thông tin vận hành chuyến bay" className="operational-strip-section">
      <div className="operational-strip-card">
        <div className="operational-strip-inner">
          <span className="operational-strip-tag font-mono">
            {homeOperationalNotice.kicker}
          </span>
          <span className="operational-strip-divider" aria-hidden="true">|</span>
          <p className="operational-strip-text">
            {homeOperationalNotice.line}
          </p>
        </div>
      </div>
    </section>
  );
}
