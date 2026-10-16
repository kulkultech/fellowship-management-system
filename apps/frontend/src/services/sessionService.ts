import { apiClient } from './apiClient';
import type {
  ProgramSession,
  SessionAttendance,
  AttendanceStatus,
  FellowAttendanceSummary,
  MentorAttendance,
  MentorAttendanceSummary,
  CreateSessionPayload,
  BatchAttendanceUpdatePayload,
  SessionFeedback,
  SessionFeedbackItem,
} from './types';

export const sessionService = {
  listSessions: async (programId: string, trackId?: string): Promise<ProgramSession[]> => {
    const params = new URLSearchParams();
    if (trackId) params.append('track_id', trackId);
    const res = await apiClient.get(`/programs/${programId}/sessions`, { params });
    return res.data.sessions || [];
  },

  getSession: async (programId: string, sessionId: string): Promise<ProgramSession> => {
    const res = await apiClient.get(`/programs/${programId}/sessions/${sessionId}`);
    return res.data;
  },

  getSessionDirect: async (sessionId: string): Promise<ProgramSession> => {
    const res = await apiClient.get(`/sessions/${sessionId}`);
    return res.data;
  },

  createSession: async (programId: string, payload: CreateSessionPayload): Promise<ProgramSession> => {
    const res = await apiClient.post(`/programs/${programId}/sessions`, payload);
    return res.data;
  },

  updateSession: async (
    programId: string,
    sessionId: string,
    payload: Partial<CreateSessionPayload>
  ): Promise<ProgramSession> => {
    const res = await apiClient.put(`/programs/${programId}/sessions/${sessionId}`, payload);
    return res.data;
  },

  deleteSession: async (programId: string, sessionId: string): Promise<void> => {
    await apiClient.delete(`/programs/${programId}/sessions/${sessionId}`);
  },

  getSessionAttendance: async (programId: string, sessionId: string): Promise<SessionAttendance[]> => {
    const res = await apiClient.get(`/programs/${programId}/sessions/${sessionId}/attendance`);
    return res.data.attendance || [];
  },

  batchUpdateAttendance: async (
    programId: string,
    sessionId: string,
    payload: BatchAttendanceUpdatePayload
  ): Promise<void> => {
    await apiClient.post(`/programs/${programId}/sessions/${sessionId}/attendance`, payload);
  },

  fellowCheckIn: async (
    programId: string,
    sessionId: string,
    payload: { proof_image_url: string; notes?: string }
  ): Promise<{ message: string; attendance: SessionAttendance }> => {
    const res = await apiClient.post(`/programs/${programId}/sessions/${sessionId}/check-in`, payload);
    return res.data;
  },

  validateAttendance: async (
    programId: string,
    sessionId: string,
    applicantId: string,
    payload: { status: AttendanceStatus; notes?: string }
  ): Promise<{ message: string; attendance: SessionAttendance }> => {
    const res = await apiClient.post(
      `/programs/${programId}/sessions/${sessionId}/attendance/${applicantId}/validate`,
      payload
    );
    return res.data;
  },

  getAttendanceSummary: async (programId: string): Promise<FellowAttendanceSummary[]> => {
    const res = await apiClient.get(`/programs/${programId}/attendance-summary`);
    return res.data.summaries || [];
  },

  getMentorAttendance: async (programId: string, sessionId: string): Promise<MentorAttendance[]> => {
    const res = await apiClient.get(`/programs/${programId}/sessions/${sessionId}/mentor-attendance`);
    return res.data.attendance || [];
  },

  batchUpdateMentorAttendance: async (
    programId: string,
    sessionId: string,
    attendances: { user_id: string; status: AttendanceStatus; notes?: string }[]
  ): Promise<void> => {
    await apiClient.post(`/programs/${programId}/sessions/${sessionId}/mentor-attendance`, { attendances });
  },

  getMentorAttendanceSummary: async (programId: string): Promise<MentorAttendanceSummary[]> => {
    const res = await apiClient.get(`/programs/${programId}/sessions/mentor-attendance-summary`);
    return res.data.summaries || [];
  },

  getHolidays: async (year?: number): Promise<{ date: string; name: string; type: string }[]> => {
    const params = year ? { year } : {};
    const res = await apiClient.get('/holidays', { params });
    return res.data || [];
  },

  getWorkspaceState: async (sessionId: string): Promise<any> => {
    const res = await apiClient.get(`/sessions/${sessionId}/workspace`);
    return res.data.workspace_state;
  },

  updateWorkspaceState: async (sessionId: string, workspaceState: any): Promise<any> => {
    const res = await apiClient.put(`/sessions/${sessionId}/workspace`, { workspace_state: workspaceState });
    return res.data;
  },

  getFeedback: async (sessionId: string): Promise<SessionFeedback> => {
    const res = await apiClient.get(`/sessions/${sessionId}/feedback`);
    return res.data;
  },

  // A fellow's feedback to the session's mentor (rating required)
  saveFeedbackToMentor: async (sessionId: string, payload: { rating: number; comment: string }): Promise<SessionFeedbackItem> => {
    const res = await apiClient.put(`/sessions/${sessionId}/feedback/mentor`, payload);
    return res.data;
  },

  // A mentor's or admin's feedback to one fellow (comment required, rating optional)
  saveFeedbackToFellow: async (
    sessionId: string,
    applicantId: string,
    payload: { rating?: number; comment: string }
  ): Promise<SessionFeedbackItem> => {
    const res = await apiClient.put(`/sessions/${sessionId}/feedback/fellows/${applicantId}`, payload);
    return res.data;
  },
};
