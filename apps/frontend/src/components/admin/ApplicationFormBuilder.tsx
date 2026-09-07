import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import type { Program, ApplicationFormSchema, CustomFormField, FormFieldType } from '@/services/types';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  Eye,
  Settings,
  Sliders,
  FileText,
  Upload,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  program: Program;
  onBack: () => void;
  onSaved?: (updated: Program) => void;
}

const DEFAULT_RSA_SCHEMA: ApplicationFormSchema = {
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
};

const DEFAULT_COMPANY_SCHEMA: ApplicationFormSchema = {
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
};

const STANDARD_FIELD_METADATA: Record<string, { label: string; description: string; hasOptions?: boolean }> = {
  phone: { label: 'Phone / WhatsApp', description: 'Candidate contact number for notifications and reminders' },
  date_of_birth: { label: 'Date of Birth', description: 'Birth date for eligibility checks' },
  university: { label: 'University / Campus', description: 'Higher education institution name' },
  major: { label: 'Major / Study Field', description: 'Academic discipline / IT degree', hasOptions: true },
  semester: { label: 'Current Semester / Graduation Status', description: 'Academic progress level', hasOptions: true },
  referral_source: { label: 'Referral Source', description: 'How candidate heard about this program', hasOptions: true },
  resume: { label: 'Resume / CV (PDF)', description: 'Candidate uploaded curriculum vitae' },
  profile_picture: { label: 'Profile Photo', description: 'Candidate headshot photo' },
  linkedin_url: { label: 'LinkedIn Profile URL', description: 'Professional social profile link' },
  github_url: { label: 'GitHub Profile URL', description: 'Developer code portfolio link' },
};

