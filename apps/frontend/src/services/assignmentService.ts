import { apiClient } from './apiClient';
import type {
  ProgramAssignment,
  AssignmentSubmission,
  CreateAssignmentPayload,
  SubmitAssignmentPayload,
  GradeSubmissionPayload,
} from './types';

export const assignmentService = {
  listAssignments: async (programId: string, trackId?: string): Promise<ProgramAssignment[]> => {
    const params = new URLSearchParams();
    if (trackId) params.append('track_id', trackId);
    const res = await apiClient.get(`/programs/${programId}/assignments`, { params });
    return res.data.assignments || [];
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

  listSubmissions: async (
    programId: string,
    assignmentId: string
  ): Promise<AssignmentSubmission[]> => {
    const res = await apiClient.get(`/programs/${programId}/assignments/${assignmentId}/submissions`);
    return res.data.submissions || [];
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
