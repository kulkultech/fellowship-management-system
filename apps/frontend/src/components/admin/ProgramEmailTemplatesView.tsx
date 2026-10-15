import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import type { Program, ProgramEmailTemplates, EmailTemplateConfig } from '@/services/types';
import {
  EMAIL_TEMPLATE_TYPES,
  getDefaultProgramEmailTemplates,
} from '@/services/defaultEmailTemplates';
import { useAuthStore } from '@/hooks/useAuthStore';
import {
  Mail,
  Send,
  CheckCircle2,
  XCircle,
  Bot,
  Award,
  Ban,
  Save,
  RotateCcw,
  Monitor,
  Smartphone,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  program: Program;
  onUpdateProgram?: (updated: Program) => void;
}

const TAB_ICONS: Record<string, React.ElementType> = {
  application_received: Send,
  test_result_passed: CheckCircle2,
  test_result_failed: XCircle,
  ai_interview_invitation: Bot,
  final_interview: Award,
  rejection: Ban,
};

export const ProgramEmailTemplatesView: React.FC<Props> = ({ program, onUpdateProgram }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [activeTabKey, setActiveTabKey] = useState<keyof ProgramEmailTemplates>('application_received');
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'mobile'>('desktop');
  const [testEmailRecipient, setTestEmailRecipient] = useState<string>(user?.email || 'admin@fellowhire.com');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<'subject' | 'headline' | 'body' | 'button_text'>('body');

  const subjectRef = useRef<HTMLInputElement>(null);
  const headlineRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLInputElement>(null);

  // Fetch email templates for this program
  const { data: fetchedTemplates, isLoading, isError } = useQuery({
    queryKey: ['programEmailTemplates', program.id],
    queryFn: () => adminService.getProgramEmailTemplates(program.id),
    staleTime: 60_000,
  });

  const defaultTemplates = useMemo(() => getDefaultProgramEmailTemplates(program.name), [program.name]);

  // Local editable state
  const [templates, setTemplates] = useState<ProgramEmailTemplates>(defaultTemplates);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  useEffect(() => {
    if (fetchedTemplates) {
      setTemplates({
        application_received: fetchedTemplates.application_received || defaultTemplates.application_received,
        test_result_passed: fetchedTemplates.test_result_passed || defaultTemplates.test_result_passed,
        test_result_failed: fetchedTemplates.test_result_failed || defaultTemplates.test_result_failed,
        ai_interview_invitation: fetchedTemplates.ai_interview_invitation || defaultTemplates.ai_interview_invitation,
        final_interview: fetchedTemplates.final_interview || defaultTemplates.final_interview,
        rejection: fetchedTemplates.rejection || defaultTemplates.rejection,
      });
      setHasChanges(false);
    }
  }, [fetchedTemplates, defaultTemplates]);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (updated: ProgramEmailTemplates) => adminService.updateProgramEmailTemplates(program.id, updated),
    onSuccess: (savedTemplates) => {
      toast.success('Email communication templates saved successfully!');
      setTemplates(savedTemplates);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['programEmailTemplates', program.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      if (onUpdateProgram) {
        onUpdateProgram({
          ...program,
          email_templates: savedTemplates,
        });
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to save email templates');
    },
  });

  // Test Email Mutation
  const testEmailMutation = useMutation({
    mutationFn: (payload: { type: string; recipient_email: string; template: EmailTemplateConfig }) =>
      adminService.sendTestProgramEmail(program.id, payload),
    onSuccess: (res) => {
      toast.success(res.message || 'Test email dispatched successfully!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to dispatch test email');
    },
  });

  const activeMeta = useMemo(() => {
    return EMAIL_TEMPLATE_TYPES.find((t) => t.key === activeTabKey) || EMAIL_TEMPLATE_TYPES[0];
  }, [activeTabKey]);

  const currentConfig: EmailTemplateConfig = useMemo(() => {
    return templates[activeTabKey] || defaultTemplates[activeTabKey] || {
      enabled: true,
      subject: '',
      headline: '',
      body: '',
      button_text: '',
    };
  }, [templates, activeTabKey, defaultTemplates]);

  const handleFieldChange = (field: keyof EmailTemplateConfig, value: any) => {
    setTemplates((prev) => {
      const existing = prev[activeTabKey] || defaultTemplates[activeTabKey] || {
        enabled: true,
        subject: '',
        headline: '',
        body: '',
        button_text: '',
      };
      return {
        ...prev,
        [activeTabKey]: {
          ...existing,
          [field]: value,
        },
      };
    });
    setHasChanges(true);
  };

  const handleResetCurrent = () => {
    if (!window.confirm(`Reset "${activeMeta.label}" template back to default system template?`)) {
      return;
    }
    const def = defaultTemplates[activeTabKey];
    if (def) {
      setTemplates((prev) => ({
        ...prev,
        [activeTabKey]: { ...def },
      }));
      setHasChanges(true);
      toast.success(`Reset "${activeMeta.label}" to system default`);
    }
  };

  const handleResetAll = () => {
    if (!window.confirm(`Reset ALL 6 email templates for "${program.name}" to standard system defaults?`)) {
      return;
    }
    setTemplates(defaultTemplates);
    setHasChanges(true);
    toast.success('All templates reset to system defaults');
  };

  const handleInsertVariable = (variable: string) => {
    // Copy to clipboard
    navigator.clipboard.writeText(variable).catch(() => {});
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);

    // Also append to active field
    if (activeField === 'subject') {
      const cur = currentConfig.subject || '';
      handleFieldChange('subject', cur + ' ' + variable);
      subjectRef.current?.focus();
    } else if (activeField === 'headline') {
      const cur = currentConfig.headline || '';
      handleFieldChange('headline', cur + ' ' + variable);
      headlineRef.current?.focus();
    } else if (activeField === 'button_text') {
      const cur = currentConfig.button_text || '';
      handleFieldChange('button_text', cur + ' ' + variable);
      buttonRef.current?.focus();
    } else {
      const cur = currentConfig.body || '';
      handleFieldChange('body', cur + (cur ? ' ' : '') + variable);
      bodyRef.current?.focus();
    }
    toast.success(`Copied and appended ${variable}`, { duration: 1500 });
  };

  // Preview variable map
  const mockVars: Record<string, string> = useMemo(() => {
    return {
      candidate_name: 'Jane Doe',
      program_name: program.name || 'Engineering Fellowship',
      track_name: 'Full Stack Engineering',
      test_link: 'https://fellowhire.kul.to/test/preview-token',
      action_url: activeMeta.defaultActionUrl,
      interview_link: 'https://fellowhire.kul.to/interview/preview-token',
      dashboard_url: 'https://fellowhire.kul.to/candidate/dashboard',
      duration_minutes: String(program.logic_test_duration_minutes || 45),
      passing_score: String(program.logic_test_passing_score || 70),
      score: activeTabKey === 'test_result_failed' ? '58' : '88',
      next_step: activeTabKey === 'test_result_passed' ? 'AI Video Screening' : 'Review Assessment',
      expires_at: 'Monday, October 5, 2026 at 18:00 WIB',
      notes: 'Strong understanding of software patterns and solid problem-solving demonstrated.',
      support_email: 'support@fellowhire.kul.to',
    };
  }, [program, activeTabKey, activeMeta]);

  const replaceVars = (text: string) => {
    if (!text) return '';
    let res = text;
    for (const [k, v] of Object.entries(mockVars)) {
      res = res.replaceAll(`{{${k}}}`, v).replaceAll(`{{ ${k} }}`, v);
    }
    return res;
  };

  const previewSubject = useMemo(() => replaceVars(currentConfig.subject), [currentConfig.subject, mockVars]);
  const previewHeadline = useMemo(() => replaceVars(currentConfig.headline), [currentConfig.headline, mockVars]);
  const previewBody = useMemo(() => replaceVars(currentConfig.body), [currentConfig.body, mockVars]);
  const previewButtonText = useMemo(() => replaceVars(currentConfig.button_text || ''), [currentConfig.button_text, mockVars]);

  const handleSendTestEmail = () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      toast.error('Please provide a valid recipient email address');
      return;
    }
    testEmailMutation.mutate({
      type: activeTabKey,
      recipient_email: testEmailRecipient,
      template: currentConfig,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <div className="w-10 h-10 border-4 border-kulkul-purple border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-500">Loading program email templates...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-xl max-w-xl mx-auto text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
        <h3 className="text-lg font-bold text-rose-900">Failed to load email templates</h3>
        <p className="text-sm text-rose-700">There was an issue fetching email templates for this program.</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['programEmailTemplates', program.id] })}
          className="btn btn-sm btn-danger"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="content-card space-y-6">
      <div className="flex justify-end">
        <div className="section-actions">
          <button
            type="button"
            onClick={handleResetAll}
            className="btn btn-sm btn-outline"
            title="Reset all 6 templates to system defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All to Defaults
          </button>

          <button
            type="button"
            onClick={() => saveMutation.mutate(templates)}
            disabled={saveMutation.isPending || !hasChanges}
            className="btn btn-sm btn-primary"
          >
            {saveMutation.isPending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {hasChanges ? 'Save Templates' : 'All Changes Saved'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs Row (6 Email Types) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {EMAIL_TEMPLATE_TYPES.map((typeMeta) => {
          const Icon = TAB_ICONS[typeMeta.key] || Mail;
          const isActive = activeTabKey === typeMeta.key;
          const cfg = templates[typeMeta.key];
          const isEnabled = cfg ? cfg.enabled : true;

          return (
            <button
              key={typeMeta.key}
              type="button"
              onClick={() => setActiveTabKey(typeMeta.key)}
              className={`flex flex-col items-start p-3 rounded-xl text-left transition-all relative ${
                isActive
                  ? 'bg-purple-50/60 border border-kulkul-purple text-slate-900 font-bold'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-kulkul-purple text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div
                  className={`w-2 h-2 rounded-full ${
                    isEnabled ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
                  }`}
                  title={isEnabled ? 'Template enabled' : 'Fallback to system default'}
                />
              </div>
              <span className="text-xs leading-tight font-semibold line-clamp-1">{typeMeta.label}</span>
              <span className="text-3xs text-slate-400 mt-0.5 line-clamp-1">{typeMeta.stageTag.split('•')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Grid: Editor (Left) & Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Editor Controls (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Active Template Status Card */}
          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-600">{activeMeta.description}</p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetCurrent}
                  className="btn btn-sm btn-ghost"
                  title="Reset this tab to default"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                {/* Enable / Disable Switch */}
                <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {currentConfig.enabled ? 'Custom Email Active' : 'Default System'}
                  </span>
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={currentConfig.enabled}
                      onChange={(e) => handleFieldChange('enabled', e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </div>
                </label>
              </div>
            </div>

          </div>

          {/* Dynamic Variables Quick-Insertion Pills */}
          <div className="panel space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="card-title flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-kulkul-purple" />
                Click Variable to Insert / Copy
              </span>
              <span className="meta-text">
                Inserting into: <span className="font-semibold text-kulkul-purple uppercase">{activeField}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeMeta.supportedVariables.map((v) => {
                const isCopied = copiedVar === v.variable;
                return (
                  <button
                    key={v.variable}
                    type="button"
                    onClick={() => handleInsertVariable(v.variable)}
                    className="btn btn-sm btn-outline font-mono group"
                    title={`${v.label} (e.g. ${v.example})`}
                  >
                    <span>{v.variable}</span>
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-kulkul-purple" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Inputs Card */}
          <div className="panel space-y-4">
            {/* Subject Line */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="field-label mb-0">Email Subject Line</label>
                <span className="meta-text font-mono">
                  {(currentConfig.subject || '').length} characters
                </span>
              </div>
              <input
                ref={subjectRef}
                type="text"
                value={currentConfig.subject || ''}
                onFocus={() => setActiveField('subject')}
                onChange={(e) => handleFieldChange('subject', e.target.value)}
                placeholder="e.g. Application Received: {{program_name}}"
                className="form-input"
              />
            </div>

            {/* Hero Headline */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="field-label mb-0">Hero Headline (Header inside Email)</label>
                <span className="meta-text font-mono">
                  {(currentConfig.headline || '').length} characters
                </span>
              </div>
              <input
                ref={headlineRef}
                type="text"
                value={currentConfig.headline || ''}
                onFocus={() => setActiveField('headline')}
                onChange={(e) => handleFieldChange('headline', e.target.value)}
                placeholder="e.g. Your Application has been Received!"
                className="form-input"
              />
            </div>

            {/* Email Body Content */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="field-label mb-0">Email Message Body</label>
                <span className="meta-text">Separate paragraphs with a blank line</span>
              </div>
              <textarea
                ref={bodyRef}
                rows={9}
                value={currentConfig.body || ''}
                onFocus={() => setActiveField('body')}
                onChange={(e) => handleFieldChange('body', e.target.value)}
                placeholder="Write your email body here. Use {{variable_name}} for dynamic values..."
                className="form-textarea text-sm leading-relaxed resize-y"
              />
            </div>

            {/* Call-to-Action Button Label */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="field-label mb-0">Call-to-Action Button Label</label>
                <span className="meta-text">Leave blank to omit primary button</span>
              </div>
              <input
                ref={buttonRef}
                type="text"
                value={currentConfig.button_text || ''}
                onFocus={() => setActiveField('button_text')}
                onChange={(e) => handleFieldChange('button_text', e.target.value)}
                placeholder="e.g. Begin Assessment Now"
                className="form-input"
              />
            </div>
          </div>

          {/* Test Email Dispatch Card */}
          <div className="panel-muted space-y-3">
            <div className="card-title flex items-center gap-2">
              <Send className="w-4 h-4 text-kulkul-purple" />
              Dispatch Live Test Email
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="your.email@company.com"
                className="form-input sm:flex-1"
              />
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testEmailMutation.isPending}
                className="btn btn-sm btn-outline w-full sm:w-auto shrink-0"
              >
                {testEmailMutation.isPending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Send Test Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Live Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-3 sticky top-4">
          {/* Viewport Selector */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="card-title">Live Client Preview</span>
              <span className="meta-text font-medium">
                Sample Data
              </span>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setDevicePreview('desktop')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  devicePreview === 'desktop'
                    ? 'bg-white text-kulkul-purple shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-2xs">Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setDevicePreview('mobile')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  devicePreview === 'mobile'
                    ? 'bg-white text-kulkul-purple shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Mobile View"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-2xs">Mobile</span>
              </button>
            </div>
          </div>

          {/* Realistic Mail Client Frame */}
          <div
            className={`mx-auto transition-all duration-300 ${
              devicePreview === 'mobile' ? 'max-w-[375px]' : 'w-full'
            }`}
          >
            <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-800">
              {/* Mail Client Chrome Bar */}
              <div className="bg-slate-800/90 px-4 py-3 flex items-center justify-between border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                </div>
                <div className="text-2xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span>FellowHire Mailer</span>
                </div>
                <div className="w-8"></div>
              </div>

              {/* Envelope Meta Header */}
              <div className="bg-slate-800/40 p-3.5 border-b border-slate-700/40 text-xs space-y-1 font-sans">
                <div className="flex items-baseline gap-2 text-slate-400">
                  <span className="w-12 text-3xs uppercase font-bold text-slate-400 shrink-0">From:</span>
                  <span className="text-slate-200 font-medium truncate">
                    FellowHire Admissions &lt;support@fellowhire.kul.to&gt;
                  </span>
                </div>
                <div className="flex items-baseline gap-2 text-slate-400">
                  <span className="w-12 text-3xs uppercase font-bold text-slate-400 shrink-0">To:</span>
                  <span className="text-slate-200 font-medium">Alex Mercer &lt;alex.mercer@gmail.com&gt;</span>
                </div>
                <div className="flex items-baseline gap-2 text-slate-400">
                  <span className="w-12 text-3xs uppercase font-bold text-slate-400 shrink-0">Subject:</span>
                  <span className="text-indigo-300 font-bold break-words">{previewSubject || '(Empty Subject)'}</span>
                </div>
              </div>

              {/* Email Body Canvas */}
              <div className="bg-slate-100 p-4 sm:p-6 overflow-y-auto max-h-[580px]">
                {/* Email Card Container */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden font-sans">
                  {/* Brand Header Banner */}
                  <div className="bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4338ca] p-6 text-center text-white relative">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-bold text-indigo-100 mb-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
                      FellowHire Admissions
                    </div>
                    <div className="text-xs text-indigo-200 font-medium">{program.name}</div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 sm:p-8 space-y-5 text-slate-700">
                    {/* Hero Headline */}
                    {previewHeadline && (
                      <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-snug">
                        {previewHeadline}
                      </h2>
                    )}

                    {/* Paragraphs */}
                    <div className="space-y-3.5 text-sm sm:text-base leading-relaxed text-slate-600">
                      {previewBody ? (
                        previewBody.split('\n\n').map((para, i) => (
                          <p key={i} className="whitespace-pre-line">
                            {para}
                          </p>
                        ))
                      ) : (
                        <p className="text-slate-400 italic">No message body provided yet.</p>
                      )}
                    </div>

                    {/* CTA Button */}
                    {previewButtonText && (
                      <div className="pt-4 pb-2 text-center">
                        <span className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 cursor-pointer transition-all">
                          {previewButtonText}
                          <ArrowRight className="w-4 h-4" />
                        </span>
                        <div className="mt-3 text-2xs text-slate-400">
                          Direct Link: <span className="text-indigo-600 underline">{activeMeta.defaultActionUrl}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean Footer */}
                  <div className="bg-slate-50 border-t border-slate-100 p-5 text-center text-xs text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-500">FellowHire Admissions Committee</p>
                    <p>
                      Questions or need accommodations? Contact{' '}
                      <span className="text-indigo-600">support@fellowhire.kul.to</span>
                    </p>
                    <p className="text-3xs text-slate-400 pt-1">
                      © {new Date().getFullYear()} FellowHire. All rights reserved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
