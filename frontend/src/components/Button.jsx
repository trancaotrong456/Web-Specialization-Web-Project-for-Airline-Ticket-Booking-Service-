import React from 'react';
import { Link } from 'react-router-dom';

export function Button({
  children,
  variant = 'primary', // 'primary' | 'accent' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size = 'md',         // 'sm' | 'md' | 'lg'
  to,
  href,
  className = '',
  disabled = false,
  type = 'button',
  ...rest
}) {
  const variantClass = `button-${variant}`;
  const sizeClass = size !== 'md' ? `button-${size}` : '';
  const combinedClass = `button ${variantClass} ${sizeClass} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={combinedClass} aria-disabled={disabled} {...rest}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={combinedClass} aria-disabled={disabled} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={combinedClass} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
