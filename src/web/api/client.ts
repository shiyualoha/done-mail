import axios from 'axios';
import { clearQueryState } from '../queryClient';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  result?: T;
  errors?: Array<{ code: string; message: string }>;
  messages?: string[];
  result_info?: Record<string, unknown>;
  message?: string;
}

export interface AuthState {
  initialized: boolean;
  authenticated: boolean;
}

const api = axios.create({
  baseURL: '/api/internal',
  timeout: 30000,
  withCredentials: true
});

api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      const timing = response.headers['server-timing'];
      const match = typeof timing === 'string' ? /dur=([\d.]+)/.exec(timing) : null;
      const duration = match ? Number(match[1]) : 0;
      if (duration > 500) {
        console.warn(`[DoneMail slow API] ${response.config.method?.toUpperCase()} ${response.config.url} ${duration}ms`);
      }
    }
    return response;
  },
  (error) => {
    const url = String(error?.config?.url || '');
    const firstCode = error?.response?.data?.errors?.[0]?.code;
    if (error?.response?.status === 428 || error?.response?.data?.code === 'SETUP_REQUIRED' || firstCode === 'SETUP_REQUIRED') {
      clearQueryState();
      if (window.location.pathname !== '/setup') {
        window.location.assign('/setup');
      }
      return Promise.reject(error);
    }
    if (error?.response?.status === 401 && !url.includes('/auth/login') && window.location.pathname !== '/login') {
      clearQueryState();
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export async function loginWithAdminKey(adminKey: string) {
  await api.post<ApiResponse<{ authenticated: boolean }>>('/auth/login', { adminKey });
  clearQueryState();
}

export async function setupAdminKey(adminKey: string) {
  await api.post<ApiResponse<{ initialized: boolean; authenticated: boolean }>>('/auth/setup', { adminKey });
  clearQueryState();
}

export async function logoutSession() {
  clearQueryState();
  await api.post<ApiResponse<{ authenticated: boolean }>>('/auth/logout').catch(() => undefined);
}

export async function changeAdminKey(currentKey: string, newKey: string) {
  await api.put<ApiResponse<{ authenticated: boolean }>>('/auth/admin-key', { currentKey, newKey });
  clearQueryState();
}

export function apiData<T>(response: { data: ApiResponse<T> }): T {
  return response.data.result ?? response.data.data;
}

export function apiResultInfo(response: { data: ApiResponse<unknown> }) {
  return response.data.result_info || {};
}

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { errors?: Array<{ message?: string }>; message?: string } } })?.response?.data;
  return data?.errors?.[0]?.message || data?.message || fallback;
}

export default api;
