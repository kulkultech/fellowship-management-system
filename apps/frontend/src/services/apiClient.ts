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
