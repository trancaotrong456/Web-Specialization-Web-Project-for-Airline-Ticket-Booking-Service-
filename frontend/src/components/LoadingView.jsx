export function LoadingView({ label = 'Đang tải dữ liệu…' }) {
  return <div className="loading-view" role="status"><span className="loading-spinner" aria-hidden="true" />{label}</div>;
}
