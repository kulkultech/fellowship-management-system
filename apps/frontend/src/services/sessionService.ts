import { apiClient } from './apiClient';
import type {
  ProgramSession,
  SessionAttendance,
  FellowAttendanceSummary,
  CreateSessionPayload,
  BatchAttendanceUpdatePayload,
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

  getAttendanceSummary: async (programId: string): Promise<FellowAttendanceSummary[]> => {
    const res = await apiClient.get(`/programs/${programId}/attendance-summary`);
    return res.data.summaries || [];
  },
};