export const ApplicationFormBuilder: React.FC<Props> = ({ program, onBack, onSaved }) => {
  const queryClient = useQueryClient();

  const getInitialSchema = (): ApplicationFormSchema => {
    if (program.application_form_schema && program.application_form_schema.fields) {
      return JSON.parse(JSON.stringify(program.application_form_schema));
    }
    if (program.slug === 'lit2026') {
      return JSON.parse(JSON.stringify(DEFAULT_RSA_SCHEMA));
    }
    return JSON.parse(JSON.stringify(DEFAULT_COMPANY_SCHEMA));
  };

  const [schema, setSchema] = useState<ApplicationFormSchema>(getInitialSchema());
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [expandedOptionField, setExpandedOptionField] = useState<string | null>(null);

  useEffect(() => {
    setSchema(getInitialSchema());
  }, [program.id]);

  const saveMutation = useMutation({
    mutationFn: (updatedSchema: ApplicationFormSchema) =>
      adminService.updateProgramFormSchema(program.id, updatedSchema),
    onSuccess: (updatedProg) => {
      toast.success('Application form schema saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['program', program.slug] });
      if (onSaved) onSaved(updatedProg);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to save application form schema');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(schema);
  };

  const handleToggleStandardField = (key: string, enabled: boolean) => {
    setSchema((prev) => {
      const current = prev.fields[key] || { enabled: false, required: false };
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...current,
            enabled,
            // If disabling, also mark not required
            required: enabled ? current.required : false,
          },
        },
      };
    });
  };

  const handleToggleStandardRequired = (key: string, required: boolean) => {
    setSchema((prev) => {
      const current = prev.fields[key] || { enabled: true, required: false };
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...current,
            required,
          },
        },
      };
    });
  };

  const handleAddCustomField = () => {
    const newId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newField: CustomFormField = {
      id: newId,
      label: 'New Custom Question',
      type: 'text',
      placeholder: 'Enter response here...',
      required: false,
    };
    setSchema((prev) => ({
      ...prev,
      custom_fields: [...(prev.custom_fields || []), newField],
    }));
  };

  const handleUpdateCustomField = (index: number, updates: Partial<CustomFormField>) => {
    setSchema((prev) => {
      const copy = [...(prev.custom_fields || [])];
      copy[index] = { ...copy[index], ...updates };
      return { ...prev, custom_fields: copy };
    });
  };

  const handleDeleteCustomField = (index: number) => {
    setSchema((prev) => {
      const copy = [...(prev.custom_fields || [])];
      copy.splice(index, 1);
      return { ...prev, custom_fields: copy };
    });
  };

  const handleResetToDefault = () => {
    const defaultData = program.slug === 'lit2026' ? DEFAULT_RSA_SCHEMA : DEFAULT_COMPANY_SCHEMA;
    if (confirm('Reset form configuration to default template?')) {
      setSchema(JSON.parse(JSON.stringify(defaultData)));
      toast.success('Reset form to default template');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-full hover:bg-slate-100 text-slate-600 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-purple-100 text-kulkul-purple">
              {program.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-white text-kulkul-purple shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Form Editor</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white text-kulkul-purple shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </button>
          </div>

          <button
            onClick={handleResetToDefault}
            className="px-3.5 py-2 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition flex items-center gap-1.5"
            title="Reset to default format"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset to Default</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-5 py-2 rounded-full bg-kulkul-purple hover:bg-purple-700 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saveMutation.isPending ? 'Saving...' : 'Save Form'}</span>
          </button>
        </div>
      </div>

      {activeTab === 'editor' ? (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section: General Header & Copy */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Settings className="w-4 h-4 text-kulkul-purple" />
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Page Header & Copy
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                    Form Title
                  </label>
                  <input
                    type="text"
                    value={schema.title || ''}
                    onChange={(e) => setSchema({ ...schema, title: e.target.value })}
                    placeholder="Candidate Application"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                    Description / Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={schema.description || ''}
                    onChange={(e) => setSchema({ ...schema, description: e.target.value })}
                    placeholder="Explain what the applicant needs to submit..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                    Submit Button Text
                  </label>
                  <input
                    type="text"
                    value={schema.submit_button_text || ''}
                    onChange={(e) => setSchema({ ...schema, submit_button_text: e.target.value })}
                    placeholder="Submit Application"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                  />
                </div>
              </div>
            </div>

            {/* Section: Standard Fields */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-kulkul-purple" />
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Standard Intake Fields
                  </h2>
                </div>
                <span className="text-2xs text-slate-400 font-medium">
                  Toggle on/off and designate required fields
                </span>
              </div>

              {/* Informational Identity Banner */}
              <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs text-purple-950 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Identity & Authentication Fields</span>
                  <p className="text-3xs text-purple-800 mt-0.5 leading-relaxed">
                    <strong>First Name</strong>, <strong>Last Name</strong>, and <strong>Email</strong> are always enabled and required as core profile credentials (pre-filled automatically via Google OAuth).
                  </p>
                </div>
              </div>

              {/* Standard Fields Table */}
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                {Object.entries(STANDARD_FIELD_METADATA).map(([key, meta]) => {
                  const cfg = schema.fields?.[key] || { enabled: false, required: false };
                  const isExpanded = expandedOptionField === key;

                  return (
                    <div key={key} className="p-4 bg-white hover:bg-slate-50/50 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                            {cfg.enabled && cfg.required && (
                              <span className="text-rose-500 font-bold text-sm leading-none" title="Required">*</span>
                            )}
                          </div>
                          <p className="text-3xs text-slate-400 mt-0.5">{meta.description}</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {meta.hasOptions && cfg.enabled && (
                            <button
                              type="button"
                              onClick={() => setExpandedOptionField(isExpanded ? null : key)}
                              className="text-3xs font-bold text-kulkul-purple hover:underline"
                            >
                              {isExpanded ? 'Hide Options' : `Options (${cfg.options?.length || 0})`}
                            </button>
                          )}

                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={cfg.enabled}
                              onChange={(e) => handleToggleStandardField(key, e.target.checked)}
                              className="w-4 h-4 text-kulkul-purple rounded border-slate-300 focus:ring-kulkul-purple"
                            />
                            <span>Enabled</span>
                          </label>

                          <label
                            className={`flex items-center gap-1.5 text-xs font-semibold ${
                              cfg.enabled ? 'cursor-pointer text-slate-700' : 'cursor-not-allowed opacity-40 text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={!cfg.enabled}
                              checked={cfg.required}
                              onChange={(e) => handleToggleStandardRequired(key, e.target.checked)}
                              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                            />
                            <span>Required</span>
                          </label>
                        </div>
                      </div>

                      {/* Collapsible Options Editor for Select Dropdowns */}
                      {meta.hasOptions && isExpanded && cfg.enabled && (
                        <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                          <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                            Dropdown Options for {meta.label}
                          </span>
                          <div className="space-y-1.5">
                            {(cfg.options || []).map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const nextOpts = [...(cfg.options || [])];
                                    nextOpts[optIdx] = e.target.value;
                                    setSchema((prev) => ({
                                      ...prev,
                                      fields: {
                                        ...prev.fields,
                                        [key]: { ...prev.fields[key], options: nextOpts },
                                      },
                                    }));
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOpts = (cfg.options || []).filter((_, idx) => idx !== optIdx);
                                    setSchema((prev) => ({
                                      ...prev,
                                      fields: {
                                        ...prev.fields,
                                        [key]: { ...prev.fields[key], options: nextOpts },
                                      },
                                    }));
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const nextOpts = [...(cfg.options || []), 'New Option'];
                                setSchema((prev) => ({
                                  ...prev,
                                  fields: {
                                    ...prev.fields,
                                    [key]: { ...prev.fields[key], options: nextOpts },
                                  },
                                }));
                              }}
                              className="mt-1 px-3 py-1 rounded-lg bg-white border border-slate-200 text-3xs font-bold text-kulkul-purple hover:bg-purple-50 transition flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Option</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section: Custom Questionnaire Builder */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-kulkul-orange" />
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Custom Questions & Prompts
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-kulkul-purple border border-purple-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
                  <span>Add Custom Question</span>
                </button>
              </div>

              {(!schema.custom_fields || schema.custom_fields.length === 0) ? (
                <div className="text-center py-8 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No custom questions added yet</p>
                  <p className="text-3xs text-slate-400 mt-0.5 max-w-sm mx-auto">
                    Add role-specific questions such as portfolio links, years of experience, work availability, or open-ended essays.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="mt-3 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-kulkul-purple hover:bg-purple-50 transition inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Question</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {schema.custom_fields.map((field, idx) => (
                    <div
                      key={field.id || idx}
                      className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-4 transition hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs font-extrabold uppercase text-kulkul-purple bg-purple-100/70 px-2 py-0.5 rounded-md">
                            Question #{idx + 1}
                          </span>
                          {field.required && (
                            <span className="text-rose-500 font-bold text-sm leading-none" title="Required">*</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => handleUpdateCustomField(idx, { required: e.target.checked })}
                              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                            />
                            <span>Required Field</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleDeleteCustomField(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Delete question"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Question Label / Title
                          </label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateCustomField(idx, { label: e.target.value })}
                            placeholder="e.g., Portfolio link, Years of experience..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Answer Type
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) =>
                              handleUpdateCustomField(idx, {
                                type: e.target.value as FormFieldType,
                                options:
                                  e.target.value === 'select' || e.target.value === 'radio'
                                    ? field.options && field.options.length > 0
                                      ? field.options
                                      : ['Option 1', 'Option 2']
                                    : undefined,
                              })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                          >
                            <option value="text">Short Text</option>
                            <option value="textarea">Paragraph / Essay</option>
                            <option value="select">Dropdown Select</option>
                            <option value="radio">Radio Buttons</option>
                            <option value="url">Website / URL</option>
                            <option value="number">Number</option>
                            <option value="file">File Upload</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Placeholder Text (Optional)
                          </label>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) => handleUpdateCustomField(idx, { placeholder: e.target.value })}
                            placeholder="e.g. https://github.com/..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Field ID Key
                          </label>
                          <input
                            type="text"
                            value={field.id}
                            onChange={(e) =>
                              handleUpdateCustomField(idx, {
                                id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                              })
                            }
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-600"
                          />
                        </div>
                      </div>

                      {/* If select or radio: Manage choices */}
                      {(field.type === 'select' || field.type === 'radio') && (
                        <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                          <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                            Choice Options
                          </span>
                          <div className="space-y-1.5">
                            {(field.options || []).map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const nextOpts = [...(field.options || [])];
                                    nextOpts[optIdx] = e.target.value;
                                    handleUpdateCustomField(idx, { options: nextOpts });
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOpts = (field.options || []).filter((_, i) => i !== optIdx);
                                    handleUpdateCustomField(idx, { options: nextOpts });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const nextOpts = [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`];
                                handleUpdateCustomField(idx, { options: nextOpts });
                              }}
                              className="mt-1 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-3xs font-bold text-kulkul-purple hover:bg-purple-50 transition flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Choice</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      ) : (
        /* Live Preview Tab */
        <div className="bg-slate-50 p-6 md:p-10 rounded-3xl border border-slate-200/80">
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 shadow-sm border border-slate-200/70 space-y-6">
            <div className="border-b border-slate-100 pb-5">
              <span className="text-2xs font-extrabold uppercase text-kulkul-purple bg-purple-100/70 px-2.5 py-0.5 rounded-full">
                Candidate View Preview
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-2">{schema.title || 'Candidate Application'}</h2>
              <p className="text-xs text-slate-500 mt-1">{schema.description}</p>
            </div>

            {/* Standard Profile Fields */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Jane"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Doe"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  disabled
                  value="jane.doe@example.com"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                />
              </div>

              {schema.fields?.phone?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Phone / WhatsApp {schema.fields.phone.required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="+62 812 3456 7890"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              )}

              {schema.fields?.date_of_birth?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Date of Birth {schema.fields.date_of_birth.required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="date"
                    disabled
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              )}

              {schema.fields?.university?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    University / Campus {schema.fields.university.required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="e.g. Universitas Indonesia"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              )}

              {schema.fields?.major?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Major / Study Field {schema.fields.major.required && <span className="text-rose-500">*</span>}
                  </label>
                  <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                    <option>Select major...</option>
                    {(schema.fields.major.options || []).map((o, idx) => (
                      <option key={idx}>{o}</option>
                    ))}
                  </select>
                </div>
              )}

              {schema.fields?.semester?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Semester {schema.fields.semester.required && <span className="text-rose-500">*</span>}
                  </label>
                  <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                    <option>Select semester...</option>
                    {(schema.fields.semester.options || []).map((o, idx) => (
                      <option key={idx}>{o}</option>
                    ))}
                  </select>
                </div>
              )}

              {schema.fields?.referral_source?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    How did you hear about us? {schema.fields.referral_source.required && <span className="text-rose-500">*</span>}
                  </label>
                  <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                    <option>Select referral source...</option>
                    {(schema.fields.referral_source.options || []).map((o, idx) => (
                      <option key={idx}>{o}</option>
                    ))}
                  </select>
                </div>
              )}

              {schema.fields?.linkedin_url?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    LinkedIn Profile {schema.fields.linkedin_url.required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="url"
                    disabled
                    placeholder="https://linkedin.com/in/..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              )}

              {schema.fields?.github_url?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    GitHub Profile {schema.fields.github_url.required && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="url"
                    disabled
                    placeholder="https://github.com/..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              )}

              {schema.fields?.resume?.enabled && (
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Resume / CV (PDF) {schema.fields.resume.required && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50 text-slate-500">
                    <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                    <span>Click to browse or drag and drop your Resume PDF</span>
                  </div>
                </div>
              )}

              {/* Custom Questionnaire Section */}
              {schema.custom_fields && schema.custom_fields.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <span className="text-2xs font-extrabold uppercase text-kulkul-purple block tracking-wider">
                    Additional Questions
                  </span>

                  {schema.custom_fields.map((cf, i) => (
                    <div key={cf.id || i} className="space-y-1">
                      <label className="block text-2xs font-bold uppercase text-slate-600">
                        {cf.label} {cf.required && <span className="text-rose-500">*</span>}
                      </label>

                      {cf.type === 'textarea' ? (
                        <textarea
                          disabled
                          rows={3}
                          placeholder={cf.placeholder || 'Enter your response...'}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                        />
                      ) : cf.type === 'select' ? (
                        <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                          <option>{cf.placeholder || 'Select option...'}</option>
                          {(cf.options || []).map((o, optIdx) => (
                            <option key={optIdx}>{o}</option>
                          ))}
                        </select>
                      ) : cf.type === 'radio' ? (
                        <div className="space-y-1.5 pt-1">
                          {(cf.options || []).map((o, optIdx) => (
                            <label key={optIdx} className="flex items-center gap-2 text-xs text-slate-700">
                              <input type="radio" disabled name={cf.id} />
                              <span>{o}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={cf.type === 'number' ? 'number' : cf.type === 'url' ? 'url' : 'text'}
                          disabled
                          placeholder={cf.placeholder || ''}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled
                className="w-full mt-4 py-3 rounded-2xl bg-kulkul-purple text-white text-xs font-bold shadow-sm opacity-90 cursor-not-allowed text-center"
              >
                {schema.submit_button_text || 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
