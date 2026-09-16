import { apiClient } from './apiClient';
import type {
  AuthResponse,
  CandidateRegistrationPayload,
  CompanyRegistrationPayload,
  RegistrationResponse,
  UpdateProfilePayload,
  User,
} from './types';

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });
    return data;
  },

  registerCandidate: async (payload: CandidateRegistrationPayload): Promise<RegistrationResponse> => {
    const { data } = await apiClient.post<RegistrationResponse>('/auth/register-candidate', payload);
    return data;
  },

  registerCompany: async (payload: CompanyRegistrationPayload): Promise<RegistrationResponse> => {
    const { data } = await apiClient.post<RegistrationResponse>('/auth/register-company', payload);
    return data;
  },

  activateAccount: async (token: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>('/auth/activate', { token });
    return data;
  },

  resendActivation: async (email: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/auth/resend-activation', { email });
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },

  updateProfile: async (payload: UpdateProfilePayload): Promise<User> => {
    const { data } = await apiClient.put<User>('/auth/profile', payload);
    return data;
  },
};
