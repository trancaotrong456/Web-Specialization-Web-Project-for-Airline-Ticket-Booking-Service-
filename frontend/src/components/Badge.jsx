import React from 'react';

export function Badge({ children, variant = 'neutral', className = '', ...rest }) {
  // variant: 'brand' | 'accent' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  return (
    <span className={`badge-pill badge-${variant} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
