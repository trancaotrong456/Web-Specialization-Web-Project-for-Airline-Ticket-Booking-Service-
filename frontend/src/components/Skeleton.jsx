import React from 'react';

export function Skeleton({ width, height, radius = '4px', className = '', style = {}, ...rest }) {
  const combinedStyle = {
    width: width || '100%',
    height: height || '1rem',
    borderRadius: radius,
    ...style,
  };

  return <div className={`skeleton-shimmer ${className}`.trim()} style={combinedStyle} aria-hidden="true" {...rest} />;
}
