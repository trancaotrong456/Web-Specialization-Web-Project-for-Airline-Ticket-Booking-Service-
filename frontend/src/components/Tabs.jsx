import React from 'react';

export function Tabs({ tabs = [], activeTab, onChange, className = '', ariaLabel = 'Lựa chọn tab' }) {
  return (
    <div className={`trip-type-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const disabled = typeof tab === 'object' ? tab.disabled : false;
        const badge = typeof tab === 'object' ? tab.badge : null;
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${id}`}
            aria-disabled={disabled}
            disabled={disabled}
            type="button"
            className={`trip-type-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              if (!disabled && onChange) onChange(id);
            }}
          >
            <span>{label}</span>
            {badge ? <span className="tab-badge-pill">{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
