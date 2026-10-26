import React from 'react';

export function PageHeader({ kicker, eyebrow, title, description, actions, className = '' }) {
  const displayKicker = kicker || eyebrow;

  return (
    <header className={`page-header-container ${className}`}>
      <div className="page-header-content">
        {displayKicker ? <span className="section-kicker page-header-kicker">{displayKicker}</span> : null}
        {title ? <h1 className="page-header-title">{title}</h1> : null}
        {description ? <p className="page-header-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
