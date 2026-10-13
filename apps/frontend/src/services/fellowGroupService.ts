import { apiClient } from './apiClient';

/** A named set of a program's fellows, used to target sessions and assignments quickly. */
export interface FellowGroup {
  id: string;
  program_id: string;
  name: string;
  member_ids: string[];
  created_at: string;
  updated_at: string;
}

export const fellowGroupService = {
  listGroups: async (programId: string): Promise<FellowGroup[]> => {
    const res = await apiClient.get(`/programs/${programId}/fellow-groups`);
    return res.data.groups || [];
  },

  createGroup: async (programId: string, payload: { name: string; member_ids: string[] }): Promise<FellowGroup> => {
    const res = await apiClient.post(`/programs/${programId}/fellow-groups`, payload);
    return res.data.group;
  },

  updateGroup: async (
    programId: string,
    groupId: string,
    payload: { name: string; member_ids: string[] }
  ): Promise<FellowGroup> => {
    const res = await apiClient.put(`/programs/${programId}/fellow-groups/${groupId}`, payload);
    return res.data.group;
  },

  deleteGroup: async (programId: string, groupId: string): Promise<void> => {
    await apiClient.delete(`/programs/${programId}/fellow-groups/${groupId}`);
  },
};
