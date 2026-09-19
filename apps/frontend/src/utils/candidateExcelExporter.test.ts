import { describe, it, expect } from 'vitest';
import { exportCandidatesToExcel } from './candidateExcelExporter';
import type { Program, ApplicantListItem } from '@/services/types';

describe('candidateExcelExporter', () => {
  const mockProgram: Program = {
    id: 'prog-123',
    slug: 'ai-fellowship-2026',
    name: 'AI Fellowship 2026',
    description: 'Premier AI program',
    organization_id: 'org-1',
    open_date: '2026-01-01',
    end_date: '2026-12-31',
    enable_mcq: true,
    logic_test_duration_minutes: 30,
    logic_test_passing_score: 75,
    allow_retake: false,
    enable_ai_interview: true,
    application_form_schema: {
      fields: {},
      custom_fields: [
        { id: 'portfolio_url', label: 'Portfolio Website', type: 'url', required: false },
        { id: 'why_join', label: 'Why do you want to join?', type: 'textarea', required: true },
      ],
    },
  };

  const mockApplicants: ApplicantListItem[] = [
    {
      id: 'app-1',
      full_name: 'Budi Santoso',
      first_name: 'Budi',
      last_name: 'Santoso',
      email: 'budi@example.com',
      phone: '+6281234567890',
      university: 'Institut Teknologi Bandung',
      major: 'Informatics Engineering',
      semester: '7',
      referral_source: 'LinkedIn',
      linkedin_url: 'https://linkedin.com/in/budisantoso',
      github_url: 'https://github.com/budisantoso',
      resume_url: 'https://storage.example.com/resumes/budi.pdf',
      track_id: 'track-1',
      track_name: 'Machine Learning',
      current_stage: 'ai_interview_completed',
      created_at: '2026-02-01 10:00',
      custom_responses: {
        portfolio_url: 'https://budisantoso.dev',
        why_join: 'I love generative AI and distributed systems.',
      },
      // Logic MCQ
      mcq_score: 90,
      mcq_passed: true,
      time_spent_seconds: 750,
      mcq_status: 'completed',
      mcq_started_at: '2026-02-02 09:00',
      mcq_submitted_at: '2026-02-02 09:12',
      // AI Interview
      ai_score: 88,
      ai_recommendation: 'Strong communication readiness',
      ai_status: 'completed',
      ai_technical_acumen: 9,
      ai_communication: 8,
      ai_problem_solving: 9,
      ai_key_strengths: ['Clear reasoning', 'High technical clarity'],
      ai_areas_for_growth: ['Can speak with more brevity'],
      ai_executive_summary: 'Budi demonstrated deep understanding of ML architecture.',
      ai_completed_at: '2026-02-03 14:30',
      ai_recording_url: 'https://storage.example.com/recordings/budi.webm',
    },
    {
      id: 'app-2',
      full_name: 'Siti Rahma',
      email: 'siti@example.com',
      phone: '+628987654321',
      university: 'Universitas Indonesia',
      major: 'Computer Science',
      current_stage: 'registered',
      created_at: '2026-02-05 11:30',
    },
  ];

  it('generates an Excel workbook with Candidates Master List and Assessment Summary sheets', async () => {
    const workbook = await exportCandidatesToExcel({
      program: mockProgram,
      applicants: mockApplicants,
      programName: 'AI Fellowship 2026',
      scopeLabel: 'All Candidates (2)',
    });

    expect(workbook).toBeDefined();

    const masterSheet = workbook.getWorksheet('Candidates Master List');
    expect(masterSheet).toBeDefined();

    const summarySheet = workbook.getWorksheet('Assessment Summary');
    expect(summarySheet).toBeDefined();

    // Check title row
    const titleCell = masterSheet!.getCell('A1');
    expect(titleCell.value).toContain('AI Fellowship 2026 — Candidates Master List');

    // Header row is row 4
    const headerRow = masterSheet!.getRow(4);
    const headerValues = headerRow.values as string[];
    expect(headerValues).toContain('Candidate ID');
    expect(headerValues).toContain('Full Name');
    expect(headerValues).toContain('Email Address');
    expect(headerValues).toContain('Form: Portfolio Website');
    expect(headerValues).toContain('Form: Why do you want to join?');
    expect(headerValues).toContain('Logic MCQ Score (%)');
    expect(headerValues).toContain('AI Scorecard (0-100)');
    expect(headerValues).toContain('Tech Acumen (1-10)');

    // Row 5 is the first candidate (Budi)
    const budiRow = masterSheet!.getRow(5);
    const budiValues = budiRow.values as any[];
    expect(budiValues).toContain('Budi Santoso');
    expect(budiValues).toContain('budi@example.com');
    expect(budiValues).toContain(90); // mcq_score
    expect(budiValues).toContain(88); // ai_score
    expect(budiValues).toContain('Passed'); // mcq_passed

    // Check summary sheet
    const summaryHeaderRow = summarySheet!.getRow(4);
    const summaryHeaders = summaryHeaderRow.values as string[];
    expect(summaryHeaders).toContain('Candidate Name');
    expect(summaryHeaders).toContain('Logic Score (%)');
    expect(summaryHeaders).toContain('AI Score (0-100)');
    expect(summaryHeaders).toContain('AI Recommendation');

    const summaryBudiRow = summarySheet!.getRow(5);
    const summaryBudiValues = summaryBudiRow.values as any[];
    expect(summaryBudiValues).toContain('Budi Santoso');
    expect(summaryBudiValues).toContain('90%');
    expect(summaryBudiValues).toContain('88 / 100');
    expect(summaryBudiValues).toContain('Strong communication readiness');
  });

  it('handles empty applicants list without error', async () => {
    const workbook = await exportCandidatesToExcel({
      program: mockProgram,
      applicants: [],
    });

    expect(workbook).toBeDefined();
    const masterSheet = workbook.getWorksheet('Candidates Master List');
    expect(masterSheet).toBeDefined();
    expect(masterSheet!.rowCount).toBe(4); // 3 title rows + 1 header row
  });
});
