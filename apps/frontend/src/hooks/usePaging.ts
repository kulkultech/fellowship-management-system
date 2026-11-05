import { useEffect, useState } from 'react';

/**
 * Page number and size for a server-paged list. Goes back to page 1 whenever a value in
 * `resetOn` (search text, filters, ...) or the page size changes.
 */
export function usePaging(resetOn: unknown[], initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const resetKey = JSON.stringify(resetOn);
  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);
  return { page, setPage, pageSize, setPageSize };
}
