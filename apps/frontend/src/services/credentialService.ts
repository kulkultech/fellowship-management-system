import { apiClient } from './apiClient';
import type {
  CandidateCredentialsResponse,
  Certificate,
  Badge,
  GenerateCertificatePayload,
  PublicCertificateVerification,
  PublicBadgeVerification,
} from './types';

export const credentialService = {
  /**
   * Fetch credentials and badges for current candidate
   */
  async getMyCredentials(): Promise<CandidateCredentialsResponse> {
    const res = await apiClient.get<CandidateCredentialsResponse>('/candidate/my-credentials');
    return res.data;
  },

  /**
   * Fetch credentials and badges for a specific applicant (admin view)
   */
  async getApplicantCredentials(applicantId: string): Promise<CandidateCredentialsResponse> {
    const res = await apiClient.get<CandidateCredentialsResponse>(`/applicants/${applicantId}/credentials`);
    return res.data;
  },

  /**
   * Generate an official certificate for an applicant (and award graduate badge)
   */
  async generateCertificate(
    applicantId: string,
    payload: GenerateCertificatePayload = { send_email: true }
  ): Promise<{ success: boolean; certificate: Certificate; badge?: Badge }> {
    const res = await apiClient.post<{ success: boolean; certificate: Certificate; badge?: Badge }>(
      `/applicants/${applicantId}/certificate`,
      payload
    );
    return res.data;
  },

  /**
   * Send or re-send certificate email to the candidate
   */
  async sendCertificateEmail(certificateId: string): Promise<{ success: boolean; message: string; email_sent_at: string }> {
    const res = await apiClient.post<{ success: boolean; message: string; email_sent_at: string }>(
      `/certificates/${certificateId}/send-email`
    );
    return res.data;
  },

  /**
   * Verify an official certificate by its unique certificate number (public endpoint)
   */
  async verifyCertificatePublic(certificateNumber: string): Promise<PublicCertificateVerification> {
    const res = await apiClient.get<PublicCertificateVerification>(
      `/certificates/verify/${encodeURIComponent(certificateNumber)}`
    );
    return res.data;
  },

  /**
   * Verify an Open Badge by its badge ID (public endpoint)
   */
  async verifyBadgePublic(badgeId: string): Promise<PublicBadgeVerification> {
    const res = await apiClient.get<PublicBadgeVerification>(
      `/badges/verify/${encodeURIComponent(badgeId)}`
    );
    return res.data;
  },

  /**
   * List all issued certificates for a program (admin view)
   */
  async listProgramCertificates(programId: string): Promise<Certificate[]> {
    const res = await apiClient.get<Certificate[]>(`/programs/${programId}/certificates`);
    return res.data;
  },
};
