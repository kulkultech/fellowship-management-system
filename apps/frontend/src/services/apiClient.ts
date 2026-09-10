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
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    const base: string = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    if (/^https?:\/\//i.test(base)) {
      try {
        return new URL(url, base).toString();
      } catch {
        return url;
      }
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${url}`;
    }
  }
  return url;
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
