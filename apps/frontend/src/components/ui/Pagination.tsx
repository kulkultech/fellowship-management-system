import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** What the rows are, for "Showing 1–25 of 312 candidates". */
  noun?: string;
  /** A new page is loading (the current rows stay visible meanwhile). */
  isFetching?: boolean;
}

/** Page numbers to show: first, last, and the current page with its neighbours ("…" between). */
export function pageWindow(page: number, pageCount: number): Array<number | '…'> {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Page controls under a server-paged list. */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  noun = 'items',
  isFetching = false,
}) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Deleting the last rows of the last page would leave an empty page: step back instead.
  useEffect(() => {
    if (total > 0 && page > pageCount) onPageChange(pageCount);
  }, [total, page, pageCount, onPageChange]);
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
      <div className="flex items-center gap-2 meta-text">
        <span>
          Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}
        </span>
        {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-label="Loading" />}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 meta-text">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="filter-select"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pages">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="btn btn-icon-sm btn-ghost"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageWindow(page, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 meta-text">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`btn btn-sm min-w-8 justify-center ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
              className="btn btn-icon-sm btn-ghost"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};
