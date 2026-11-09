import { apiClient } from './apiClient';

export interface CurriculumItem {
  id: string;
  title: string;
  description?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  /** Only this track's fellows see the module (staff only; fellows get just their own modules). */
  track_id?: string;
  /** Only these fellows see the module; empty means everyone (in the track). */
  target_applicant_ids?: string[];
  /** The book chapter this module was imported from; a new import replaces its title and content. */
  source?: string;
  source_file?: string;
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
  /** Where the curriculum was last imported from (staff only). */
  curriculum_source?: CurriculumSource;
}

/** A Leanpub-style book (Book.txt + Markua chapters) the curriculum was imported from. */
export interface CurriculumSource {
  kind: 'github' | 'zip';
  repo?: string;
  ref?: string;
  path?: string;
  commit?: string;
  file_name?: string;
  book_dir?: string;
  imported_at: string;
}

export interface CurriculumImportReport {
  chapters: number;
  added: number;
  updated: number;
  unchanged: number;
  removed: string[];
  images: number;
  warnings: string[];
}

export type CurriculumImportInput = { file: File } | { repo: string; ref?: string; path?: string };

export const roomContentService = {
  getContent: async (programId: string): Promise<{ content: ProgramRoomContent; can_edit: boolean }> => {
    const res = await apiClient.get(`/programs/${programId}/room-content`);
    return res.data;
  },

  saveCurriculum: async (programId: string, items: CurriculumItem[]): Promise<ProgramRoomContent> => {
    const res = await apiClient.put(`/programs/${programId}/room-content/curriculum`, { items });
    return res.data.content;
  },

  /** Imports a Leanpub-style book from a zip or a GitHub repository; each chapter becomes a module. */
  importBook: async (
    programId: string,
    input: CurriculumImportInput,
  ): Promise<{ content: ProgramRoomContent; report: CurriculumImportReport }> => {
    const url = `/programs/${programId}/room-content/curriculum/import`;
    if ('file' in input) {
      const form = new FormData();
      form.append('file', input.file);
      const res = await apiClient.post(url, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      return res.data;
    }
    const res = await apiClient.post(url, input, { timeout: 180000 });
    return res.data;
  },

  saveResources: async (programId: string, items: RoomResource[]): Promise<ProgramRoomContent> => {
    const res = await apiClient.put(`/programs/${programId}/room-content/resources`, { items });
    return res.data.content;
  },
};
