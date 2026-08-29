import { apiClient } from './apiClient';
import type { AnswerInput, SubmitTestResponse, TestResultResponse, TestSession } from './types';

export const testService = {
  getTestSession: async (testToken: string): Promise<TestSession> => {
    const { data } = await apiClient.get<TestSession>(`/tests/${testToken}`);
    return data;
  },

  submitTest: async (testToken: string, answers: AnswerInput[]): Promise<SubmitTestResponse> => {
    const { data } = await apiClient.post<SubmitTestResponse>(`/tests/${testToken}/submit`, { answers });
    return data;
  },

  getResult: async (testToken: string): Promise<TestResultResponse> => {
    const { data } = await apiClient.get<TestResultResponse>(`/tests/${testToken}/result`);
    return data;
  },
};
