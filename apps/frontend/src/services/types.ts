export interface Organization {
  id: string;
  slug: string;
  name: string;
  contact_email?: string;
  logo_url?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface Track {
  id: string;
  program_id?: string;
  question_set_id?: string;
  question_set_name?: string;
  slug: string;
  name: string;
  description?: string;
  enable_mcq: boolean;
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
  enable_ai_interview: boolean;
  ai_interview_instructions?: string;
  ai_interview_questions?: string[];
  ai_interview_rubric?: AIInterviewRubric;
  question_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionSet {
  id: string;
  organization_id?: string;
  program_id?: string;
  name: string;
  description?: string;
  category: string;
  duration_minutes: number;
  passing_score: number;
  questions: MCQQuestion[];
  total_questions?: number;
  tracks_count?: number;
  assigned_tracks?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateQuestionSetPayload {
  program_id?: string;
  name: string;
  description?: string;
  category?: string;
  duration_minutes?: number;
  passing_score?: number;
  questions?: MCQQuestion[];
}

export interface UpdateQuestionSetPayload {
  name: string;
  description?: string;
  category?: string;
  duration_minutes?: number;
  passing_score?: number;
  questions?: MCQQuestion[];
}

export interface ApplicationStageItem {
  step_number: number;
  title: string;
  description: string;
}

export interface Program {
  id: string;
  organization_id?: string;
  slug: string;
  name: string;
  description: string;
  image_url?: string;
  open_date: string;
  end_date: string;
  enable_mcq: boolean;
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
  enable_ai_interview: boolean;
  ai_interview_instructions?: string;
  ai_interview_questions?: string[];
  ai_interview_rubric?: AIInterviewRubric;
  application_stages?: ApplicationStageItem[];
  status?: string;
  is_open?: boolean;
  tracks?: Track[];
}

export interface ProgramPublicInfo {
  organization: Organization;
  program: Program;
}

export interface TrackDetailPublicResponse {
  organization: Organization;
  program: {
    id: string;
    slug: string;
    name: string;
    description: string;
    image_url?: string;
    open_date: string;
    end_date: string;
    is_open: boolean;
  };
  track: Track;
}

export interface ApplyRequest {
  track_slug?: string;
  track_id?: string;
  chosen_course?: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  date_of_birth: string;
  phone: string;
  email: string;
  linkedin_url?: string;
  university: string;
  major: string;
  semester: string;
  referral_source: string;
  github_url?: string;
  resume_url?: string;
  notes?: string;
}

export interface ApplyResponse {
  applicant_id: string;
  stage: string;
  test_token?: string;
  ai_interview_invite_token?: string;
  message: string;
}

export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQQuestion {
  id?: string;
  program_id?: string;
  track_id?: string;
  category: string;
  question_text: string;
  options: MCQOption[];
  correct_option_id: string;
  explanation?: string;
  points: number;
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
  track_name?: string;
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
  track_name?: string;
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

export interface RubricCriterion {
  id: string;
  criterion: string;
  points: number;
}

export interface AIInterviewQuestionItem {
  id: number;
  theme: string;
  question: string;
  max_points: number;
  preparation_time_seconds?: number;
  response_time_seconds?: number;
  criteria: RubricCriterion[];
}

export interface AIInterviewRubric {
  name?: string;
  instructions?: string;
  total_points?: number;
  preparation_time_seconds: number;
  response_time_seconds: number;
  allow_rerecord: boolean;
  scoring_guideline: string;
  questions: AIInterviewQuestionItem[];
}

export interface CriterionScore {
  criterion_id?: string;
  criterion: string;
  score: number;
  max_points?: number;
  max_score?: number;
  feedback?: string;
  comment?: string;
}

export interface QuestionEvaluation {
  question_id: number;
  theme: string;
  score: number;
  max_points?: number;
  max_score?: number;
  feedback?: string;
  criteria?: CriterionScore[];
  criteria_scores?: CriterionScore[];
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
  question_evaluations?: QuestionEvaluation[];
}

export interface AIInterviewSession {
  interview_id: string;
  applicant_name: string;
  program_name: string;
  track_name?: string;
  status: 'invited' | 'in_progress' | 'completed' | 'expired';
  invitation_expires_at: string;
  transcript: ChatMessage[];
  summary_evaluation?: EvaluationSummary;
  scorecard_score: number;
  recording_url?: string;
  recording_status?: string;
  rubric?: AIInterviewRubric;
}

export interface User {
  id: string;
  organization_id?: string;
  organization?: Organization;
  email: string;
  name: string;
  role: 'superadmin' | 'org_admin' | 'reviewer';
}

export interface AuthResponse {
  user: User;
  csrf_token: string;
}

export interface CompanyRegistrationPayload {
  company_name: string;
  company_slug: string;
  contact_email: string;
  logo_url?: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

export interface PipelineConfigPayload {
  enable_mcq: boolean;
  logic_test_duration_minutes: number;
  logic_test_passing_score: number;
  allow_retake: boolean;
  enable_ai_interview: boolean;
  ai_interview_instructions?: string;
  ai_interview_questions?: string[];
}

export interface ApplicantListItem {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  email: string;
  phone: string;
  github_url?: string;
  linkedin_url?: string;
  resume_url?: string;
  university?: string;
  major?: string;
  semester?: string;
  referral_source?: string;
  track_id?: string;
  track_name?: string;
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
  points_awarded: number;
}

export interface ApplicantDetailResponse {
  applicant: {
    id: string;
    organization_id?: string;
    program_id?: string;
    email: string;
    full_name: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    phone?: string;
    github_url?: string;
    linkedin_url?: string;
    resume_url?: string;
    university?: string;
    major?: string;
    semester?: string;
    referral_source?: string;
    current_stage: string;
    notes?: string;
    created_at: string;
  };
  track?: {
    id: string;
    slug: string;
    name: string;
    description?: string;
  };
  submission?: {
    id: string;
    total_score: number;
    passed: boolean;
    time_spent_seconds: number;
    status: string;
    started_at: string;
    submitted_at: string;
    answers: ItemizedQuestionAnswer[];
  };
  ai_screen?: AIInterviewSession;
}

export interface CandidateApplicationItem {
  applicant_id: string;
  email: string;
  full_name: string;
  current_stage: string;
  program_id: string;
  program_slug: string;
  program_name: string;
  track_id?: string;
  track_slug?: string;
  track_name?: string;
  organization_id: string;
  org_slug: string;
  org_name: string;
  org_logo_url?: string;
  test_token?: string;
  test_score: number;
  test_passed: boolean;
  test_status?: string;
  time_spent_seconds: number;
  interview_token?: string;
  interview_status?: string;
  interview_score: number;
  created_at: string;
}
