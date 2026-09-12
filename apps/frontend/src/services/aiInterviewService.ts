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

export interface SaveRecordingOptions {
  onProgress?: (percent: number, loaded: number, total: number) => void;
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

  saveRecording: async (
    inviteToken: string,
    video: Blob | string,
    options?: SaveRecordingOptions,
  ): Promise<SaveRecordingResult> => {
    if (typeof video === 'string') {
      const { data } = await apiClient.post<SaveRecordingResult>(`/interviews/${inviteToken}/recording`, {
        recording_url: video,
      });
      return data;
    }

    const isMp4 = video.type && video.type.includes('mp4');
    const filename = isMp4 ? 'interview_recording.mp4' : 'interview_recording.webm';
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/interviews/${inviteToken}/recording`;

    // Attempt 1: XMLHttpRequest with granular upload progress
    try {
      const result = await new Promise<SaveRecordingResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.withCredentials = true;

        if (xhr.upload && options?.onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
              options.onProgress!(percent, event.loaded, event.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (options?.onProgress) {
                options.onProgress(100, video.size, video.size);
              }
              resolve(parsed);
            } catch (jsonErr) {
              reject(jsonErr);
            }
          } else {
            reject(new Error(`Upload failed with HTTP ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during video upload'));
        xhr.ontimeout = () => reject(new Error('Timeout during video upload'));

        const formData = new FormData();
        formData.append('video', video, filename);
        xhr.send(formData);
      });

      return result;
    } catch (xhrErr) {
      console.warn('XHR with progress upload failed, trying fetch fallback:', xhrErr);
    }

    // Attempt 2: Browser native fetch fallback with FormData
    try {
      const formData = new FormData();
      formData.append('video', video, filename);

      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (res.ok) {
        if (options?.onProgress) options.onProgress(100, video.size, video.size);
        return (await res.json()) as SaveRecordingResult;
      }
      console.warn(`FormData upload returned HTTP ${res.status}, attempting direct binary stream fallback...`);
    } catch (fetchErr) {
      console.warn('FormData fetch upload failed, attempting direct binary stream fallback:', fetchErr);
    }

    // Attempt 3: Direct binary stream upload
    const contentType = video.type || (isMp4 ? 'video/mp4' : 'video/webm');
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: video,
      credentials: 'include',
    });

    if (res.ok) {
      if (options?.onProgress) options.onProgress(100, video.size, video.size);
      return (await res.json()) as SaveRecordingResult;
    }
    const errText = await res.text();
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  },

  resetSession: async (inviteToken: string): Promise<AIInterviewSession> => {
    const { data } = await apiClient.post<AIInterviewSession>(`/interviews/${inviteToken}/reset`);
    return data;
  },

  transcribeAudio: async (inviteToken: string, audioBlob: Blob): Promise<{ text: string }> => {
    const contentType = audioBlob.type || 'audio/wav';
    const { data } = await apiClient.post<{ text: string }>(
      `/interviews/${inviteToken}/transcribe`,
      audioBlob,
      {
        headers: {
          'Content-Type': contentType,
        },
      },
    );
    return data;
  },
};

