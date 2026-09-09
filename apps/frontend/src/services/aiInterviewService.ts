import { apiClient } from './apiClient';
import type { AIInterviewSession, EvaluationSummary } from './types';

export interface SendMessageResult {
  ai_message: string;
  is_follow_up?: boolean;
  current_question_index?: number;
  follow_up_count?: number;
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

  sendMessage: async (inviteToken: string, message: string, currentQuestionIndex?: number): Promise<SendMessageResult> => {
    const { data } = await apiClient.post<SendMessageResult>(`/interviews/${inviteToken}/message`, {
      message,
      current_question_index: currentQuestionIndex,
    });
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
    const isMp4 = video.type && video.type.includes('mp4');
    const filename = isMp4 ? 'interview_recording.mp4' : 'interview_recording.webm';
    formData.append('video', video, filename);
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

  transcribeAudio: async (inviteToken: string, audioBlob: Blob): Promise<{ text: string }> => {
    const formData = new FormData();
    const isMp4 = audioBlob.type && audioBlob.type.includes('mp4');
    const filename = isMp4 ? 'turn_audio.mp4' : 'turn_audio.webm';
    formData.append('audio', audioBlob, filename);
    const { data } = await apiClient.post<{ text: string }>(`/interviews/${inviteToken}/transcribe`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },
};

