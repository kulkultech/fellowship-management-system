import { apiClient } from './apiClient';
import type {
  ProgramAssignment,
  AssignmentSubmission,
  CreateAssignmentPayload,
  SubmitAssignmentPayload,
  GradeSubmissionPayload,
} from './types';

export interface AssignmentPage {
  assignments: ProgramAssignment[];
  total: number;
  page: number;
  page_size: number;
  /** A fellow's progress over all their assignments (fellows only). */
  fellow_stats?: {
    total: number;
    submitted: number;
    graded: number;
    completion_rate: number;
    avg_score: number | null;
  };
}

export interface SubmissionPage {
  submissions: AssignmentSubmission[];
  total: number;
  page: number;
  page_size: number;
  status_counts: { all: number; graded: number; pending: number };
}

export const assignmentService = {
  listAssignments: async (programId: string, trackId?: string): Promise<ProgramAssignment[]> => {
    const params = new URLSearchParams();
    if (trackId) params.append('track_id', trackId);
    const res = await apiClient.get(`/programs/${programId}/assignments`, { params });
    return res.data.assignments || [];
  },

  /** One page of a program's assignments, searched on the server. */
  listAssignmentsPage: async (
    programId: string,
    page: number,
    pageSize: number,
    /** focus: an assignment id whose page should be returned instead of `page`. */
    filters: { trackId?: string; q?: string; focus?: string; status?: string; due?: string } = {}
  ): Promise<AssignmentPage> => {
    const res = await apiClient.get(`/programs/${programId}/assignments`, {
      params: {
        page,
        page_size: pageSize,
        ...(filters.trackId ? { track_id: filters.trackId } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.focus ? { focus: filters.focus } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.due ? { due: filters.due } : {}),
      },
    });
    return { ...res.data, assignments: res.data.assignments || [] };
  },

  getAssignment: async (programId: string, assignmentId: string): Promise<ProgramAssignment> => {
    const res = await apiClient.get(`/programs/${programId}/assignments/${assignmentId}`);
    return res.data;
  },

  createAssignment: async (
    programId: string,
    payload: CreateAssignmentPayload
  ): Promise<ProgramAssignment> => {
    const res = await apiClient.post(`/programs/${programId}/assignments`, payload);
    return res.data;
  },

  updateAssignment: async (
    programId: string,
    assignmentId: string,
    payload: Partial<CreateAssignmentPayload>
  ): Promise<ProgramAssignment> => {
    const res = await apiClient.put(`/programs/${programId}/assignments/${assignmentId}`, payload);
    return res.data;
  },

  deleteAssignment: async (programId: string, assignmentId: string): Promise<void> => {
    await apiClient.delete(`/programs/${programId}/assignments/${assignmentId}`);
  },

  /** One page of an assignment's submissions, searched and filtered on the server. */
  listSubmissionsPage: async (
    programId: string,
    assignmentId: string,
    page: number,
    pageSize: number,
    filters: { q?: string; status?: 'graded' | 'pending' | '' } = {}
  ): Promise<SubmissionPage> => {
    const res = await apiClient.get(`/programs/${programId}/assignments/${assignmentId}/submissions`, {
      params: {
        page,
        page_size: pageSize,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
    });
    return { ...res.data, submissions: res.data.submissions || [] };
  },

  submitAssignment: async (
    programId: string,
    assignmentId: string,
    payload: SubmitAssignmentPayload
  ): Promise<{ message: string; submission: AssignmentSubmission }> => {
    const res = await apiClient.post(`/programs/${programId}/assignments/${assignmentId}/submit`, payload);
    return res.data;
  },

  gradeSubmission: async (
    programId: string,
    assignmentId: string,
    submissionId: string,
    payload: GradeSubmissionPayload
  ): Promise<{ message: string; submission: AssignmentSubmission }> => {
    const res = await apiClient.post(
      `/programs/${programId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
      payload
    );
    return res.data;
  },
};
