import { apiClient } from './apiClient';

export interface UploadResponse {
  url: string;
  key: string;
  size: number;
  content_type: string;
  filename: string;
}

export const uploadService = {
  async uploadFile(file: File, folder?: string): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) {
      formData.append('folder', folder);
    }

    const res = await apiClient.post<UploadResponse>(
      `/uploads${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return res.data;
  },
};
