import { apiClient } from './apiClient';
import type { ApplyRequest, ApplyResponse, ProgramPublicInfo, TrackDetailPublicResponse } from './types';

export const programService = {
  getProgram: async (orgSlug: string, programSlug: string, previewToken?: string): Promise<ProgramPublicInfo> => {
    const { data } = await apiClient.get<ProgramPublicInfo>(`/programs/${orgSlug}/${programSlug}`, {
      params: previewToken ? { preview: previewToken } : undefined,
    });
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
