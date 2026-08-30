import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, type CreateProgramPayload } from '@/services/adminService';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { MCQQuestion } from '@/services/types';
import {
  Users,
  Search,
  CheckCircle2,
  ChevronRight,
  X,
  ExternalLink,
  Check,
  Sliders,
  Plus,
  Clock,
  Copy,
  Building2,
  ListOrdered,
  Trash2,
  HelpCircle,
  Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';

  // Navigation View: 'pipeline' (Reviewing candidates) | 'companies' (Superadmin Approvals) | 'questions' (Google Form Builder)
  const [currentView, setCurrentView] = useState<'pipeline' | 'companies' | 'questions'>('pipeline');

  const [selectedStage, setSelectedStage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'answers' | 'ai' | 'profile'>('answers');

  // Modals
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);
  const [isCreateProgramModalOpen, setIsCreateProgramModalOpen] = useState(false);
  const [isQuestionBuilderOpen, setIsQuestionBuilderOpen] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // Active Program selection
  const [activeProgramSlug, setActiveProgramSlug] = useState('lit2026');

  // Load All Programs for Company
  const { data: allPrograms = [] } = useQuery({
    queryKey: ['admin-all-programs'],
    queryFn: () => adminService.listPrograms(),
  });

  // Current company slug
  const orgSlug = user?.organization?.slug || 'rsa';
  const companyLogo = user?.organization?.logo_url;
  const companyName = user?.organization?.name || 'Remote Skills Academy';

  // Load Active Program Details
  const { data: programData } = useQuery({
    queryKey: ['program', orgSlug, activeProgramSlug],
    queryFn: () => programService.getProgram(orgSlug, activeProgramSlug),
  });

  const program = programData?.program;
  const programId = program?.id;

  // Pipeline Config State
  const [enableMCQ, setEnableMCQ] = useState(true);
  const [enableAI, setEnableAI] = useState(true);
  const [configDuration, setConfigDuration] = useState<number>(30);
  const [configPassingScore, setConfigPassingScore] = useState<number>(70);
  const [configAllowRetake, setConfigAllowRetake] = useState<boolean>(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [newAiQuestionInput, setNewAiQuestionInput] = useState('');

  // Sync pipeline config when program loads
  React.useEffect(() => {
    if (program) {
      setEnableMCQ(program.enable_mcq ?? true);
      setEnableAI(program.enable_ai_interview ?? true);
      setConfigDuration(program.logic_test_duration_minutes || 30);
      setConfigPassingScore(program.logic_test_passing_score || 70);
      setConfigAllowRetake(program.allow_retake || false);
      setAiInstructions(program.ai_interview_instructions || '');
      setAiQuestions(
        program.ai_interview_questions && program.ai_interview_questions.length > 0
          ? program.ai_interview_questions
          : [
              'Can you describe how you would design a scalable distributed job queue?',
              'What are the pros and cons of using optimistic vs pessimistic locking in databases?',
              'How do you handle graceful degradation when downstream APIs experience high latency?',
            ]
      );
    }
  }, [program]);

  // Load Program MCQ Question Bank
  const { data: questionBank = [], refetch: refetchQuestions } = useQuery({
    queryKey: ['admin-program-questions', programId],
    queryFn: () => (programId ? adminService.listProgramQuestions(programId) : Promise.resolve([])),
    enabled: !!programId,
  });

  // Local Editable Question Bank State (Google Form Style)
  const [editingQuestions, setEditingQuestions] = useState<MCQQuestion[]>([]);

  React.useEffect(() => {
    if (questionBank.length > 0) {
      setEditingQuestions(JSON.parse(JSON.stringify(questionBank)));
    }
  }, [questionBank]);

  // Superadmin: Load Companies list
  const { data: companiesList = [], refetch: refetchCompanies } = useQuery({
    queryKey: ['admin-companies-list'],
    queryFn: () => adminService.listCompanies(),
    enabled: isSuperadmin || currentView === 'companies',
  });

  // Create Program Form State
  const [newProgSlug, setNewProgSlug] = useState('');
  const [newProgName, setNewProgName] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgImage, setNewProgImage] = useState(
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80'
  );
  const [newProgEnableMCQ, setNewProgEnableMCQ] = useState(true);
  const [newProgEnableAI, setNewProgEnableAI] = useState(true);
  const [newProgDuration, setNewProgDuration] = useState(30);
  const [newProgPassingScore, setNewProgPassingScore] = useState(70);

  const getPublicProgramUrl = (slug: string = activeProgramSlug) => {
    return `${window.location.origin}/programs/${orgSlug}/${slug}`;
  };

  const handleCopyProgramLink = (slug: string = activeProgramSlug) => {
    const url = getPublicProgramUrl(slug);
    navigator.clipboard.writeText(url);
    setIsLinkCopied(true);
    toast.success('Shareable candidate program link copied!');
    setTimeout(() => setIsLinkCopied(false), 2500);
  };

  // Load Applicants list
  const { data: applicants = [], isLoading: isListLoading } = useQuery({
    queryKey: ['admin-applicants', programId, selectedStage],
    queryFn: () => adminService.listApplicants(programId!, selectedStage),
    enabled: !!programId,
  });

  // Load Single Applicant Details
  const { data: applicantDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['admin-applicant-detail', selectedApplicantId],
    queryFn: () => adminService.getApplicantDetails(selectedApplicantId!),
    enabled: !!selectedApplicantId,
  });

  // Mutations
  const updatePipelineMutation = useMutation({
    mutationFn: (payload: {
      enable_mcq: boolean;
      logic_test_duration_minutes: number;
      logic_test_passing_score: number;
      allow_retake: boolean;
      enable_ai_interview: boolean;
      ai_interview_instructions: string;
      ai_interview_questions: string[];
    }) => adminService.updatePipelineConfig(programId!, payload),
    onSuccess: () => {
      toast.success('Assessment pipeline configured successfully!');
      queryClient.invalidateQueries({ queryKey: ['program', orgSlug, activeProgramSlug] });
      setIsPipelineModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save pipeline configuration');
    },
  });

  const saveQuestionsMutation = useMutation({
    mutationFn: (questions: MCQQuestion[]) => adminService.saveProgramQuestions(programId!, questions),
    onSuccess: () => {
      toast.success('Question bank saved successfully!');
      refetchQuestions();
      setIsQuestionBuilderOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save questions');
    },
  });

  const createProgramMutation = useMutation({
    mutationFn: (payload: CreateProgramPayload) => adminService.createProgram(payload),
    onSuccess: (newProg) => {
      toast.success(`Program "${newProg.name}" created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setActiveProgramSlug(newProg.slug);
      setIsCreateProgramModalOpen(false);
      // Reset form
      setNewProgSlug('');
      setNewProgName('');
      setNewProgDesc('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create program');
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ applicantId, stage }: { applicantId: string; stage: string }) =>
      adminService.updateApplicantStage(applicantId, stage),
    onSuccess: () => {
      toast.success('Applicant stage updated');
      queryClient.invalidateQueries({ queryKey: ['admin-applicants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-applicant-detail', selectedApplicantId] });
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const approveCompanyMutation = useMutation({
    mutationFn: (companyId: string) => adminService.approveCompany(companyId),
    onSuccess: (data) => {
      toast.success(`Approved company "${data.name}"!`);
      refetchCompanies();
    },
    onError: () => toast.error('Failed to approve company'),
  });

  const rejectCompanyMutation = useMutation({
    mutationFn: (companyId: string) => adminService.rejectCompany(companyId),
    onSuccess: (data) => {
      toast.error(`Company "${data.name}" application declined`);
      refetchCompanies();
    },
    onError: () => toast.error('Failed to update company status'),
  });

  // Filtered applicants
  const filteredApplicants = applicants.filter((a) => {
    const query = searchQuery.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query) ||
      a.current_stage.toLowerCase().includes(query)
    );
  });

  // Helper question management in Google Form builder
  const handleAddQuestion = () => {
    const newQ: MCQQuestion = {
      category: 'Technical Problem Solving',
      question_text: 'Enter your question prompt here...',
      options: [
        { id: 'a', text: 'Option 1' },
        { id: 'b', text: 'Option 2' },
        { id: 'c', text: 'Option 3' },
        { id: 'd', text: 'Option 4' },
      ],
      correct_option_id: 'a',
      explanation: 'Explanation for why Option 1 is correct.',
      points: 10,
    };
    setEditingQuestions([...editingQuestions, newQ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    setEditingQuestions(editingQuestions.filter((_, i) => i !== idx));
  };

  const handleQuestionChange = (idx: number, field: keyof MCQQuestion, val: any) => {
    const updated = [...editingQuestions];
    updated[idx] = { ...updated[idx], [field]: val };
    setEditingQuestions(updated);
  };

  const handleOptionChange = (qIdx: number, optIdx: number, text: string) => {
    const updated = [...editingQuestions];
    const opts = [...updated[qIdx].options];
    opts[optIdx] = { ...opts[optIdx], text };
    updated[qIdx].options = opts;
    setEditingQuestions(updated);
  };

  const handleAddOption = (qIdx: number) => {
    const updated = [...editingQuestions];
    const opts = [...updated[qIdx].options];
    const nextChar = String.fromCharCode(97 + opts.length); // 'e', 'f'...
    opts.push({ id: nextChar, text: `Option ${opts.length + 1}` });
    updated[qIdx].options = opts;
    setEditingQuestions(updated);
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    const updated = [...editingQuestions];
    const opts = updated[qIdx].options.filter((_, i) => i !== optIdx);
    updated[qIdx].options = opts;
    if (updated[qIdx].correct_option_id === updated[qIdx].options[optIdx]?.id && opts.length > 0) {
      updated[qIdx].correct_option_id = opts[0].id;
    }
    setEditingQuestions(updated);
  };

  const handleAddAiQuestion = () => {
    if (newAiQuestionInput.trim()) {
      setAiQuestions([...aiQuestions, newAiQuestionInput.trim()]);
      setNewAiQuestionInput('');
    }
  };

  const handleRemoveAiQuestion = (idx: number) => {
    setAiQuestions(aiQuestions.filter((_, i) => i !== idx));
  };

  const pendingCompaniesCount = companiesList.filter((c) => c.status === 'pending_approval').length;

  const renderStageBadge = (stage: string) => {
    switch (stage) {
      case 'registered':
      case 'applied':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Applied</span>;
      case 'test_in_progress':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">Test In Progress</span>;
      case 'test_completed':
      case 'logic_test_passed':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">MCQ Completed</span>;
      case 'test_failed':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">Test Failed</span>;
      case 'ai_interview_invited':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">AI Screen Pending</span>;
      case 'ai_interview_completed':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">AI Evaluated</span>;
      case 'approved_for_live':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white">Accepted / Live</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{stage}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar title="FellowHire Dashboard" subtitle="Reviewer & Talent Operations" showAdminNav={true} />

      <main className="flex-1 max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header & Dynamic Company Workspace Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Left: Company & Active Program Branding */}
            <div className="flex items-start sm:items-center gap-4">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm p-1 bg-white"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-kulkul-purple text-white flex items-center justify-center font-black text-xl shadow-md">
                  {companyName.substring(0, 2).toUpperCase()}
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-kulkul-purple text-white text-2xs font-bold uppercase tracking-wider">
                    {companyName}
                  </span>
                  {program?.enable_mcq && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-2xs font-bold">
                      MCQ Stage On
                    </span>
                  )}
                  {program?.enable_ai_interview && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-2xs font-bold flex items-center gap-1">
                      <Bot className="w-3 h-3" />
                      AI Interviewer On
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {program?.name || 'Fellowship Assessment Pipeline'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Host Organization: <strong className="text-slate-700">{companyName}</strong> &middot; Slug: <span className="font-mono text-kulkul-purple">{orgSlug}/{activeProgramSlug}</span>
                </p>
              </div>
            </div>

            {/* Right: Quick Action Controls */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Program Selector */}
              {allPrograms.length > 1 && (
                <select
                  value={activeProgramSlug}
                  onChange={(e) => setActiveProgramSlug(e.target.value)}
                  className="px-4 py-2.5 text-xs font-bold rounded-full bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                >
                  {allPrograms.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Copy Public Link Button */}
              <button
                onClick={() => handleCopyProgramLink(activeProgramSlug)}
                className="px-4 py-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-2"
                title="Copy shareable applicant link"
              >
                {isLinkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Candidate Link</span>
                  </>
                )}
              </button>

              {/* Configure Assessment Pipeline Button */}
              <button
                onClick={() => setIsPipelineModalOpen(true)}
                className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>Configure Pipeline</span>
              </button>

              {/* Google Form Questions Builder Button */}
              <button
                onClick={() => setIsQuestionBuilderOpen(true)}
                className="px-4 py-2.5 rounded-full bg-kulkul-purple-light hover:bg-kulkul-purple-subtle border border-kulkul-purple/30 text-kulkul-purple text-xs font-bold transition flex items-center gap-2"
              >
                <ListOrdered className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>Question Bank ({questionBank.length})</span>
              </button>

              {/* Create New Program Button */}
              <button
                onClick={() => setIsCreateProgramModalOpen(true)}
                className="px-4 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4 text-kulkul-orange" />
                <span>New Program</span>
              </button>
            </div>
          </div>

          {/* Top Tabs Bar */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('pipeline')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  currentView === 'pipeline'
                    ? 'bg-kulkul-purple text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Candidate Pipeline ({applicants.length})</span>
              </button>

              <button
                onClick={() => setIsQuestionBuilderOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition flex items-center gap-2"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>MCQ Questions Builder</span>
              </button>

              {/* Superadmin Company Approvals Tab */}
              {isSuperadmin && (
                <button
                  onClick={() => setCurrentView('companies')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    currentView === 'companies'
                      ? 'bg-kulkul-purple text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Company Approvals</span>
                  {pendingCompaniesCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-2xs font-extrabold animate-pulse">
                      {pendingCompaniesCount} New
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Public Link Preview */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Public Opportunity:</span>
              <a
                href={getPublicProgramUrl(activeProgramSlug)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-kulkul-purple hover:underline flex items-center gap-1 font-semibold"
              >
                <span>/programs/{orgSlug}/{activeProgramSlug}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* ================================================================================= */}
        {/* VIEW 1: SUPERADMIN COMPANY APPROVALS WORKSPACE */}
        {/* ================================================================================= */}
        {currentView === 'companies' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Registered Companies & Verification</h2>
                <p className="text-xs text-slate-500">
                  Review incoming company workspace applications. Approving enables them to log in and launch assessment programs.
                </p>
              </div>

              <span className="text-xs font-bold px-3 py-1 bg-white border border-slate-200 rounded-full text-slate-700 shadow-2xs">
                Total Companies: {companiesList.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companiesList.map((company) => (
                <div
                  key={company.id}
                  className="stitch-card bg-white p-6 border border-slate-200 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {company.logo_url ? (
                          <img
                            src={company.logo_url}
                            alt={company.name}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs p-1"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-lg">
                            {company.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 leading-tight">{company.name}</h3>
                          <span className="text-xs font-mono text-slate-500">slug: {company.slug}</span>
                        </div>
                      </div>

                      {company.status === 'approved' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved
                        </span>
                      ) : company.status === 'rejected' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-red-50 text-red-700 border border-red-200">
                          Rejected
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </span>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5 text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Contact Email:</span>
                        <span className="font-semibold text-slate-800">{company.contact_email || 'Not provided'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Submitted On:</span>
                        <span className="text-slate-500">
                          {company.created_at ? new Date(company.created_at).toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    {company.status !== 'approved' && (
                      <button
                        onClick={() => approveCompanyMutation.mutate(company.id)}
                        disabled={approveCompanyMutation.isPending}
                        className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}

                    {company.status !== 'rejected' && company.slug !== 'rsa' && (
                      <button
                        onClick={() => rejectCompanyMutation.mutate(company.id)}
                        disabled={rejectCompanyMutation.isPending}
                        className="px-3.5 py-2 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 text-xs font-bold transition"
                      >
                        Decline
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* VIEW 2: CANDIDATE PIPELINE & APPLICANTS LIST */}
        {/* ================================================================================= */}
        {currentView === 'pipeline' && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search candidates by name, email, or stage..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                />
              </div>

              {/* Stage Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {[
                  { label: 'All Candidates', value: '' },
                  { label: 'MCQ Passed', value: 'test_completed' },
                  { label: 'AI Evaluated', value: 'ai_interview_completed' },
                  { label: 'Live Accepted', value: 'approved_for_live' },
                ].map((st) => (
                  <button
                    key={st.value}
                    onClick={() => setSelectedStage(st.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                      selectedStage === st.value
                        ? 'bg-kulkul-purple text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Candidates Table */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Candidate</th>
                      <th className="px-6 py-4">Stage Status</th>
                      <th className="px-6 py-4">Logic MCQ Score</th>
                      <th className="px-6 py-4">AI Interview Score</th>
                      <th className="px-6 py-4">AI Recommendation</th>
                      <th className="px-6 py-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isListLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          Loading candidates...
                        </td>
                      </tr>
                    ) : filteredApplicants.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                          <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <div className="text-base font-bold text-slate-700">No applicants yet</div>
                          <div className="text-xs text-slate-400 mt-1">
                            Share your program link with candidates to start receiving assessments.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredApplicants.map((app) => (
                        <tr
                          key={app.id}
                          onClick={() => setSelectedApplicantId(app.id)}
                          className="hover:bg-slate-50/80 cursor-pointer transition"
                        >
                          <td className="px-6 py-4">
                            <div className="font-extrabold text-slate-900">{app.full_name}</div>
                            <div className="text-xs text-slate-500">{app.email}</div>
                          </td>
                          <td className="px-6 py-4">{renderStageBadge(app.current_stage)}</td>
                          <td className="px-6 py-4">
                            {app.mcq_score !== undefined && app.mcq_score !== null ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-sm font-extrabold ${
                                    app.mcq_passed ? 'text-emerald-600' : 'text-red-600'
                                  }`}
                                >
                                  {app.mcq_score}%
                                </span>
                                <span className="text-2xs text-slate-400 font-medium">
                                  ({app.time_spent_seconds ? Math.round(app.time_spent_seconds / 60) : 0}m)
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">&mdash;</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {app.ai_score !== undefined && app.ai_score !== null && app.ai_score > 0 ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                                {app.ai_score}/100
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">&mdash;</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {app.ai_recommendation ? (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                {app.ai_recommendation}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">&mdash;</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedApplicantId(app.id);
                              }}
                              className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 hover:text-kulkul-purple transition"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* MODAL 1: GOOGLE FORM STYLE MCQ QUESTION BANK BUILDER */}
        {/* ================================================================================= */}
        {isQuestionBuilderOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold">
                    <ListOrdered className="w-5 h-5 text-kulkul-orange" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">
                      MCQ Questionnaire Builder (Google Form Style)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure custom questions, multiple choice options, correct answers, and points for {program?.name}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsQuestionBuilderOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body: Question List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {editingQuestions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <HelpCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">No questions in this test bank yet</p>
                    <p className="text-xs text-slate-400 mt-1">Click the button below to add your first question.</p>
                  </div>
                ) : (
                  editingQuestions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="stitch-card bg-slate-50/50 p-6 border border-slate-200 space-y-4 relative group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="px-2.5 py-1 rounded-full bg-kulkul-purple text-white text-2xs font-extrabold uppercase tracking-wider">
                          Question {qIdx + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded-lg transition"
                          title="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Question Text */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Question Prompt <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={q.question_text}
                          onChange={(e) => handleQuestionChange(qIdx, 'question_text', e.target.value)}
                          placeholder="e.g. What is the time complexity of searching in a balanced BST?"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      {/* Options with Correct Answer Selector */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Options & Correct Answer Selection:
                        </label>

                        {q.options.map((opt, optIdx) => (
                          <div key={opt.id} className="flex items-center gap-3">
                            <input
                              type="radio"
                              name={`correct_${qIdx}`}
                              checked={q.correct_option_id === opt.id}
                              onChange={() => handleQuestionChange(qIdx, 'correct_option_id', opt.id)}
                              className="w-4 h-4 text-kulkul-purple focus:ring-kulkul-purple cursor-pointer"
                              title="Select as correct answer"
                            />
                            <span className="text-xs font-bold font-mono text-slate-500 uppercase w-4">
                              {opt.id}.
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                              placeholder={`Option ${optIdx + 1}`}
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(qIdx, optIdx)}
                                className="text-slate-400 hover:text-red-500 p-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddOption(qIdx)}
                          className="text-xs font-bold text-kulkul-purple hover:underline pt-1 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      </div>

                      {/* Explanation & Points */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                        <div className="sm:col-span-2">
                          <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                            Explanation (Shown in Scorecard Review)
                          </label>
                          <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={(e) => handleQuestionChange(qIdx, 'explanation', e.target.value)}
                            placeholder="Why is this the correct answer?"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={q.points || 10}
                            onChange={(e) => handleQuestionChange(qIdx, 'points', parseInt(e.target.value) || 10)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Add Question Button */}
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-kulkul-purple text-slate-600 hover:text-kulkul-purple text-xs font-bold transition flex items-center justify-center gap-2 bg-white"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New MCQ Question</span>
                </button>
              </div>

              {/* Footer Actions */}
              <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Total Questions: <strong>{editingQuestions.length}</strong>
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsQuestionBuilderOpen(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveQuestionsMutation.mutate(editingQuestions)}
                    disabled={saveQuestionsMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2"
                  >
                    {saveQuestionsMutation.isPending ? <span>Saving...</span> : <span>Save Question Bank</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* MODAL 2: PIPELINE & AI INTERVIEW CONFIGURATION */}
        {/* ================================================================================= */}
        {isPipelineModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-5 h-5 text-kulkul-purple" />
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Configure Assessment Pipeline
                  </h2>
                </div>
                <button
                  onClick={() => setIsPipelineModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stage 1: Logic MCQ Stage Toggle */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ListOrdered className="w-5 h-5 text-kulkul-purple" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Stage 1: Logic MCQ Test</h4>
                      <p className="text-2xs text-slate-500">Timed multiple choice questionnaire</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMCQ}
                      onChange={(e) => setEnableMCQ(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kulkul-purple" />
                  </label>
                </div>

                {enableMCQ && (
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                        Test Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={configDuration}
                        onChange={(e) => setConfigDuration(parseInt(e.target.value) || 30)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                        Passing Benchmark (%)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={configPassingScore}
                        onChange={(e) => setConfigPassingScore(parseInt(e.target.value) || 70)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Stage 2: AI Technical Screening Toggle */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-kulkul-orange" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Stage 2: AI Technical Interview Room</h4>
                      <p className="text-2xs text-slate-500">Conversational AI questioning & scorecard evaluation</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableAI}
                      onChange={(e) => setEnableAI(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kulkul-orange" />
                  </label>
                </div>

                {enableAI && (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                        Company Questions for the AI Interviewer:
                      </label>
                      <div className="space-y-2 mb-2">
                        {aiQuestions.map((q, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800"
                          >
                            <span className="font-medium">
                              {idx + 1}. {q}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAiQuestion(idx)}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newAiQuestionInput}
                          onChange={(e) => setNewAiQuestionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAiQuestion();
                            }
                          }}
                          placeholder="e.g. Ask why they chose Postgres over MongoDB..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                        <button
                          type="button"
                          onClick={handleAddAiQuestion}
                          className="px-3.5 py-2 rounded-xl bg-kulkul-purple text-white text-xs font-bold hover:bg-kulkul-purple-hover transition"
                        >
                          Add Question
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPipelineModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updatePipelineMutation.mutate({
                      enable_mcq: enableMCQ,
                      logic_test_duration_minutes: configDuration,
                      logic_test_passing_score: configPassingScore,
                      allow_retake: configAllowRetake,
                      enable_ai_interview: enableAI,
                      ai_interview_instructions: aiInstructions,
                      ai_interview_questions: aiQuestions,
                    })
                  }
                  disabled={updatePipelineMutation.isPending}
                  className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition"
                >
                  {updatePipelineMutation.isPending ? <span>Saving...</span> : <span>Save Pipeline Settings</span>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* MODAL 3: CREATE NEW PROGRAM MODAL */}
        {/* ================================================================================= */}
        {isCreateProgramModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Plus className="w-5 h-5 text-kulkul-purple" />
                  <h2 className="text-lg font-extrabold text-slate-900">Launch New Program</h2>
                </div>
                <button
                  onClick={() => setIsCreateProgramModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createProgramMutation.mutate({
                    slug: newProgSlug.toLowerCase().trim(),
                    name: newProgName.trim(),
                    description: newProgDesc.trim(),
                    image_url: newProgImage.trim(),
                    enable_mcq: newProgEnableMCQ,
                    enable_ai_interview: newProgEnableAI,
                    logic_test_duration_minutes: newProgDuration,
                    logic_test_passing_score: newProgPassingScore,
                    allow_retake: false,
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Program Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AI Engineering Fellowship 2026"
                    value={newProgName}
                    onChange={(e) => {
                      setNewProgName(e.target.value);
                      if (!newProgSlug) {
                        setNewProgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    URL Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ai2026"
                    value={newProgSlug}
                    onChange={(e) => setNewProgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Overview of the program, requirements, and cohort dates..."
                    value={newProgDesc}
                    onChange={(e) => setNewProgDesc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Cover Banner Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={newProgImage}
                    onChange={(e) => setNewProgImage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      id="mcqToggle"
                      checked={newProgEnableMCQ}
                      onChange={(e) => setNewProgEnableMCQ(e.target.checked)}
                      className="w-4 h-4 text-kulkul-purple rounded"
                    />
                    <label htmlFor="mcqToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Enable MCQ Test
                    </label>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      id="aiToggle"
                      checked={newProgEnableAI}
                      onChange={(e) => setNewProgEnableAI(e.target.checked)}
                      className="w-4 h-4 text-kulkul-orange rounded"
                    />
                    <label htmlFor="aiToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Enable AI Interview
                    </label>
                  </div>
                </div>

                {newProgEnableMCQ && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                        MCQ Duration (Mins)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={newProgDuration}
                        onChange={(e) => setNewProgDuration(parseInt(e.target.value) || 30)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                        Passing Score (%)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={newProgPassingScore}
                        onChange={(e) => setNewProgPassingScore(parseInt(e.target.value) || 70)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateProgramModalOpen(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createProgramMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition"
                  >
                    {createProgramMutation.isPending ? <span>Creating...</span> : <span>Create Program</span>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* DRAWER: APPLICANT INSPECTION DRAWER */}
        {/* ================================================================================= */}
        {selectedApplicantId && (
          <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-extrabold text-slate-900">
                      {applicantDetail?.applicant.full_name || 'Candidate Details'}
                    </h2>
                    {applicantDetail && renderStageBadge(applicantDetail.applicant.current_stage)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{applicantDetail?.applicant.email}</p>
                </div>

                <button
                  onClick={() => setSelectedApplicantId(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Tabs */}
              <div className="flex border-b border-slate-200 bg-white px-6">
                <button
                  onClick={() => setActiveDrawerTab('answers')}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
                    activeDrawerTab === 'answers'
                      ? 'border-kulkul-purple text-kulkul-purple'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  MCQ Answer Sheet
                </button>

                <button
                  onClick={() => setActiveDrawerTab('ai')}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
                    activeDrawerTab === 'ai'
                      ? 'border-kulkul-purple text-kulkul-purple'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  AI Interview Transcript & Summary
                </button>

                <button
                  onClick={() => setActiveDrawerTab('profile')}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
                    activeDrawerTab === 'profile'
                      ? 'border-kulkul-purple text-kulkul-purple'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Candidate Profile
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isDetailLoading ? (
                  <div className="text-center py-12 text-slate-400">Loading details...</div>
                ) : activeDrawerTab === 'answers' ? (
                  applicantDetail?.submission ? (
                    <div className="space-y-6">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-slate-500">Overall Score</div>
                          <div
                            className={`text-2xl font-black ${
                              applicantDetail.submission.passed ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {applicantDetail.submission.total_score}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Benchmark</div>
                          <div className="text-sm font-bold text-slate-700">70% to pass</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Time Taken</div>
                          <div className="text-sm font-bold text-slate-700">
                            {Math.round(applicantDetail.submission.time_spent_seconds / 60)} minutes
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {applicantDetail.submission.answers?.map((ans, idx) => (
                          <div
                            key={ans.question_id || idx}
                            className={`p-4 rounded-2xl border ${
                              ans.is_correct
                                ? 'bg-emerald-50/30 border-emerald-200'
                                : 'bg-red-50/30 border-red-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-2xs font-bold text-slate-500 uppercase">
                                Question {idx + 1} &middot; {ans.category}
                              </span>
                              <span
                                className={`text-2xs font-extrabold px-2 py-0.5 rounded-full ${
                                  ans.is_correct
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {ans.is_correct ? `+${ans.points_awarded || 10} pts` : '0 pts'}
                              </span>
                            </div>

                            <p className="text-sm font-bold text-slate-900 mb-3">{ans.question_text}</p>

                            <div className="text-xs space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-500">Selected Answer:</span>
                                <span
                                  className={`font-bold ${
                                    ans.is_correct ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  Option {ans.selected_option_id?.toUpperCase()}
                                </span>
                              </div>

                              {!ans.is_correct && (
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-500">Correct Answer:</span>
                                  <span className="font-bold text-emerald-700">
                                    Option {ans.correct_option_id?.toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">No test submission recorded yet.</div>
                  )
                ) : activeDrawerTab === 'ai' ? (
                  applicantDetail?.ai_interview ? (
                    <div className="space-y-6">
                      {applicantDetail.ai_interview.summary_evaluation && (
                        <div className="stitch-card bg-purple-50/50 p-5 border border-purple-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase text-purple-900 tracking-wider">
                              AI Screening Scorecard
                            </span>
                            <span className="text-sm font-extrabold text-purple-900 bg-purple-100 px-3 py-0.5 rounded-full">
                              Score: {applicantDetail.ai_interview.summary_evaluation.overall_score}/100
                            </span>
                          </div>
                          <p className="text-xs text-purple-950 leading-relaxed font-medium">
                            {applicantDetail.ai_interview.summary_evaluation.executive_summary}
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Dialogue Transcript
                        </h4>
                        {applicantDetail.ai_interview.transcript?.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3.5 rounded-2xl text-xs space-y-1 ${
                              msg.role === 'ai'
                                ? 'bg-slate-100 text-slate-900 mr-8'
                                : 'bg-kulkul-purple text-white ml-8'
                            }`}
                          >
                            <span
                              className={`text-2xs font-extrabold uppercase block ${
                                msg.role === 'ai' ? 'text-kulkul-purple' : 'text-kulkul-orange'
                              }`}
                            >
                              {msg.role === 'ai' ? 'AI Interviewer' : 'Candidate'}
                            </span>
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      Candidate has not started the AI interview yet.
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                      <div>
                        <span className="text-slate-400 block font-medium">Full Name</span>
                        <span className="font-bold text-slate-900 text-sm">{applicantDetail?.applicant.full_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Email Address</span>
                        <span className="font-bold text-slate-900">{applicantDetail?.applicant.email}</span>
                      </div>
                      {applicantDetail?.applicant.phone && (
                        <div>
                          <span className="text-slate-400 block font-medium">Phone</span>
                          <span className="font-bold text-slate-900">{applicantDetail.applicant.phone}</span>
                        </div>
                      )}
                      {applicantDetail?.applicant.github_url && (
                        <div>
                          <span className="text-slate-400 block font-medium">GitHub</span>
                          <a
                            href={applicantDetail.applicant.github_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-kulkul-purple hover:underline font-bold"
                          >
                            {applicantDetail.applicant.github_url}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">Decision Stage</span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateStageMutation.mutate({
                        applicantId: selectedApplicantId,
                        stage: 'rejected',
                      })
                    }
                    className="px-4 py-2 rounded-full bg-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-700 text-xs font-bold transition"
                  >
                    Reject
                  </button>

                  <button
                    onClick={() =>
                      updateStageMutation.mutate({
                        applicantId: selectedApplicantId,
                        stage: 'approved_for_live',
                      })
                    }
                    className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept Candidate</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
