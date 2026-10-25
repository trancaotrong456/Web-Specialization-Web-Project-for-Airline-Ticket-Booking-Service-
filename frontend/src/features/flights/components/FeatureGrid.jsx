import React from 'react';
import { homeWorkflows } from '../homeData';

export function FeatureGrid() {
  return (
    <section aria-labelledby="workflow-heading" className="workflow-section">
      <div className="section-header-row">
        <div>
          <span className="section-kicker">QUY TRÌNH ĐẶT VÉ</span>
          <h2 id="workflow-heading" className="section-title">
            3 bước tra cứu và xác nhận chuyến bay
          </h2>
        </div>
        <p className="section-sub-copy">
          Toàn bộ quy trình diễn ra trực tuyến, không yêu cầu tạo tài khoản để tra cứu thông tin chuyến bay.
        </p>
      </div>

      <div className="workflow-grid">
        {homeWorkflows.map((item) => (
          <div key={item.step} className="workflow-step-card">
            <div className="workflow-card-top">
              <span className="workflow-step-number font-mono">{item.step}</span>
            </div>
            <h3 className="workflow-step-title">{item.title}</h3>
            <p className="workflow-step-desc">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
