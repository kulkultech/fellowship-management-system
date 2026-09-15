import { apiClient } from './apiClient';
import type {
  ApplyRequest,
  ApplyResponse,
  CandidateStatusResponse,
  ProgramPublicInfo,
  StartProgramResponse,
  TrackDetailPublicResponse,
} from './types';

export const programService = {
  getProgram: async (orgSlug: string, programSlug: string, previewToken?: string): Promise<ProgramPublicInfo> => {
    const { data } = await apiClient.get<ProgramPublicInfo>(`/programs/${orgSlug}/${programSlug}`, {
      params: previewToken ? { preview: previewToken } : undefined,
    });
    return data;
  },

  getCandidateStatus: async (orgSlug: string, programSlug: string): Promise<CandidateStatusResponse> => {
    const { data } = await apiClient.get<CandidateStatusResponse>(`/programs/${orgSlug}/${programSlug}/candidate-status`);
    return data;
  },

  startProgram: async (
    orgSlug: string,
    programSlug: string,
    payload?: { track_slug?: string; track_id?: string }
  ): Promise<StartProgramResponse> => {
    const { data } = await apiClient.post<StartProgramResponse>(`/programs/${orgSlug}/${programSlug}/start`, payload || {});
    return data;
  },

  getTrack: async (orgSlug: string, programSlug: string, trackSlug: string): Promise<TrackDetailPublicResponse> => {
    const { data } = await apiClient.get<TrackDetailPublicResponse>(`/programs/${orgSlug}/${programSlug}/tracks/${trackSlug}`);
    return data;
  },

  apply: async (orgSlug: string, programSlug: string, req: ApplyRequest, previewToken?: string): Promise<ApplyResponse> => {
    const { data } = await apiClient.post<ApplyResponse>(`/programs/${orgSlug}/${programSlug}/apply`, req, {
      params: previewToken ? { preview: previewToken } : undefined,
    });
    return data;
  },

  applyToTrack: async (orgSlug: string, programSlug: string, trackSlug: string, req: ApplyRequest, previewToken?: string): Promise<ApplyResponse> => {
    const { data } = await apiClient.post<ApplyResponse>(`/programs/${orgSlug}/${programSlug}/tracks/${trackSlug}/apply`, req, {
      params: previewToken ? { preview: previewToken } : undefined,
    });
    return data;
  },
};
