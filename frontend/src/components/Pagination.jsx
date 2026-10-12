export function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Phân trang">
      <button aria-label={page <= 1 ? 'Không có trang trước' : `Đi tới trang ${page - 1}`} type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Trang trước</button>
      <span aria-current="page">Trang {page} / {totalPages}</span>
      <button aria-label={page >= totalPages ? 'Không có trang sau' : `Đi tới trang ${page + 1}`} type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Trang sau</button>
    </nav>
  );
}
