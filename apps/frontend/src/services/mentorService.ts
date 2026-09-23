import { apiClient } from './apiClient';
import type { MentorOverview, MentorProgramSummary, ApplicantListItem } from './types';

export const mentorService = {
  getOverview: async (): Promise<MentorOverview> => {
    const res = await apiClient.get('/mentor/overview');
    return res.data;
  },

  getPrograms: async (): Promise<MentorProgramSummary[]> => {
    const res = await apiClient.get('/mentor/programs');
    return res.data.programs || [];
  },

  getProgramFellows: async (
    programId: string
  ): Promise<{ program: { id: string; slug: string; name: string }; fellows: ApplicantListItem[]; count: number }> => {
    const res = await apiClient.get(`/mentor/programs/${programId}/fellows`);
    return res.data;
  },
};
