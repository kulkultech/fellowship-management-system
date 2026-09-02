import { apiClient } from './apiClient';
import type {
  ApplicantDetailResponse,
  ApplicantListItem,
  MCQQuestion,
  Organization,
  PipelineConfigPayload,
  Program,
  Track,
  QuestionSet,
  CreateQuestionSetPayload,
  UpdateQuestionSetPayload,
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

export interface CreateTrackPayload {
  question_set_id?: string;
  slug: string;
  name: string;
  description?: string;
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

  deleteProgram: async (programId: string): Promise<void> => {
    await apiClient.delete(`/admin/programs/${programId}`);
  },

  updatePipelineConfig: async (programId: string, payload: PipelineConfigPayload): Promise<Program> => {
    const { data } = await apiClient.put<Program>(`/admin/programs/${programId}/pipeline-config`, payload);
    return data;
  },

  updateProgramStages: async (programId: string, stages: import('./types').ApplicationStageItem[]): Promise<Program> => {
    const { data } = await apiClient.put<Program>(`/admin/programs/${programId}/stages`, { stages });
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

  // Tracks Management
  listProgramTracks: async (programId: string): Promise<Track[]> => {
    const { data } = await apiClient.get<{ tracks: Track[] }>(`/admin/programs/${programId}/tracks`);
    return data.tracks || [];
  },

  createProgramTrack: async (programId: string, payload: CreateTrackPayload): Promise<Track> => {
    const { data } = await apiClient.post<Track>(`/admin/programs/${programId}/tracks`, payload);
    return data;
  },

  updateTrack: async (trackId: string, payload: CreateTrackPayload): Promise<Track> => {
    const { data } = await apiClient.put<Track>(`/admin/tracks/${trackId}`, payload);
    return data;
  },

  deleteTrack: async (trackId: string): Promise<void> => {
    await apiClient.delete(`/admin/tracks/${trackId}`);
  },

  listTrackQuestions: async (trackId: string): Promise<MCQQuestion[]> => {
    const { data } = await apiClient.get<{ questions: MCQQuestion[] }>(`/admin/tracks/${trackId}/questions`);
    return data.questions || [];
  },

  saveTrackQuestions: async (trackId: string, questions: MCQQuestion[]): Promise<MCQQuestion[]> => {
    const { data } = await apiClient.put<{ questions: MCQQuestion[] }>(`/admin/tracks/${trackId}/questions`, { questions });
    return data.questions || [];
  },

  // Question Sets / Question Banks Management
  listQuestionSets: async (programId?: string): Promise<QuestionSet[]> => {
    const { data } = await apiClient.get<{ question_sets: QuestionSet[] }>('/admin/question-sets', {
      params: { program_id: programId || '' },
    });
    return data.question_sets || [];
  },

  getQuestionSet: async (id: string): Promise<QuestionSet> => {
    const { data } = await apiClient.get<QuestionSet>(`/admin/question-sets/${id}`);
    return data;
  },

  createQuestionSet: async (payload: CreateQuestionSetPayload): Promise<QuestionSet> => {
    const { data } = await apiClient.post<QuestionSet>('/admin/question-sets', payload);
    return data;
  },

  updateQuestionSet: async (id: string, payload: UpdateQuestionSetPayload): Promise<QuestionSet> => {
    const { data } = await apiClient.put<QuestionSet>(`/admin/question-sets/${id}`, payload);
    return data;
  },

  deleteQuestionSet: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/question-sets/${id}`);
  },

  duplicateQuestionSet: async (id: string): Promise<QuestionSet> => {
    const { data } = await apiClient.post<QuestionSet>(`/admin/question-sets/${id}/duplicate`);
    return data;
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

  // Organization Profile
  getOrganization: async (): Promise<Organization> => {
    const { data } = await apiClient.get<Organization>('/admin/organization');
    return data;
  },

  updateOrganization: async (payload: { name: string; contact_email: string; logo_url: string }): Promise<Organization> => {
    const { data } = await apiClient.put<Organization>('/admin/organization', payload);
    return data;
  },
};
