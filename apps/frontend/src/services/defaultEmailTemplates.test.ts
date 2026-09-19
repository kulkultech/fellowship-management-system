import { describe, it, expect } from 'vitest';
import {
  EMAIL_TEMPLATE_TYPES,
  getDefaultProgramEmailTemplates,
} from './defaultEmailTemplates';

describe('defaultEmailTemplates', () => {
  it('defines metadata for all 6 candidate email triggers', () => {
    expect(EMAIL_TEMPLATE_TYPES).toHaveLength(6);
    const keys = EMAIL_TEMPLATE_TYPES.map((t) => t.key);
    expect(keys).toContain('application_received');
    expect(keys).toContain('test_result_passed');
    expect(keys).toContain('test_result_failed');
    expect(keys).toContain('ai_interview_invitation');
    expect(keys).toContain('final_interview');
    expect(keys).toContain('rejection');
  });

  it('generates non-empty default configurations for all 6 email triggers', () => {
    const templates = getDefaultProgramEmailTemplates('AI Accelerator 2026');

    expect(templates.application_received?.enabled).toBe(true);
    expect(templates.application_received?.subject).toContain('{{program_name}}');
    expect(templates.application_received?.headline).toBeTruthy();
    expect(templates.application_received?.body).toContain('{{candidate_name}}');
    expect(templates.application_received?.button_text).toBeTruthy();

    expect(templates.test_result_passed?.enabled).toBe(true);
    expect(templates.test_result_failed?.enabled).toBe(true);
    expect(templates.ai_interview_invitation?.enabled).toBe(true);
    expect(templates.final_interview?.enabled).toBe(true);
    expect(templates.rejection?.enabled).toBe(true);
  });
});
