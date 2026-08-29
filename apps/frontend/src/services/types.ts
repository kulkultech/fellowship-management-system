export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo_url?: string;
}

export interface Program {
  id: string;
  slug: string;
  name: string;
  description: string;
  image_url?: string;
  open_date: string;
  end_date: string;
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
  is_open: boolean;
}

export interface ProgramPublicInfo {
  organization: Organization;
  program: Program;
}

export interface ApplyRequest {
  full_name: string;
  email: string;
  phone?: string;
  github_url?: string;
  linkedin_url?: string;
  resume_url?: string;
  notes?: string;
}

export interface ApplyResponse {
  applicant_id: string;
  stage: string;
  test_token: string;
  message: string;
}

export interface MCQOption {
  id: string;
  text: string;
}

export interface ClientQuestion {
  id: string;
  category: string;
  question_text: string;
  options: MCQOption[];
  points: number;
}

export interface TestSession {
  submission_id: string;
  program_name: string;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  remaining_seconds: number;
  status: 'in_progress' | 'completed' | 'expired';
  questions: ClientQuestion[];
  already_done?: boolean;
}

export interface AnswerInput {
  question_id: string;
  selected_option_id: string;
}

export interface SubmitTestResponse {
  total_score: number;
  passing_score: number;
  passed: boolean;
  status: string;
  ai_interview_invite_token?: string;
  ai_interview_expires_at?: string;
}

export interface TestResultResponse {
  submission_id: string;
  applicant_name: string;
  program_name: string;
  total_score: number;
  passing_score: number;
  passed: boolean;
  time_spent_seconds: number;
  status: string;
  ai_interview_invite_token?: string;
  ai_interview_expires_at?: string;
}

export interface ChatMessage {
  role: 'ai' | 'candidate' | 'system';
  message: string;
  timestamp: string;
}

export interface EvaluationSummary {
  technical_acumen: number;
  communication: number;
  problem_solving: number;
  overall_score: number;
  key_strengths: string[];
  areas_for_growth: string[];
  recommendation: string;
  executive_summary: string;
}

export interface AIInterviewSession {
  interview_id: string;
  applicant_name: string;
  program_name: string;
  status: 'invited' | 'in_progress' | 'completed' | 'expired';
  invitation_expires_at: string;
  transcript: ChatMessage[];
  summary_evaluation?: EvaluationSummary;
  scorecard_score: number;
}

export interface User {
  id: string;
  organization_id?: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  csrf_token: string;
}

export interface ApplicantListItem {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  github_url: string;
  linkedin_url: string;
  resume_url: string;
  current_stage: string;
  mcq_score?: number;
  mcq_passed?: boolean;
  time_spent_seconds?: number;
  ai_score?: number;
  ai_recommendation?: string;
  created_at: string;
}

export interface ItemizedQuestionAnswer {
  question_id: string;
  category: string;
  question_text: string;
  options: MCQOption[];
  selected_option_id: string;
  correct_option_id: string;
  is_correct: boolean;
  explanation: string;
  points: number;
}

export interface ApplicantDetailResponse {
  applicant: {
    id: string;
    organization_id: string;
    program_id: string;
    email: string;
    full_name: string;
    phone?: string;
    github_url?: string;
    linkedin_url?: string;
    resume_url?: string;
    current_stage: string;
    notes?: string;
    created_at: string;
  };
  submission?: {
    id: string;
    total_score: number;
    passed: boolean;
    time_spent_seconds: number;
    status: string;
    started_at: string;
    submitted_at: string;
  };
  itemized_answers?: ItemizedQuestionAnswer[];
  ai_interview?: AIInterviewSession;
}
