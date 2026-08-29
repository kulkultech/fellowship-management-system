import { apiClient } from './apiClient';
import type { ApplyRequest, ApplyResponse, ProgramPublicInfo } from './types';

export const programService = {
  getProgram: async (orgSlug: string, programSlug: string): Promise<ProgramPublicInfo> => {
    const { data } = await apiClient.get<ProgramPublicInfo>(`/programs/${orgSlug}/${programSlug}`);
    return data;
  },

  apply: async (orgSlug: string, programSlug: string, req: ApplyRequest): Promise<ApplyResponse> => {
    const { data } = await apiClient.post<ApplyResponse>(`/programs/${orgSlug}/${programSlug}/apply`, req);
    return data;
  },
};
