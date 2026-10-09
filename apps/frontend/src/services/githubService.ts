import { apiClient } from './apiClient';
import type { ProgramGitHubActivity, ProgramGitHubRepo } from './types';

export const githubService = {
  getActivity: async (programId: string): Promise<ProgramGitHubActivity> => {
    const res = await apiClient.get<ProgramGitHubActivity>(`/programs/${programId}/github/activity`);
    return res.data;
  },

  addRepo: async (programId: string, repoUrl: string): Promise<ProgramGitHubRepo> => {
    const res = await apiClient.post<ProgramGitHubRepo>(`/programs/${programId}/github/repos`, {
      repo_url: repoUrl,
    });
    return res.data;
  },

  syncRepo: async (programId: string, repoId: string): Promise<ProgramGitHubRepo> => {
    const res = await apiClient.post<ProgramGitHubRepo>(`/programs/${programId}/github/repos/${repoId}/sync`);
    return res.data;
  },

  /** Sets (or clears, with '') a fellow's GitHub username or profile link */
  updateFellowGitHub: async (
    programId: string,
    applicantId: string,
    github: string
  ): Promise<{ github_url: string; github_login: string }> => {
    const res = await apiClient.put(`/programs/${programId}/github/fellows/${applicantId}`, { github });
    return res.data;
  },

  removeRepo: async (programId: string, repoId: string): Promise<void> => {
    await apiClient.delete(`/programs/${programId}/github/repos/${repoId}`);
  },
};
