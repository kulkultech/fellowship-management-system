import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export interface UrlStateOptions {
  /** Change the current history entry instead of adding one (for automatic changes, not clicks) */
  replace?: boolean;
}

// Several values set in the same click (a program and a view) make one history entry, not two
let writingThisTick = false;

/**
 * A piece of page state kept in the address, e.g. ?view=sessions. Each change the user makes adds a
 * history entry, so the browser's Back and Forward buttons step through what they did, and a
 * copied or reloaded link opens the same place. The fallback value is left out of the address.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T, options?: UrlStateOptions) => void] {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const value = (searchParams.get(key) as T | null) ?? fallback;

  const setValue = useCallback(
    (next: T, options?: UrlStateOptions) => {
      // Read the live address: an earlier write in this same click has already changed it
      const params = new URLSearchParams(window.location.search);
      if ((params.get(key) ?? fallback) === next) return;
      if (next === fallback || next === '') params.delete(key);
      else params.set(key, next);

      const replace = Boolean(options?.replace) || writingThisTick;
      writingThisTick = true;
      queueMicrotask(() => {
        writingThisTick = false;
      });

      const search = params.toString();
      navigate(
        { pathname: window.location.pathname, search: search ? `?${search}` : '', hash: window.location.hash },
        { replace },
      );
    },
    [key, fallback, navigate],
  );

  return [value, setValue];
}
