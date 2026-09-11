import axios, { type AxiosInstance } from 'axios';
import { useAuthStore } from '@/hooks/useAuthStore';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

/**
 * Resolve a backend-served media URL (e.g. `/uploads/logos/x.png`) to an
 * absolute URL against the API origin. Required when the frontend and backend
 * are served from different origins (staging/production): a relative URL would
 * otherwise resolve against the frontend host and return the SPA shell instead
 * of the file. Absolute, data:, and blob: URLs pass through untouched.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';

  // Check if URL is an absolute URL pointing to current origin /uploads/
  if (/^(https?:)?\/\//i.test(url)) {
    try {
      if (typeof window !== 'undefined' && window.location?.origin) {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/uploads/')) {
          parsed.pathname = `/api/v1${parsed.pathname}`;
          return parsed.toString();
        }
      }
    } catch {
      // ignore
    }
    return url;
  }

  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // Preserve frontend static assets served from public/
  if (
    url.startsWith('/litlogo') ||
    url.startsWith('/lithero') ||
    url.startsWith('/kulkul') ||
    url.startsWith('/favicon') ||
    url.startsWith('/assets/')
  ) {
    return url;
  }

  let normalizedPath = url;
  if (normalizedPath.startsWith('/uploads/')) {
    normalizedPath = `/api/v1${normalizedPath}`;
  } else if (!normalizedPath.startsWith('/api/v1/uploads/')) {
    normalizedPath = `/api/v1/uploads/${normalizedPath.replace(/^\/+/, '')}`;
  }

  const base: string = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  if (/^https?:\/\//i.test(base)) {
    try {
      const apiOrigin = new URL(base).origin;
      return `${apiOrigin}${normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath}`;
    } catch {
      return normalizedPath;
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath}`;
  }

  return normalizedPath;
}

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

apiClient.interceptors.request.use((config) => {
  if (config.method && UNSAFE_METHODS.has(config.method.toLowerCase())) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) {
      config.headers[CSRF_HEADER] = csrf;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
