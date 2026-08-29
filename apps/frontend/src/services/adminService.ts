import { apiClient } from './apiClient';
import type { ApplicantDetailResponse, ApplicantListItem, Program } from './types';

export interface CreateProgramPayload {
  slug: string;
  name: string;
  description?: string;
  image_url?: string;
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
}

export interface UpdateProgramConfigPayload {
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
}

export const adminService = {
  listPrograms: async (): Promise<Program[]> => {
    const { data } = await apiClient.get<Program[]>('/admin/programs');
    return data;
  },

  createProgram: async (payload: CreateProgramPayload): Promise<Program> => {
    const { data } = await apiClient.post<Program>('/admin/programs', payload);
    return data;
  },

  updateProgramConfig: async (programId: string, payload: UpdateProgramConfigPayload): Promise<Program> => {
    const { data } = await apiClient.put<Program>(`/admin/programs/${programId}`, payload);
    return data;
  },

  listApplicants: async (programId: string, stageFilter?: string): Promise<ApplicantListItem[]> => {
    const { data } = await apiClient.get<ApplicantListItem[]>('/admin/applicants', {
      params: {
        program_id: programId,
        stage: stageFilter || '',
      },
    });
    return data;
  },

  getApplicantDetails: async (applicantId: string): Promise<ApplicantDetailResponse> => {
    const { data } = await apiClient.get<ApplicantDetailResponse>(`/admin/applicants/${applicantId}`);
    return data;
  },

  makeDecision: async (applicantId: string, decision: 'approve' | 'reject', notes?: string) => {
    const { data } = await apiClient.post(`/admin/applicants/${applicantId}/decision`, {
      decision,
      notes: notes || '',
    });
    return data;
  },
};
