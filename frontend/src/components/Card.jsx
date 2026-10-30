import React from 'react';

export function Card({ children, className = '', as: Component = 'section', ...rest }) {
  return (
    <Component className={`surface-card ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}
