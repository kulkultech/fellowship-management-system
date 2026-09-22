import { apiClient } from './apiClient';
import type {
  AuthResponse,
  CandidateRegistrationPayload,
  CompanyRegistrationPayload,
  RegistrationResponse,
  UpdateProfilePayload,
  User,
  InvitationDetails,
  AcceptInvitePayload,
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

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
    return data;
  },

  verifyResetToken: async (token: string): Promise<{ valid: boolean; email?: string }> => {
    const { data } = await apiClient.get<{ valid: boolean; email?: string }>(
      `/auth/reset-password/verify?token=${encodeURIComponent(token)}`
    );
    return data;
  },

  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>('/auth/reset-password', { token, password });
    return data;
  },

  getInvitation: async (token: string): Promise<InvitationDetails> => {
    const { data } = await apiClient.get<InvitationDetails>(`/auth/invitations/${token}`);
    return data;
  },

  acceptInvitation: async (
    token: string,
    payload: AcceptInvitePayload
  ): Promise<{ message: string; user: User; redirect_url: string }> => {
    const { data } = await apiClient.post<{ message: string; user: User; redirect_url: string }>(
      `/auth/invitations/${token}/accept`,
      payload
    );
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
