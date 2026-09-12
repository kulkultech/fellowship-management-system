import type { ApplicationFormSchema, CustomFormField, StandardFieldConfig } from './types';

export const STANDARD_FIELD_KEYS = [
  'phone',
  'date_of_birth',
  'university',
  'major',
  'semester',
  'referral_source',
  'linkedin_url',
  'github_url',
  'profile_picture',
  'resume',
] as const;

export type StandardFieldKey = typeof STANDARD_FIELD_KEYS[number];

export const STANDARD_FIELD_METADATA: Record<
  StandardFieldKey,
  { label: string; description: string; hasOptions?: boolean }
> = {
  phone: { label: 'Phone / WhatsApp', description: 'Candidate contact number for notifications and reminders' },
  date_of_birth: { label: 'Date of Birth', description: 'Birth date for eligibility checks' },
  university: { label: 'University / Campus', description: 'Higher education institution name' },
  major: { label: 'Major / Study Field', description: 'Academic discipline / IT degree', hasOptions: true },
  semester: { label: 'Current Semester / Graduation Status', description: 'Academic progress level', hasOptions: true },
  referral_source: { label: 'Referral Source', description: 'How candidate heard about this program', hasOptions: true },
  linkedin_url: { label: 'LinkedIn Profile URL', description: 'Professional social profile link' },
  github_url: { label: 'GitHub Profile URL', description: 'Developer code portfolio link' },
  profile_picture: { label: 'Profile Photo', description: 'Candidate headshot photo' },
  resume: { label: 'Resume / CV (PDF)', description: 'Candidate uploaded curriculum vitae' },
};

export const DEFAULT_RSA_SCHEMA: ApplicationFormSchema = {
  title: 'Candidate Fellowship Application',
  description: 'Complete your intake profile to unlock the timed logic test and interactive AI screening room.',
  submit_button_text: 'Submit Application & Begin Evaluation',
  fields: {
    phone: { enabled: true, required: true },
    date_of_birth: { enabled: true, required: true },
    university: { enabled: true, required: true },
    major: {
      enabled: true,
      required: true,
      options: [
        'Computer Science / Informatics (Ilmu Komputer / Teknik Informatika)',
        'Information Systems (Sistem Informasi)',
        'Software Engineering (Rekayasa Perangkat Lunak)',
        'Computer Engineering (Teknik Komputer / Sistem Komputer)',
        'Information Technology (Teknologi Informasi)',
        'Data Science / Artificial Intelligence (Sains Data / Kecerdasan Buatan)',
        'Cyber Security (Keamanan Siber)',
        'Mathematics / Statistics',
        'Other Engineering / STEM',
      ],
    },
    semester: {
      enabled: true,
      required: true,
      options: [
        'Semester 1 - 2',
        'Semester 3 - 4',
        'Semester 5 - 6',
        'Semester 7 - 8',
        'Fresh Graduate (< 1 year)',
      ],
    },
    referral_source: {
      enabled: true,
      required: true,
      options: [
        'Instagram',
        'LinkedIn',
        'Campus Career Center / BEM',
        'Friend / Alumni Referral',
        'Telegram / Discord Tech Community',
        'Other',
      ],
    },
    resume: { enabled: true, required: true },
    profile_picture: { enabled: true, required: false },
    linkedin_url: { enabled: true, required: false },
    github_url: { enabled: false, required: false },
  },
  custom_fields: [],
  field_order: [
    'phone',
    'date_of_birth',
    'university',
    'major',
    'semester',
    'referral_source',
    'linkedin_url',
    'github_url',
    'profile_picture',
    'resume',
  ],
};

export const DEFAULT_COMPANY_SCHEMA: ApplicationFormSchema = {
  title: 'Candidate Application',
  description: 'Please provide your contact information and supporting documents.',
  submit_button_text: 'Submit Application',
  fields: {
    phone: { enabled: true, required: true },
    date_of_birth: { enabled: false, required: false },
    university: { enabled: false, required: false },
    major: { enabled: false, required: false },
    semester: { enabled: false, required: false },
    referral_source: { enabled: false, required: false },
    resume: { enabled: true, required: true },
    profile_picture: { enabled: false, required: false },
    linkedin_url: { enabled: true, required: false },
    github_url: { enabled: true, required: false },
  },
  custom_fields: [
    {
      id: 'years_experience',
      label: 'Years of relevant experience',
      type: 'select',
      placeholder: 'Select experience level',
      required: false,
      options: [
        'Student / No commercial experience',
        'Less than 1 year',
        '1 - 2 years',
        '3 - 5 years',
        '5+ years',
      ],
    },
    {
      id: 'portfolio_url',
      label: 'Portfolio / GitHub / Personal Website URL',
      type: 'url',
      placeholder: 'https://',
      required: false,
    },
    {
      id: 'why_hire',
      label: 'Why are you interested in this role and company?',
      type: 'textarea',
      placeholder: 'Briefly tell us what excites you about this opportunity...',
      required: false,
    },
  ],
  field_order: [
    'phone',
    'linkedin_url',
    'github_url',
    'years_experience',
    'portfolio_url',
    'why_hire',
    'resume',
  ],
};

/**
 * Resolves the active list of fields in their user-configured or fallback order.
 * Only includes standard fields that are enabled and custom fields that exist.
 */
export const getResolvedFieldOrder = (
  fields: Record<string, StandardFieldConfig> | undefined,
  customFields: CustomFormField[] | undefined,
  savedOrder?: string[]
): string[] => {
  const safeFields = fields || {};
  const safeCustomFields = customFields || [];
  const customIds = new Set(safeCustomFields.map((cf) => cf.id));
  const isEnabledStandard = (key: string) => Boolean(safeFields[key]?.enabled !== false && safeFields[key]?.enabled);

  const order: string[] = [];
  const seen = new Set<string>();

  // 1. Process savedOrder if available
  if (Array.isArray(savedOrder) && savedOrder.length > 0) {
    for (const key of savedOrder) {
      if (!seen.has(key)) {
        if (isEnabledStandard(key) || customIds.has(key)) {
          order.push(key);
          seen.add(key);
        }
      }
    }
  }

  // 2. Append any enabled standard fields not in savedOrder
  for (const key of STANDARD_FIELD_KEYS) {
    if (isEnabledStandard(key) && !seen.has(key)) {
      order.push(key);
      seen.add(key);
    }
  }

  // 3. Append any custom fields not in savedOrder
  for (const cf of safeCustomFields) {
    if (!seen.has(cf.id)) {
      order.push(cf.id);
      seen.add(cf.id);
    }
  }

  return order;
};
