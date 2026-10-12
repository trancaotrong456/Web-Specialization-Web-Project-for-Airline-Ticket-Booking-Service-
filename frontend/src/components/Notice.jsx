export function Notice({ type = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{type === 'error' ? '!' : type === 'success' ? '✓' : 'i'}</span>
      <div>{children}</div>
    </div>
  );
}
