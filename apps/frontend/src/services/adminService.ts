import { apiClient } from './apiClient';
import type {
  ApplicantDetailResponse,
  ApplicantListItem,
  MCQQuestion,
  Organization,
  PipelineConfigPayload,
  Program,
} from './types';

export interface CreateProgramPayload {
  slug: string;
  name: string;
  description?: string;
  image_url?: string;
  enable_mcq?: boolean;
  logic_test_duration_minutes?: number;
  logic_test_passing_score?: number;
  allow_retake?: boolean;
  enable_ai_interview?: boolean;
  ai_interview_instructions?: string;
  ai_interview_questions?: string[];
}

export const adminService = {
  listPrograms: async (): Promise<Program[]> => {
    const { data } = await apiClient.get<{ programs: Program[] }>('/admin/programs');
    return data.programs || [];
  },

  createProgram: async (payload: CreateProgramPayload): Promise<Program> => {
    const { data } = await apiClient.post<Program>('/admin/programs', payload);
    return data;
  },

  updatePipelineConfig: async (programId: string, payload: PipelineConfigPayload): Promise<Program> => {
    const { data } = await apiClient.put<Program>(`/admin/programs/${programId}/pipeline-config`, payload);
    return data;
  },

  listProgramQuestions: async (programId: string): Promise<MCQQuestion[]> => {
    const { data } = await apiClient.get<{ questions: MCQQuestion[] }>(`/admin/programs/${programId}/questions`);
    return data.questions || [];
  },

  saveProgramQuestions: async (programId: string, questions: MCQQuestion[]): Promise<MCQQuestion[]> => {
    const { data } = await apiClient.put<{ questions: MCQQuestion[] }>(`/admin/programs/${programId}/questions`, { questions });
    return data.questions || [];
  },

  listApplicants: async (programId: string, stageFilter?: string): Promise<ApplicantListItem[]> => {
    const { data } = await apiClient.get<{ applicants: ApplicantListItem[] }>('/admin/applicants', {
      params: {
        program_id: programId,
        stage: stageFilter || '',
      },
    });
    return data.applicants || [];
  },

  getApplicantDetails: async (applicantId: string): Promise<ApplicantDetailResponse> => {
    const { data } = await apiClient.get<ApplicantDetailResponse>(`/admin/applicants/${applicantId}`);
    return data;
  },

  updateApplicantStage: async (applicantId: string, stage: string, notes?: string) => {
    const { data } = await apiClient.post(`/admin/applicants/${applicantId}/stage`, {
      stage,
      notes: notes || '',
    });
    return data;
  },

  // Superadmin Company Approvals
  listCompanies: async (status?: string): Promise<Organization[]> => {
    const { data } = await apiClient.get<{ companies: Organization[] }>('/admin/companies', {
      params: { status: status || '' },
    });
    return data.companies || [];
  },

  approveCompany: async (companyId: string): Promise<Organization> => {
    const { data } = await apiClient.post<{ company: Organization }>(`/admin/companies/${companyId}/approve`);
    return data.company;
  },

  rejectCompany: async (companyId: string): Promise<Organization> => {
    const { data } = await apiClient.post<{ company: Organization }>(`/admin/companies/${companyId}/reject`);
    return data.company;
  },
};
