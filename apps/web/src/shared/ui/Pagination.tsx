interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Страницы таблицы" className="pagination">
      <button
        type="button"
        className="button button--secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Назад
      </button>
      <p className="pagination__status">
        Страница {page} из {pageCount}
      </p>
      <button
        type="button"
        className="button button--secondary"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Вперёд
      </button>
    </nav>
  );
}
