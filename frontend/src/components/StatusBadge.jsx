const labels = { active: 'Đang hoạt động', locked: 'Đã khóa' };

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
