import React from 'react';

export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {icon ? <span className="empty-state-icon" aria-hidden="true">{icon}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
