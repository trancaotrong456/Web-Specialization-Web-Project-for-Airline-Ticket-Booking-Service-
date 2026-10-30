import React from 'react';

export function Table({ children, className = '', containerClassName = '', ...rest }) {
  return (
    <div className={`table-wrap booking-table-wrap ${containerClassName}`.trim()}>
      <table className={`data-table ${className}`.trim()} {...rest}>
        {children}
      </table>
    </div>
  );
}
