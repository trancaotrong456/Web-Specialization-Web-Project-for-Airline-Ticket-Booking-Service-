const labels = { active: 'Đang hoạt động', locked: 'Đã khóa', scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Hoàn tất' };

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
