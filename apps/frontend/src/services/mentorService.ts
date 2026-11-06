import { apiClient } from './apiClient';
import type { MentorOverview, MentorProgramSummary, ApplicantListItem } from './types';

/** A cohort fellow with their admission scores and progress in the program. */
export type MentorFellow = ApplicantListItem & {
  assignments?: { total: number; submitted: number; graded: number; avg_score?: number };
  attendance?: { total_sessions: number; attended: number; rate: number; status: string };
};

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

  /** One page of a cohort's fellows, optionally searched by name, email, university or major. */
  getProgramFellowsPage: async (
    programId: string,
    page: number,
    pageSize: number,
    q = ''
  ): Promise<{ fellows: MentorFellow[]; count: number; total: number; page: number; page_size: number }> => {
    const res = await apiClient.get(`/mentor/programs/${programId}/fellows`, {
      params: { page, page_size: pageSize, ...(q ? { q } : {}) },
    });
    return { ...res.data, fellows: res.data.fellows || [] };
  },
};
