import { apiClient } from './apiClient';
import type { AIInterviewSession, EvaluationSummary } from './types';

export interface SendMessageResult {
  ai_message: string;
  is_completed: boolean;
  summary_evaluation?: EvaluationSummary;
  scorecard_score: number;
}

export interface SaveRecordingResult {
  message: string;
  recording_url: string;
  recording_status: string;
}

export const aiInterviewService = {
  getSession: async (inviteToken: string): Promise<AIInterviewSession> => {
    const { data } = await apiClient.get<AIInterviewSession>(`/interviews/${inviteToken}`);
    return data;
  },

  sendMessage: async (inviteToken: string, message: string): Promise<SendMessageResult> => {
    const { data } = await apiClient.post<SendMessageResult>(`/interviews/${inviteToken}/message`, { message });
    return data;
  },

  saveRecording: async (inviteToken: string, video: Blob | string): Promise<SaveRecordingResult> => {
    if (typeof video === 'string') {
      const { data } = await apiClient.post<SaveRecordingResult>(`/interviews/${inviteToken}/recording`, {
        recording_url: video,
      });
      return data;
    }
    const formData = new FormData();
    formData.append('video', video, 'interview_recording.webm');
    const { data } = await apiClient.post<SaveRecordingResult>(`/interviews/${inviteToken}/recording`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  resetSession: async (inviteToken: string): Promise<AIInterviewSession> => {
    const { data } = await apiClient.post<AIInterviewSession>(`/interviews/${inviteToken}/reset`);
    return data;
  },
};

