export function Notice({ type = 'info', children }) {
  if (!children) return null;
  const icon = type === 'error' ? '!' : type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'i';
  return (
    <div className={`notice notice-${type}`} role={type === 'error' || type === 'warning' ? 'alert' : 'status'}>
      <span aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
