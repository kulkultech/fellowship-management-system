import { apiClient } from './apiClient';

export interface CurriculumItem {
  id: string;
  title: string;
  description?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
}

export type RoomResourceCategory = 'channel' | 'repository' | 'document' | 'link';

export interface RoomResource {
  id: string;
  title: string;
  url: string;
  description?: string;
  category: RoomResourceCategory;
}

export interface ProgramRoomContent {
  program_id: string;
  curriculum: CurriculumItem[];
  resources: RoomResource[];
  updated_at?: string;
}

export const roomContentService = {
  getContent: async (programId: string): Promise<{ content: ProgramRoomContent; can_edit: boolean }> => {
    const res = await apiClient.get(`/programs/${programId}/room-content`);
    return res.data;
  },

  saveCurriculum: async (programId: string, items: CurriculumItem[]): Promise<ProgramRoomContent> => {
    const res = await apiClient.put(`/programs/${programId}/room-content/curriculum`, { items });
    return res.data.content;
  },

  saveResources: async (programId: string, items: RoomResource[]): Promise<ProgramRoomContent> => {
    const res = await apiClient.put(`/programs/${programId}/room-content/resources`, { items });
    return res.data.content;
  },
};
