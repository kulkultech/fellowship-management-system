import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, type CreateProgramPayload, type CreateTrackPayload } from '@/services/adminService';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { MCQQuestion, Track, ApplicationStageItem } from '@/services/types';
import {
  Users,
  Search,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  ExternalLink,
  Check,
  Plus,
  Clock,
  Calendar,
  Copy,
  Building2,
  ListOrdered,
  Trash2,
  HelpCircle,
  Bot,
  Layers,
  Award,
  Edit3,
  FileText,
  Workflow,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_STAGES: ApplicationStageItem[] = [
  {
    step_number: 1,
    title: 'Specialization Track & Intake Application',
    description: 'Choose your target specialization track and submit your academic background, IT major, and contact details.',
  },
  {
    step_number: 2,
    title: 'Track-Specific Timed Logic Assessment',
    description: 'Solve timed logic and technical domain MCQs calibrated for your chosen specialization track.',
  },
  {
    step_number: 3,
    title: 'Conversational AI Technical Screen',
    description: 'Engage in an interactive conversational AI screening session evaluating technical depth and problem-solving.',
  },
  {
    step_number: 4,
    title: 'Submission & Application Confirmation Email',
    description: 'Candidate completes submission and receives an official application confirmation email.',
  },
  {
    step_number: 5,
    title: 'Admissions Committee Review & Scoring',
    description: 'The reviewer committee evaluates combined MCQ scores, AI transcripts, and candidate qualifications.',
  },
  {
    step_number: 6,
    title: 'Approval & Final Interview Scheduling',
    description: 'Approved candidates receive an official fellowship invitation and link to schedule their final interview with the host organization.',
  },
];

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';

  // Navigation View: 'programs' | 'pipeline' | 'stages' | 'companies' | 'questions'
  const [currentView, setCurrentView] = useState<'programs' | 'pipeline' | 'stages' | 'companies' | 'questions'>('programs');

  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'answers' | 'ai' | 'profile'>('answers');

  // Modals
  const [isCreateProgramModalOpen, setIsCreateProgramModalOpen] = useState(false);
  const [isQuestionBuilderOpen, setIsQuestionBuilderOpen] = useState(false);
  const [isCreateTrackModalOpen, setIsCreateTrackModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
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

  // Load Active Program Details
  const { data: programData } = useQuery({
    queryKey: ['program', orgSlug, activeProgramSlug],
    queryFn: () => programService.getProgram(orgSlug, activeProgramSlug),
  });

  const program = programData?.program;
  const programId = program?.id;

  // Load Program Tracks
  const { data: programTracks = [], refetch: refetchTracks } = useQuery({
    queryKey: ['admin-program-tracks', programId],
    queryFn: () => (programId ? adminService.listProgramTracks(programId) : Promise.resolve([])),
    enabled: !!programId,
  });

  // Selected Track for Question Builder (defaults to first track if available)
  const [selectedTrackIdForQuestions, setSelectedTrackIdForQuestions] = useState<string>('');

  React.useEffect(() => {
    if (programTracks.length > 0 && !selectedTrackIdForQuestions) {
      setSelectedTrackIdForQuestions(programTracks[0].id);
    }
  }, [programTracks, selectedTrackIdForQuestions]);



  // Load MCQ Question Bank (Track-specific or Program fallback)
  const { data: trackQuestionBank = [], refetch: refetchTrackQuestions } = useQuery({
    queryKey: ['admin-track-questions', selectedTrackIdForQuestions],
    queryFn: () =>
      selectedTrackIdForQuestions
        ? adminService.listTrackQuestions(selectedTrackIdForQuestions)
        : programId
        ? adminService.listProgramQuestions(programId)
        : Promise.resolve([]),
    enabled: !!selectedTrackIdForQuestions || !!programId,
  });

  // Local Editable Question Bank State (Google Form Style)
  const [editingQuestions, setEditingQuestions] = useState<MCQQuestion[]>([]);

  React.useEffect(() => {
    if (trackQuestionBank.length > 0) {
      setEditingQuestions(JSON.parse(JSON.stringify(trackQuestionBank)));
    } else {
      setEditingQuestions([]);
    }
  }, [trackQuestionBank, selectedTrackIdForQuestions]);

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

  // Track Form State (Create / Edit)
  const [trackForm, setTrackForm] = useState<CreateTrackPayload>({
    name: '',
    slug: '',
    description: '',
    enable_mcq: true,
    logic_test_duration_minutes: 35,
    logic_test_passing_score: 70,
    allow_retake: false,
    enable_ai_interview: true,
    ai_interview_instructions: '',
    ai_interview_questions: [
      'Describe a challenging project you built in this domain.',
      'How do you approach debugging complex edge-cases and performance bottlenecks?',
    ],
  });

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

  const saveQuestionsMutation = useMutation({
    mutationFn: (questions: MCQQuestion[]) =>
      selectedTrackIdForQuestions
        ? adminService.saveTrackQuestions(selectedTrackIdForQuestions, questions)
        : adminService.saveProgramQuestions(programId!, questions),
    onSuccess: () => {
      toast.success('Question bank saved successfully!');
      refetchTrackQuestions();
      refetchTracks();
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
      setNewProgSlug('');
      setNewProgName('');
      setNewProgDesc('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create program');
    },
  });

  // Track Mutations
  const createTrackMutation = useMutation({
    mutationFn: (payload: CreateTrackPayload) => adminService.createProgramTrack(programId!, payload),
    onSuccess: (newTrack) => {
      toast.success(`Track "${newTrack.name}" created successfully!`);
      refetchTracks();
      setIsCreateTrackModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create track');
    },
  });

  // Application Stages local state
  const [editableStages, setEditableStages] = useState<ApplicationStageItem[]>(DEFAULT_STAGES);

  useEffect(() => {
    if (program?.application_stages && program.application_stages.length > 0) {
      setEditableStages(program.application_stages);
    } else {
      setEditableStages(DEFAULT_STAGES);
    }
  }, [program]);

  const updateStagesMutation = useMutation({
    mutationFn: (stages: ApplicationStageItem[]) => {
      if (!programId) throw new Error('No program selected');
      return adminService.updateProgramStages(programId, stages);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program', orgSlug, activeProgramSlug] });
      toast.success('Application & assessment stages updated successfully!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save application stages');
    },
  });

  const handleStageChange = (index: number, field: 'title' | 'description', value: string) => {
    setEditableStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleMoveStageUp = (index: number) => {
    if (index <= 0) return;
    setEditableStages((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next.map((item, idx) => ({ ...item, step_number: idx + 1 }));
    });
  };

  const handleMoveStageDown = (index: number) => {
    if (index >= editableStages.length - 1) return;
    setEditableStages((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next.map((item, idx) => ({ ...item, step_number: idx + 1 }));
    });
  };

  const handleAddStage = () => {
    setEditableStages((prev) => [
      ...prev,
      {
        step_number: prev.length + 1,
        title: 'New Fellowship Stage',
        description: 'Provide instructions or details for candidates in this stage.',
      },
    ]);
  };

  const handleDeleteStage = (index: number) => {
    if (editableStages.length <= 1) {
      toast.error('Must have at least 1 stage in the program funnel.');
      return;
    }
    setEditableStages((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, step_number: idx + 1 }))
    );
  };

  const handleResetStages = () => {
    setEditableStages(DEFAULT_STAGES);
    toast.success('Reset stages to standard fellowship flow.');
  };

  const updateTrackMutation = useMutation({
    mutationFn: ({ trackId, payload }: { trackId: string; payload: CreateTrackPayload }) =>
      adminService.updateTrack(trackId, payload),
    onSuccess: (updated) => {
      toast.success(`Track "${updated.name}" updated!`);
      refetchTracks();
      setEditingTrack(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update track');
    },
  });

  const deleteTrackMutation = useMutation({
    mutationFn: (trackId: string) => adminService.deleteTrack(trackId),
    onSuccess: () => {
      toast.success('Track removed');
      refetchTracks();
    },
    onError: () => toast.error('Failed to delete track'),
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
    const matchesSearch =
      a.full_name.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query) ||
      a.current_stage.toLowerCase().includes(query);
    const matchesTrack = selectedTrackFilter ? a.track_id === selectedTrackFilter : true;
    return matchesSearch && matchesTrack;
  });

  // Question manipulation in Google Form builder
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

  const activeTrackObj = programTracks.find((t) => t.id === selectedTrackIdForQuestions);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar title="FellowHire Dashboard" subtitle="Company & Talent Operations" showAdminNav={true} />

      <main className="flex-1 max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header & Dynamic Company Workspace Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          {currentView === 'programs' ? (
            /* Header for All Programs Directory */
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Fellowship & Scholarship Programs
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreateProgramModalOpen(true)}
                  className="px-5 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs sm:text-sm font-bold shadow-md transition flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-kulkul-orange" />
                  <span>Create New Program</span>
                </button>
              </div>
            </div>
          ) : (
            /* Header for Selected Program Detail View */
            <div className="space-y-3">
              {/* Breadcrumb Bar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentView('programs')}
                  className="text-xs font-bold text-kulkul-purple hover:text-kulkul-orange transition flex items-center gap-1 group"
                >
                  <ChevronLeft className="w-4 h-4 transition group-hover:-translate-x-0.5" />
                  <span>All Programs</span>
                </button>
                <span className="text-slate-300">/</span>
                <span className="text-xs font-bold text-slate-800">{program?.name || activeProgramSlug}</span>
              </div>

              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {program?.name || 'Fellowship Assessment Pipeline'}
                  </h1>
                </div>

                {/* Right: Quick Action Controls */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  {/* Program Switcher */}
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
                        <span>Copy Program Link</span>
                      </>
                    )}
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
            </div>
          )}

          {/* Top Tabs Bar */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 flex-wrap gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCurrentView('programs')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  currentView === 'programs'
                    ? 'bg-kulkul-purple text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Programs ({allPrograms.length})</span>
              </button>

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
                onClick={() => setCurrentView('stages')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  currentView === 'stages'
                    ? 'bg-kulkul-purple text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>Application Stages ({editableStages.length})</span>
              </button>

              <button
                onClick={() => {
                  setIsQuestionBuilderOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition flex items-center gap-2"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Track Question Banks</span>
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
        {/* VIEW 0: ALL PROGRAMS TABULAR DIRECTORY */}
        {/* ================================================================================= */}
        {currentView === 'programs' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-kulkul-purple" />
                    <span>Active Fellowship Cohorts</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a program from the table below to inspect its specialization tracks, question banks, and candidate evaluations.
                  </p>
                </div>

                <span className="text-xs font-bold px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-700">
                  {allPrograms.length} {allPrograms.length === 1 ? 'Program' : 'Programs'} Hosted
                </span>
              </div>

              {allPrograms.length === 0 ? (
                <div className="stitch-card p-12 bg-white text-center">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-700">No programs created yet</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Create your first fellowship program to host multiple specialization tracks and candidate assessments.
                  </p>
                  <button
                    onClick={() => setIsCreateProgramModalOpen(true)}
                    className="px-5 py-2 rounded-full bg-kulkul-purple text-white text-xs font-bold"
                  >
                    Create First Program
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse table-fixed min-w-[780px]">
                      <colgroup>
                        <col className="w-[28%]" />
                        <col className="w-[24%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                      <thead className="bg-slate-50/90 border-b border-slate-200/80 text-2xs uppercase tracking-wider text-slate-500 font-bold">
                        <tr>
                          <th className="py-3.5 px-6 font-bold">Program Details</th>
                          <th className="py-3.5 px-6 font-bold">Cohort Window</th>
                          <th className="py-3.5 px-6 font-bold">Tracks</th>
                          <th className="py-3.5 px-6 font-bold">Status</th>
                          <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {allPrograms.map((prog) => {
                          const isSelected = prog.slug === activeProgramSlug;
                          return (
                            <tr
                              key={prog.id}
                              className="hover:bg-slate-50/90 transition group cursor-pointer"
                              onClick={() => {
                                setActiveProgramSlug(prog.slug);
                                setCurrentView('pipeline');
                              }}
                            >
                              <td className="py-4 px-6 align-middle">
                                <div className="flex items-center gap-3.5">
                                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold text-base shrink-0 border border-kulkul-purple/20 overflow-hidden shadow-2xs">
                                    {prog.image_url ? (
                                      <img src={prog.image_url} alt={prog.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Layers className="w-5 h-5 text-kulkul-orange" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-extrabold text-slate-900 group-hover:text-kulkul-purple transition text-sm truncate flex items-center gap-2">
                                      <span className="truncate">{prog.name}</span>
                                      {isSelected && (
                                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20 shrink-0">
                                          Selected
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-2xs font-mono text-slate-400 mt-0.5">
                                      /{prog.slug}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-6 align-middle whitespace-nowrap text-xs text-slate-600">
                                <div className="font-semibold text-slate-800 flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                  <span>
                                    {new Date(prog.open_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} &ndash; {new Date(prog.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </span>
                                </div>
                              </td>

                              <td className="py-4 px-6 align-middle whitespace-nowrap text-left">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                                  <Layers className="w-3.5 h-3.5 text-kulkul-purple" />
                                  <span>{prog.tracks ? prog.tracks.length : (prog.slug === activeProgramSlug ? programTracks.length : '2')} Tracks</span>
                                </span>
                              </td>

                              <td className="py-4 px-6 align-middle whitespace-nowrap text-left">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  <span>Admissions Open</span>
                                </span>
                              </td>

                              <td className="py-4 px-6 align-middle text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setActiveProgramSlug(prog.slug);
                                      setCurrentView('pipeline');
                                    }}
                                    className="px-4 py-1.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-xs transition flex items-center gap-1"
                                  >
                                    <span>Manage</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-kulkul-orange" />
                                  </button>

                                  <a
                                    href={getPublicProgramUrl(prog.slug)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 transition"
                                    title="Open public overview page"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
        {/* VIEW: PROGRAM APPLICATION & ASSESSMENT STAGES */}
        {/* ================================================================================= */}
        {currentView === 'stages' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-kulkul-purple flex items-center gap-2">
                    <Workflow className="w-5 h-5 text-kulkul-orange" />
                    Application & Assessment Stages
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                    Configure the sequential candidate journey for <span className="font-bold text-slate-700">{program?.name || activeProgramSlug}</span>. These stages are publicly showcased to candidates on the program overview page.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={handleResetStages}
                    className="px-3.5 py-2 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition flex items-center gap-1.5"
                    title="Reset to default 6-stage flow"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </button>

                  <button
                    onClick={handleAddStage}
                    className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Stage</span>
                  </button>

                  <button
                    onClick={() => updateStagesMutation.mutate(editableStages)}
                    disabled={updateStagesMutation.isPending}
                    className="px-5 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{updateStagesMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Stage Items List */}
              <div className="space-y-4">
                {editableStages.map((stage, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200 hover:border-kulkul-purple/30 transition space-y-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-kulkul-purple text-white font-extrabold flex items-center justify-center text-xs shadow-sm">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Step 0{idx + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveStageUp(idx)}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveStageDown(idx)}
                          disabled={idx === editableStages.length - 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStage(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete Stage"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-2xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Stage Title
                        </label>
                        <input
                          type="text"
                          value={stage.title}
                          onChange={(e) => handleStageChange(idx, 'title', e.target.value)}
                          placeholder="e.g. Specialization Track & Intake Application"
                          className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-semibold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Description & Instructions
                        </label>
                        <textarea
                          rows={2}
                          value={stage.description}
                          onChange={(e) => handleStageChange(idx, 'description', e.target.value)}
                          placeholder="Explain what happens in this stage..."
                          className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-slate-700 leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Save Action */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 font-medium">
                  {editableStages.length} {editableStages.length === 1 ? 'stage' : 'stages'} configured for {program?.name || activeProgramSlug}
                </span>
                <button
                  onClick={() => updateStagesMutation.mutate(editableStages)}
                  disabled={updateStagesMutation.isPending}
                  className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-md transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{updateStagesMutation.isPending ? 'Saving Stages...' : 'Save Application Stages'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* VIEW: PROGRAM DETAIL (SPECIALIZATION TRACKS IN CARDS + CANDIDATE PIPELINE) */}
        {/* ================================================================================= */}
        {currentView === 'pipeline' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* 1. Specialization Tracks Cards Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-kulkul-purple" />
                    <span>Specialization Tracks for {program?.name}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Domain-specific specialization paths with calibrated logic MCQ benchmarks, question banks, and conversational AI screening.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setTrackForm({
                      name: '',
                      slug: '',
                      description: '',
                      enable_mcq: true,
                      logic_test_duration_minutes: 35,
                      logic_test_passing_score: 70,
                      allow_retake: false,
                      enable_ai_interview: true,
                      ai_interview_instructions: '',
                      ai_interview_questions: [
                        'What is your architectural philosophy when designing production systems?',
                        'How do you manage trade-offs between delivery speed and code reliability?',
                      ],
                    });
                    setIsCreateTrackModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-kulkul-orange" />
                  <span>Create Track</span>
                </button>
              </div>

              {programTracks.length === 0 ? (
                <div className="stitch-card p-8 bg-white text-center">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h3 className="font-bold text-slate-700 text-sm">No tracks added to this program yet</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-3">
                    Add specialization tracks (e.g. Fullstack, QA, Cloud) to give candidates tailored intake options.
                  </p>
                  <button
                    onClick={() => setIsCreateTrackModalOpen(true)}
                    className="px-4 py-1.5 rounded-full bg-kulkul-purple text-white text-xs font-bold"
                  >
                    Add First Track
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {programTracks.map((track) => (
                    <div
                      key={track.id}
                      className="stitch-card bg-white p-6 border border-slate-200 flex flex-col justify-between space-y-5 hover:border-kulkul-purple/40 hover:shadow-md transition"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-kulkul-purple text-white flex items-center justify-center font-black text-sm shadow-sm">
                              <Layers className="w-5 h-5 text-kulkul-orange" />
                            </div>
                            <div>
                              <h3 className="text-base font-extrabold text-slate-900 leading-tight">{track.name}</h3>
                              <span className="text-xs font-mono text-kulkul-purple">slug: {track.slug}</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2">
                          {track.description || 'Specialized fellowship track with tailored technical evaluations.'}
                        </p>

                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2 text-slate-700">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-kulkul-orange" />
                              Timed MCQ:
                            </span>
                            <strong className="text-slate-900">{track.logic_test_duration_minutes} Mins</strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Award className="w-3.5 h-3.5 text-emerald-600" />
                              Passing Mark:
                            </span>
                            <strong className="text-slate-900">{track.logic_test_passing_score}% Score</strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Bot className="w-3.5 h-3.5 text-kulkul-purple" />
                              AI Technical Screen:
                            </span>
                            <strong className="text-slate-900">
                              {track.enable_ai_interview ? 'Enabled' : 'Disabled'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedTrackIdForQuestions(track.id);
                            setIsQuestionBuilderOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-full bg-kulkul-purple-light hover:bg-kulkul-purple-subtle text-kulkul-purple text-xs font-bold transition flex items-center gap-1.5"
                          title="Edit MCQ questions for this track"
                        >
                          <ListOrdered className="w-3.5 h-3.5" />
                          <span>Questions</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingTrack(track);
                              setTrackForm({
                                name: track.name,
                                slug: track.slug,
                                description: track.description || '',
                                enable_mcq: track.enable_mcq,
                                logic_test_duration_minutes: track.logic_test_duration_minutes,
                                logic_test_passing_score: track.logic_test_passing_score,
                                allow_retake: track.allow_retake,
                                enable_ai_interview: track.enable_ai_interview,
                                ai_interview_instructions: track.ai_interview_instructions || '',
                                ai_interview_questions: track.ai_interview_questions || [],
                              });
                            }}
                            className="p-2 rounded-xl text-slate-500 hover:text-kulkul-purple hover:bg-slate-100 transition"
                            title="Edit Track Settings"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete track "${track.name}"?`)) {
                                deleteTrackMutation.mutate(track.id);
                              }
                            }}
                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete Track"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Candidate Pipeline Section */}
            <div className="space-y-4 pt-4 border-t border-slate-200/80">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-kulkul-purple" />
                  <span>Candidate Pipeline ({applicants.length})</span>
                </h2>
              </div>

              {/* Filter and Search Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search candidates by name, email, or stage..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                />
              </div>

              {/* Track & Stage Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 flex-wrap">
                {/* Track Selector Dropdown */}
                {programTracks.length > 0 && (
                  <select
                    value={selectedTrackFilter}
                    onChange={(e) => setSelectedTrackFilter(e.target.value)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  >
                    <option value="">All Tracks ({programTracks.length})</option>
                    {programTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        Track: {t.name}
                      </option>
                    ))}
                  </select>
                )}

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
                      <th className="px-6 py-4">Specialization Track</th>
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
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                          Loading candidates...
                        </td>
                      </tr>
                    ) : filteredApplicants.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
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
                          <td className="px-6 py-4">
                            {app.track_name ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
                                {app.track_name}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">General</span>
                            )}
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
                      MCQ Questionnaire Builder
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure custom questions, multiple choice options, correct answers, and points
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

              {/* Track Switcher in Question Builder */}
              {programTracks.length > 0 && (
                <div className="px-6 py-3 bg-kulkul-purple/5 border-b border-kulkul-purple/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-kulkul-purple" />
                    <span className="text-xs font-bold text-slate-700">Editing Questions For Track:</span>
                  </div>
                  <select
                    value={selectedTrackIdForQuestions}
                    onChange={(e) => setSelectedTrackIdForQuestions(e.target.value)}
                    className="px-3.5 py-1.5 text-xs font-extrabold rounded-full bg-white border border-kulkul-purple/30 text-kulkul-purple focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  >
                    {programTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} Track ({t.logic_test_duration_minutes}m limit &middot; {t.logic_test_passing_score}% pass)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Body: Question List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {editingQuestions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <HelpCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">No questions in this track test bank yet</p>
                    <p className="text-xs text-slate-400 mt-1">Click the button below to add your first question.</p>
                  </div>
                ) : (
                  editingQuestions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="stitch-card bg-slate-50/50 p-6 border border-slate-200 space-y-4 relative group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-kulkul-purple text-white text-2xs font-extrabold uppercase tracking-wider">
                            Question {qIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={q.category || 'Problem Solving'}
                            onChange={(e) => handleQuestionChange(qIdx, 'category', e.target.value)}
                            placeholder="Category (e.g. Algorithms, QA, SQL)"
                            className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-white border border-slate-200 text-slate-600 focus:outline-none focus:border-kulkul-purple"
                          />
                        </div>

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
                  Total Questions: <strong>{editingQuestions.length}</strong> {activeTrackObj ? `(for ${activeTrackObj.name})` : ''}
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
        {/* MODAL 2: CREATE / EDIT TRACK MODAL */}
        {/* ================================================================================= */}
        {(isCreateTrackModalOpen || editingTrack) && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-kulkul-purple" />
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {editingTrack ? `Edit Track: ${editingTrack.name}` : 'Create Specialization Track'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setIsCreateTrackModalOpen(false);
                    setEditingTrack(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingTrack) {
                    updateTrackMutation.mutate({ trackId: editingTrack.id, payload: trackForm });
                  } else {
                    createTrackMutation.mutate(trackForm);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Track Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cloud & DevOps Engineering"
                    value={trackForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setTrackForm((prev) => ({
                        ...prev,
                        name,
                        slug: prev.slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Track URL Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. devops"
                    value={trackForm.slug}
                    onChange={(e) => setTrackForm({ ...trackForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Track Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Focus areas, required skillsets, expectations..."
                    value={trackForm.description}
                    onChange={(e) => setTrackForm({ ...trackForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                {/* MCQ Duration & Passing Score */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                      Logic Test Duration (Mins)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={trackForm.logic_test_duration_minutes}
                      onChange={(e) => setTrackForm({ ...trackForm, logic_test_duration_minutes: parseInt(e.target.value) || 35 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
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
                      value={trackForm.logic_test_passing_score}
                      onChange={(e) => setTrackForm({ ...trackForm, logic_test_passing_score: parseInt(e.target.value) || 70 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                    />
                  </div>
                </div>

                {/* AI Interview Settings */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-kulkul-purple" />
                      Enable AI Technical Screen
                    </label>
                    <input
                      type="checkbox"
                      checked={trackForm.enable_ai_interview}
                      onChange={(e) => setTrackForm({ ...trackForm, enable_ai_interview: e.target.checked })}
                      className="w-4 h-4 text-kulkul-purple rounded"
                    />
                  </div>

                  {trackForm.enable_ai_interview && (
                    <div>
                      <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                        Track AI Interview Prompt / Questions (One per line)
                      </label>
                      <textarea
                        rows={3}
                        value={(trackForm.ai_interview_questions || []).join('\n')}
                        onChange={(e) =>
                          setTrackForm({
                            ...trackForm,
                            ai_interview_questions: e.target.value.split('\n').filter((q) => q.trim().length > 0),
                          })
                        }
                        placeholder="Enter domain-specific questions for the AI interviewer..."
                        className="w-full p-3 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateTrackModalOpen(false);
                      setEditingTrack(null);
                    }}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTrackMutation.isPending || updateTrackMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition"
                  >
                    {createTrackMutation.isPending || updateTrackMutation.isPending ? (
                      <span>Saving...</span>
                    ) : (
                      <span>{editingTrack ? 'Save Changes' : 'Create Track'}</span>
                    )}
                  </button>
                </div>
              </form>
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
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-extrabold text-slate-900">
                      {applicantDetail?.applicant.full_name || 'Candidate Details'}
                    </h2>
                    {applicantDetail?.track && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
                        {applicantDetail.track.name} Track
                      </span>
                    )}
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
                  applicantDetail?.ai_screen ? (
                    <div className="space-y-6">
                      {applicantDetail.ai_screen.summary_evaluation && (
                        <div className="stitch-card bg-purple-50/50 p-5 border border-purple-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase text-purple-900 tracking-wider">
                              AI Screening Scorecard
                            </span>
                            <span className="text-sm font-extrabold text-purple-900 bg-purple-100 px-3 py-0.5 rounded-full">
                              Score: {applicantDetail.ai_screen.summary_evaluation.overall_score}/100
                            </span>
                          </div>
                          <p className="text-xs text-purple-950 leading-relaxed font-medium">
                            {applicantDetail.ai_screen.summary_evaluation.executive_summary}
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Dialogue Transcript
                        </h4>
                        {applicantDetail.ai_screen.transcript?.map((msg, idx) => (
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
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
                      <div className="border-b border-slate-200 pb-2">
                        <span className="text-2xs font-extrabold uppercase text-kulkul-purple tracking-wider">
                          Candidate Intake Profile
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <span className="text-slate-400 block font-medium">Full Name</span>
                          <span className="font-bold text-slate-900 text-sm">
                            {applicantDetail?.applicant.full_name ||
                              `${applicantDetail?.applicant.first_name || ''} ${applicantDetail?.applicant.last_name || ''}`}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block font-medium">Date of Birth</span>
                          <span className="font-bold text-slate-900">
                            {applicantDetail?.applicant.date_of_birth || '-'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block font-medium">Email Address</span>
                          <a
                            href={`mailto:${applicantDetail?.applicant.email}`}
                            className="font-bold text-kulkul-purple hover:underline"
                          >
                            {applicantDetail?.applicant.email}
                          </a>
                        </div>

                        <div>
                          <span className="text-slate-400 block font-medium">Phone Number</span>
                          <span className="font-bold text-slate-900">
                            {applicantDetail?.applicant.phone || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3 space-y-3">
                        <span className="text-2xs font-extrabold uppercase text-slate-500 tracking-wider">
                          Academic Background
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div className="sm:col-span-2">
                            <span className="text-slate-400 block font-medium">University Name</span>
                            <span className="font-bold text-slate-900">
                              {applicantDetail?.applicant.university || '-'}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-400 block font-medium">Current Major (IT)</span>
                            <span className="font-bold text-slate-900">
                              {applicantDetail?.applicant.major || '-'}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-400 block font-medium">Current Semester</span>
                            <span className="font-bold text-slate-900">
                              {applicantDetail?.applicant.semester || '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3 space-y-3">
                        <span className="text-2xs font-extrabold uppercase text-slate-500 tracking-wider">
                          Program & Scholarship Details
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <span className="text-slate-400 block font-medium">Chosen Course / Track</span>
                            <span className="font-extrabold text-kulkul-purple">
                              {applicantDetail?.track?.name || 'Full Stack Developer'}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-400 block font-medium">How did you hear about us?</span>
                            <span className="font-bold text-slate-900">
                              {applicantDetail?.applicant.referral_source || '-'}
                            </span>
                          </div>

                          {applicantDetail?.applicant.linkedin_url && (
                            <div className="sm:col-span-2">
                              <span className="text-slate-400 block font-medium">LinkedIn Profile</span>
                              <a
                                href={applicantDetail.applicant.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-kulkul-purple hover:underline font-bold"
                              >
                                {applicantDetail.applicant.linkedin_url}
                              </a>
                            </div>
                          )}

                          {applicantDetail?.applicant.resume_url && (
                            <div className="sm:col-span-2">
                              <span className="text-slate-400 block font-medium">Resume / CV</span>
                              <a
                                href={applicantDetail.applicant.resume_url}
                                download="resume.pdf"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-kulkul-purple hover:underline mt-0.5"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Download / View Submitted Resume</span>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
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
      <Footer />
    </div>
  );
};
