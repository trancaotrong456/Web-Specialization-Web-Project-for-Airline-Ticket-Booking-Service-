import { useMemo } from 'react';

export function Notice({ type = 'info', children, errors = null }) {
  const errorItems = useMemo(() => {
    if (!errors) return [];
    if (Array.isArray(errors)) {
      return errors.map((item) => {
        if (typeof item === 'string') return { message: item };
        return {
          field: item.field || item.path || '',
          message: item.message || item.msg || JSON.stringify(item),
        };
      });
    }
    if (typeof errors === 'object') {
      return Object.entries(errors).map(([field, message]) => ({
        field,
        message: String(message),
      }));
    }
    return [];
  }, [errors]);

  if (!children && !errorItems.length) return null;
  const icon = type === 'error' ? '!' : type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'i';

  return (
    <div className={`notice notice-${type}`} role={type === 'error' || type === 'warning' ? 'alert' : 'status'}>
      <span aria-hidden="true">{icon}</span>
      <div className="notice-content">
        {children ? <div className="notice-message">{children}</div> : null}
        {errorItems.length > 0 ? (
          <ul className="notice-error-list" aria-label="Danh sách lỗi chi tiết">
            {errorItems.map((item, index) => (
              <li key={index}>
                {item.field ? <strong>{item.field}: </strong> : null}
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
