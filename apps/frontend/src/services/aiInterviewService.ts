import { apiClient } from './apiClient';
import type { AIInterviewSession, EvaluationSummary } from './types';

export interface SendMessageResult {
  ai_message: string;
  is_completed: boolean;
  summary_evaluation?: EvaluationSummary;
  scorecard_score: number;
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
};
