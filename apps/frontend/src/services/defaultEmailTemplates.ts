import type { ProgramEmailTemplates } from './types';

export interface EmailTemplateMeta {
  key: keyof ProgramEmailTemplates;
  label: string;
  stageTag: string;
  description: string;
  defaultActionUrl: string;
  supportedVariables: { variable: string; label: string; example: string }[];
}

export const EMAIL_TEMPLATE_TYPES: EmailTemplateMeta[] = [
  {
    key: 'application_received',
    label: 'Application Received',
    stageTag: 'Stage 1 • Submission',
    description: 'Sent immediately when candidate completes registration and needs their logic test link.',
    defaultActionUrl: 'https://fellowhire.kul.to/test/sample-token',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{test_link}}', label: 'Test Link', example: 'https://fellowhire.kul.to/test/xyz' },
      { variable: '{{duration_minutes}}', label: 'Duration (mins)', example: '45' },
      { variable: '{{passing_score}}', label: 'Passing Benchmark (%)', example: '70' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
  {
    key: 'test_result_passed',
    label: 'Logic Test Passed',
    stageTag: 'Stage 2 • Test Passed',
    description: 'Sent after candidate submits logic test and achieves score above passing benchmark.',
    defaultActionUrl: 'https://fellowhire.kul.to/interview/sample-token',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{score}}', label: 'Candidate Score (%)', example: '85' },
      { variable: '{{passing_score}}', label: 'Passing Benchmark (%)', example: '70' },
      { variable: '{{next_step}}', label: 'Next Step Name', example: 'AI Video Interview' },
      { variable: '{{action_url}}', label: 'Next Step Link', example: 'https://fellowhire.kul.to/interview/xyz' },
      { variable: '{{result_url}}', label: 'Scorecard Link', example: 'https://fellowhire.kul.to/result/xyz' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
  {
    key: 'test_result_failed',
    label: 'Logic Test Failed',
    stageTag: 'Stage 2 • Below Benchmark',
    description: 'Sent after candidate submits logic test but scores below the cohort benchmark.',
    defaultActionUrl: 'https://fellowhire.kul.to/result/sample-token',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{score}}', label: 'Candidate Score (%)', example: '55' },
      { variable: '{{passing_score}}', label: 'Passing Benchmark (%)', example: '70' },
      { variable: '{{result_url}}', label: 'Scorecard Link', example: 'https://fellowhire.kul.to/result/xyz' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
  {
    key: 'ai_interview_invitation',
    label: 'AI Video Interview',
    stageTag: 'Stage 3 • AI Screening',
    description: 'Sent when candidate advances to the automated AI video interview screening stage.',
    defaultActionUrl: 'https://fellowhire.kul.to/interview/sample-token',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{interview_link}}', label: 'Interview Room Link', example: 'https://fellowhire.kul.to/interview/xyz' },
      { variable: '{{expires_at}}', label: 'Expiration Deadline', example: 'Monday, Oct 5 at 18:00' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
  {
    key: 'final_interview',
    label: 'Next Stage',
    stageTag: 'Stage 4 • Next Step',
    description: 'Sent when candidate advances to the next stage after assessment (e.g. live interview, offer, or next round).',
    defaultActionUrl: 'https://fellowhire.kul.to/candidate/dashboard',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{dashboard_url}}', label: 'Candidate Dashboard', example: 'https://fellowhire.kul.to/candidate/dashboard' },
      { variable: '{{notes}}', label: 'Admissions Feedback / Notes', example: 'Selected to advance to the next round.' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
  {
    key: 'rejection',
    label: 'Application Rejection',
    stageTag: 'Application Update • Rejected',
    description: 'Sent when candidate is not selected for this cohort.',
    defaultActionUrl: 'https://fellowhire.kul.to/programs',
    supportedVariables: [
      { variable: '{{candidate_name}}', label: 'Candidate Name', example: 'Jane Doe' },
      { variable: '{{program_name}}', label: 'Program Name', example: 'Tech Fellowship 2026' },
      { variable: '{{track_name}}', label: 'Track Name', example: 'Full Stack Engineering' },
      { variable: '{{notes}}', label: 'Feedback Notes', example: 'High volume of applicants this cohort.' },
      { variable: '{{support_email}}', label: 'Support Email', example: 'support@fellowhire.kul.to' },
    ],
  },
];

export function getDefaultProgramEmailTemplates(_programName: string = 'Fellowship Program'): ProgramEmailTemplates {
  return {
    application_received: {
      enabled: true,
      subject: `Application Received: {{program_name}} - Technical Assessment Link`,
      headline: `Your Application has been Received!`,
      body: `Dear {{candidate_name}},\n\nThank you for applying to {{program_name}} ({{track_name}}). We are thrilled to consider your candidacy for this cohort.\n\nYour application has progressed to the Logic & Technical Assessment stage. Please complete the assessment before the deadline.\n\nAssessment details:\n• Duration: {{duration_minutes}} Minutes\n• Format: Multiple Choice Questions\n• Passing Benchmark: {{passing_score}}%\n\nGood luck!`,
      button_text: `Begin Assessment Now`,
    },
    test_result_passed: {
      enabled: true,
      subject: `Congratulations! Assessment Results: {{program_name}} (Passed)`,
      headline: `Congratulations! You Passed the Technical Assessment`,
      body: `Dear {{candidate_name}},\n\nWe are pleased to inform you that you achieved a score of {{score}}% (Benchmark: {{passing_score}}%) on the {{program_name}} technical assessment!\n\nYour performance stood out to our evaluation committee. You have qualified to proceed to the next stage of our selection process ({{next_step}}).\n\nPlease click the button below to proceed.`,
      button_text: `Proceed to Next Stage`,
    },
    test_result_failed: {
      enabled: true,
      subject: `Assessment Results: {{program_name}} Update`,
      headline: `Assessment Result Update`,
      body: `Dear {{candidate_name}},\n\nThank you for participating in the technical assessment for {{program_name}} ({{track_name}}).\n\nYour assessment score is {{score}}% (Passing benchmark: {{passing_score}}%). While your score did not meet the threshold for this cohort, we genuinely appreciate the effort you put into the assessment.\n\nWe encourage you to review your topic breakdown on your scorecard and apply for future cohorts.`,
      button_text: `Inspect Assessment Scorecard`,
    },
    ai_interview_invitation: {
      enabled: true,
      subject: `Official Invitation: AI Technical Screening - {{program_name}}`,
      headline: `You're Invited to the AI Video Interview`,
      body: `Dear {{candidate_name}},\n\nYou have officially qualified for the next stage: the AI Technical Video Screening for {{program_name}} ({{track_name}}).\n\nPlease ensure you have a quiet environment, a functional webcam and microphone, and complete your interview before the access deadline: {{expires_at}}.\n\nWe look forward to hearing your insights!`,
      button_text: `Enter AI Video Interview Room`,
    },
    final_interview: {
      enabled: true,
      subject: `Congratulations! Next Stage Invitation: {{program_name}}`,
      headline: `You're Moving to the Next Stage!`,
      body: `Dear {{candidate_name}},\n\nCongratulations! Based on your performance across the evaluation stages, you have been selected to advance to the next stage for {{program_name}}.\n\nPlease visit your candidate dashboard to review details, schedule instructions, and next steps.`,
      button_text: `Open Candidate Dashboard`,
    },
    rejection: {
      enabled: true,
      subject: `Application Update: {{program_name}}`,
      headline: `Application Status Update`,
      body: `Dear {{candidate_name}},\n\nThank you for your application to {{program_name}} ({{track_name}}) and for your time throughout our selection process.\n\nAfter thorough review, we regret to inform you that we are unable to offer you admission into this fellowship cohort due to high competition and limited capacity.\n\nWe wish you all the best in your career and academic journey.`,
      button_text: `View Application Status`,
    },
  };
}
