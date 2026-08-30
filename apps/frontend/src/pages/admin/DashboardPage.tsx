import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, type UpdateProgramConfigPayload, type CreateProgramPayload } from '@/services/adminService';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import {
  Users,
  Search,
  CheckCircle2,
  ChevronRight,
  Award,
  X,
  ThumbsDown,
  ExternalLink,
  Github,
  Linkedin,
  FileText,
  Mail,
  Phone,
  Terminal,
  Check,
  Sliders,
  Plus,
  Clock,
  ShieldCheck,
  Share2,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'answers' | 'ai' | 'profile'>('answers');

  // Program Settings & Create Program Modals
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isCreateProgramModalOpen, setIsCreateProgramModalOpen] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // Selected Program Slug for Dashboard
  const [activeProgramSlug, setActiveProgramSlug] = useState('lit2026');

  // Load All Programs
  const { data: allPrograms = [] } = useQuery({
    queryKey: ['admin-all-programs'],
    queryFn: () => adminService.listPrograms(),
  });

  // Load Program Details
  const { data: programData } = useQuery({
    queryKey: ['program', 'rsa', activeProgramSlug],
    queryFn: () => programService.getProgram('rsa', activeProgramSlug),
  });

  const program = programData?.program;
  const programId = program?.id;

  // Program Config State (Passing Grade & Duration)
  const [configDuration, setConfigDuration] = useState<number>(30);
  const [configPassingScore, setConfigPassingScore] = useState<number>(70);
  const [configAllowRetake, setConfigAllowRetake] = useState<boolean>(false);

  // Sync config state when program loads
  React.useEffect(() => {
    if (program) {
      setConfigDuration(program.logic_test_duration_minutes);
      setConfigPassingScore(program.logic_test_passing_score);
      setConfigAllowRetake(program.allow_retake);
    }
  }, [program]);

  // Create Program Form State
  const [newProgSlug, setNewProgSlug] = useState('');
  const [newProgName, setNewProgName] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgImage, setNewProgImage] = useState('https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80');
  const [newProgDuration, setNewProgDuration] = useState(30);
  const [newProgPassingScore, setNewProgPassingScore] = useState(70);
  const [newProgAllowRetake, setNewProgAllowRetake] = useState(false);

  const getPublicProgramUrl = (slug: string = activeProgramSlug) => {
    return `${window.location.origin}/programs/rsa/${slug}`;
  };

  const handleCopyProgramLink = (slug: string = activeProgramSlug) => {
    const url = getPublicProgramUrl(slug);
    navigator.clipboard.writeText(url);
    setIsLinkCopied(true);
    toast.success('Shareable program link copied to clipboard!');
    setTimeout(() => setIsLinkCopied(false), 2500);
  };

  // Load Applicants list
  const { data: applicants = [], isLoading: isListLoading } = useQuery({
    queryKey: ['admin-applicants', programId, selectedStage],
    queryFn: () => adminService.listApplicants(programId!, selectedStage),
    enabled: !!programId,
  });

  // Load Selected Applicant Details for Drawer
  const { data: applicantDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['admin-applicant-detail', selectedApplicantId],
    queryFn: () => adminService.getApplicantDetails(selectedApplicantId!),
    enabled: !!selectedApplicantId,
  });

  // Update Program Config Mutation
  const updateConfigMutation = useMutation({
    mutationFn: (payload: UpdateProgramConfigPayload) =>
      adminService.updateProgramConfig(programId!, payload),
    onSuccess: () => {
      toast.success('Program configuration updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['program', 'rsa', activeProgramSlug] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setIsConfigModalOpen(false);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to update settings';
      toast.error(msg);
    },
  });

  // Create Program Mutation
  const createProgramMutation = useMutation({
    mutationFn: (payload: CreateProgramPayload) => adminService.createProgram(payload),
    onSuccess: (res) => {
      toast.success(`Program "${res.name}" created successfully!`);
      setIsCreateProgramModalOpen(false);
      setNewProgSlug('');
      setNewProgName('');
      setNewProgDesc('');
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setActiveProgramSlug(res.slug);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to create program';
      toast.error(msg);
    },
  });

  // Decision Mutation (Approve / Reject)
  const decisionMutation = useMutation({
    mutationFn: ({
      applicantId,
      action,
      notes,
    }: {
      applicantId: string;
      action: 'approve' | 'reject';
      notes?: string;
    }) => adminService.makeDecision(applicantId, action, notes),
    onSuccess: (_, variables) => {
      const isApproved = variables.action === 'approve';
      toast.success(
        isApproved
          ? 'Candidate approved for Final Live Interview!'
          : 'Candidate marked as rejected.'
      );
      queryClient.invalidateQueries({ queryKey: ['admin-applicants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-applicant-detail', selectedApplicantId] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to record decision';
      toast.error(msg);
    },
  });

  // Filter applicants by search query
  const filteredApplicants = applicants.filter((app) => {
    const q = searchQuery.toLowerCase();
    return (
      app.full_name.toLowerCase().includes(q) ||
      app.email.toLowerCase().includes(q) ||
      app.current_stage.toLowerCase().includes(q)
    );
  });

  // Calculate Pipeline Metrics
  const totalCount = applicants.length;
  const passedMCQCount = applicants.filter((a) => !!a.mcq_passed).length;
  const aiScreenedCount = applicants.filter((a) => (a.ai_score ?? 0) > 0).length;
  const approvedCount = applicants.filter((a) => a.current_stage === 'interview_approved').length;

  const renderStageBadge = (stage: string) => {
    switch (stage) {
      case 'applied':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Intake Applied
          </span>
        );
      case 'test_in_progress':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-stitch-blue border border-blue-200">
            Test In Progress
          </span>
        );
      case 'test_completed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
            Test Completed
          </span>
        );
      case 'ai_interview_invited':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            AI Interview Invited
          </span>
        );
      case 'ai_interview_completed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            AI Screen Completed
          </span>
        );
      case 'interview_approved':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
            Approved for Live Panel
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {stage}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        title="Reviewer Dashboard"
        subtitle="Remote Skills Academy Selection Pipeline"
        showAdminNav={true}
      />

      <main className="flex-1 max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 space-y-8">
        {/* Top Header & Program Configuration Action Bar */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-kulkul-purple text-white text-2xs font-bold uppercase tracking-wider">
                  Active Program
                </span>
                <span className="text-xs text-slate-500 font-medium">Remote Skills Academy (RSA)</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-kulkul-purple">
                {program?.name || 'LIT 2026 Fellowship & Assessment'}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                  <Clock className="w-3.5 h-3.5 text-kulkul-orange" />
                  <span>Duration: <strong>{program?.logic_test_duration_minutes ?? 30} mins</strong></span>
                </span>
                <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                  <Award className="w-3.5 h-3.5 text-stitch-green" />
                  <span>Passing Grade: <strong>{program?.logic_test_passing_score ?? 70}%</strong></span>
                </span>
                <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-kulkul-purple" />
                  <span>Retakes: <strong>{program?.allow_retake ? 'Allowed' : '1-Time Only'}</strong></span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-kulkul-purple bg-kulkul-purple-light hover:bg-kulkul-purple-subtle border border-kulkul-purple/20 transition shadow-sm"
              >
                <Sliders className="w-4 h-4 text-kulkul-orange" />
                <span>Configure Settings</span>
              </button>

              <button
                onClick={() => setIsCreateProgramModalOpen(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover transition shadow-sm"
              >
                <Plus className="w-4 h-4 text-kulkul-orange" />
                <span>New Program</span>
              </button>
            </div>
          </div>

          {/* Shareable Job Post Banner Bar */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-kulkul-purple text-white flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4 text-kulkul-orange" />
              </div>
              <div className="min-w-0">
                <div className="text-2xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <span>Candidate Application Link (Public Job Post)</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-3xs font-black">Live</span>
                </div>
                <div className="text-xs font-mono font-bold text-kulkul-purple truncate mt-0.5">
                  {getPublicProgramUrl(program?.slug || 'lit2026')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleCopyProgramLink(program?.slug || 'lit2026')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition active:scale-95"
              >
                {isLinkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Share Link</span>
                  </>
                )}
              </button>

              <a
                href={getPublicProgramUrl(program?.slug || 'lit2026')}
                target="_blank"
                rel="noreferrer"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-2xs transition"
              >
                <span>View Job Post</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Program Cohort Switcher (if multiple programs exist) */}
          {allPrograms.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">Switch Cohort:</span>
              {allPrograms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProgramSlug(p.slug)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${
                    activeProgramSlug === p.slug
                      ? 'bg-kulkul-purple text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Applicants</span>
              <Users className="w-5 h-5 text-kulkul-purple" />
            </div>
            <div className="text-3xl font-black text-slate-900">{totalCount}</div>
            <div className="text-xs text-slate-500 mt-1">Registered candidates</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Passed Logic MCQ</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-3xl font-black text-emerald-600">{passedMCQCount}</div>
            <div className="text-xs text-slate-500 mt-1">&ge; {program?.logic_test_passing_score ?? 70}% passing benchmark</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Technical Screened</span>
              <Terminal className="w-5 h-5 text-kulkul-orange" />
            </div>
            <div className="text-3xl font-black text-kulkul-orange">{aiScreenedCount}</div>
            <div className="text-xs text-slate-500 mt-1">AI sessions completed</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Approved for Live</span>
              <Award className="w-5 h-5 text-stitch-blue" />
            </div>
            <div className="text-3xl font-black text-kulkul-purple">{approvedCount}</div>
            <div className="text-xs text-slate-500 mt-1">Live interview pool</div>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search candidate name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-full shadow-sm focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
            />
          </div>

          {/* Stage Dropdown */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
              Filter Stage:
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold border border-slate-300 rounded-full bg-white shadow-sm focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
            >
              <option value="">All Pipeline Stages</option>
              <option value="applied">Intake Applied</option>
              <option value="test_in_progress">Test In Progress</option>
              <option value="test_completed">Test Completed</option>
              <option value="ai_interview_invited">Screen Invited</option>
              <option value="ai_interview_completed">Screen Completed</option>
              <option value="interview_approved">Approved for Live</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Applicant Pipeline Table */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-4 px-6">Candidate Name & Email</th>
                  <th className="py-4 px-6">Stage</th>
                  <th className="py-4 px-6 text-center">Logic MCQ</th>
                  <th className="py-4 px-6 text-center">AI Screen</th>
                  <th className="py-4 px-6">Applied Date</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {isListLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 font-medium">
                      Loading candidate records...
                    </td>
                  </tr>
                ) : filteredApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No candidates found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredApplicants.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => setSelectedApplicantId(app.id)}
                      className="hover:bg-kulkul-purple-light/30 cursor-pointer transition"
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 text-base">{app.full_name}</div>
                        <div className="text-slate-500 text-xs mt-0.5">{app.email}</div>
                      </td>
                      <td className="py-4 px-6">{renderStageBadge(app.current_stage)}</td>
                      <td className="py-4 px-6 text-center">
                        {(app.mcq_score ?? 0) > 0 || app.mcq_passed ? (
                          <div className="inline-flex items-center gap-1 font-bold text-slate-900">
                            <span>{app.mcq_score}%</span>
                            {app.mcq_passed && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">--</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {(app.ai_score ?? 0) > 0 ? (
                          <span className="font-bold text-kulkul-purple bg-kulkul-purple-light px-3 py-1 rounded-full border border-kulkul-purple/20 text-xs">
                            {app.ai_score}/100
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">--</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600 text-xs">{app.created_at}</td>
                      <td className="py-4 px-6 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-kulkul-purple hover:text-kulkul-purple-hover">
                          <span>Inspect</span>
                          <ChevronRight className="w-4 h-4 text-kulkul-orange" />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL 1: PROGRAM CONFIGURATION MODAL */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-kulkul-purple/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-kulkul-purple text-white p-6 relative">
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kulkul-orange text-white text-xs font-bold uppercase tracking-wider mb-2">
                <Sliders className="w-3.5 h-3.5" />
                <span>Program Configuration</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Configure {program?.name}</h2>
              <p className="text-white/80 text-xs mt-1">
                Real-time passing benchmark, test duration, and retake policy.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateConfigMutation.mutate({
                  logic_test_duration_minutes: Number(configDuration),
                  logic_test_passing_score: Number(configPassingScore),
                  allow_retake: configAllowRetake,
                });
              }}
              className="p-6 sm:p-7 space-y-5"
            >
              {/* Test Duration */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Test Time Limit (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  required
                  value={configDuration}
                  onChange={(e) => setConfigDuration(Number(e.target.value))}
                  className="w-full px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Timer duration allocated for the logic assessment.</p>
              </div>

              {/* Passing Grade */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Passing Grade Threshold (%)
                </label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  required
                  value={configPassingScore}
                  onChange={(e) => setConfigPassingScore(Number(e.target.value))}
                  className="w-full px-4 py-2.5 text-base font-semibold border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Minimum score percentage required to trigger AI interview invitation.</p>
              </div>

              {/* Allow Retakes Toggle */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900">Allow Test Retakes</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {configAllowRetake ? 'Candidates may re-take the test' : 'Strict 1-attempt only (Recommended)'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={configAllowRetake}
                  onChange={(e) => setConfigAllowRetake(e.target.checked)}
                  className="w-5 h-5 accent-kulkul-purple rounded cursor-pointer"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="flex-1 py-3 rounded-full text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateConfigMutation.isPending}
                  className="flex-1 py-3 rounded-full text-sm font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow transition disabled:opacity-50"
                >
                  {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW PROGRAM MODAL */}
      {isCreateProgramModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-kulkul-purple/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-kulkul-purple text-white p-6 relative">
              <button
                onClick={() => setIsCreateProgramModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kulkul-orange text-white text-xs font-bold uppercase tracking-wider mb-2">
                <Plus className="w-3.5 h-3.5" />
                <span>New Cohort</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Create Assessment Program</h2>
              <p className="text-white/80 text-xs mt-1">
                Deploy a new fellowship or hiring program for RSA.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProgramMutation.mutate({
                  slug: newProgSlug.trim(),
                  name: newProgName.trim(),
                  description: newProgDesc.trim(),
                  image_url: newProgImage.trim(),
                  logic_test_duration_minutes: Number(newProgDuration),
                  logic_test_passing_score: Number(newProgPassingScore),
                  allow_retake: newProgAllowRetake,
                });
              }}
              className="p-6 sm:p-7 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Program Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RSA Cloud & DevOps Fellowship 2026"
                  value={newProgName}
                  onChange={(e) => {
                    setNewProgName(e.target.value);
                    if (!newProgSlug) {
                      setNewProgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                    }
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  URL Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cloud2026"
                  value={newProgSlug}
                  onChange={(e) => setNewProgSlug(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
                <p className="text-2xs text-slate-400 mt-1 font-mono">
                  Public post link: {window.location.origin}/programs/rsa/{newProgSlug || 'your-slug'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Program Description & Overview
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed description of the fellowship, learning track, expectations, and benefits..."
                  value={newProgDesc}
                  onChange={(e) => setNewProgDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Cover / Banner Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={newProgImage}
                  onChange={(e) => setNewProgImage(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none"
                />
                {/* Photo Presets */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-2xs text-slate-400 font-bold uppercase mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setNewProgImage('https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80')}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-2xs font-semibold text-slate-700 transition"
                  >
                    Tech Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProgImage('https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80')}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-2xs font-semibold text-slate-700 transition"
                  >
                    Cloud & Systems
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProgImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80')}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-2xs font-semibold text-slate-700 transition"
                  >
                    AI & Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProgImage('https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80')}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-2xs font-semibold text-slate-700 transition"
                  >
                    Fullstack
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Duration (Mins)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={newProgDuration}
                    onChange={(e) => setNewProgDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:border-kulkul-purple outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Pass Score (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={newProgPassingScore}
                    onChange={(e) => setNewProgPassingScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:border-kulkul-purple outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">Allow Retakes</div>
                  <div className="text-2xs text-slate-500">Enable multiple attempts for candidates</div>
                </div>
                <input
                  type="checkbox"
                  checked={newProgAllowRetake}
                  onChange={(e) => setNewProgAllowRetake(e.target.checked)}
                  className="w-4 h-4 accent-kulkul-purple rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateProgramModalOpen(false)}
                  className="flex-1 py-3 rounded-full text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProgramMutation.isPending}
                  className="flex-1 py-3 rounded-full text-sm font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow transition disabled:opacity-50"
                >
                  {createProgramMutation.isPending ? 'Deploying...' : 'Deploy Program & Job Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-out Candidate Inspection Drawer */}
      {selectedApplicantId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-kulkul-purple/50 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-extrabold text-kulkul-purple">
                    {applicantDetail?.applicant.full_name || 'Candidate Details'}
                  </h2>
                  {applicantDetail && renderStageBadge(applicantDetail.applicant.current_stage)}
                </div>
                <p className="text-sm text-slate-500 mt-1">{applicantDetail?.applicant.email}</p>
              </div>

              <button
                onClick={() => setSelectedApplicantId(null)}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 bg-white px-6">
              <button
                onClick={() => setActiveTab('answers')}
                className={`py-3 px-4 text-sm font-bold border-b-2 transition ${
                  activeTab === 'answers'
                    ? 'border-kulkul-purple text-kulkul-purple'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Itemized Answer Sheet
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`py-3 px-4 text-sm font-bold border-b-2 transition ${
                  activeTab === 'ai'
                    ? 'border-kulkul-purple text-kulkul-purple'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                AI Screen Review
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-3 px-4 text-sm font-bold border-b-2 transition ${
                  activeTab === 'profile'
                    ? 'border-kulkul-purple text-kulkul-purple'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Intake Profile & CV
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              {isDetailLoading || !applicantDetail ? (
                <div className="py-20 text-center text-slate-500 font-medium">
                  Loading detailed scorecard & transcript...
                </div>
              ) : (
                <>
                  {/* TAB 1: ITEMIZED ANSWER SHEET */}
                  {activeTab === 'answers' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Logic MCQ Grade
                          </div>
                          <div className="text-2xl font-black text-kulkul-purple">
                            {applicantDetail.submission?.total_score || 0}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Benchmark Result
                          </div>
                          <div className="text-sm font-bold text-emerald-700 mt-1">
                            {applicantDetail.submission?.passed ? 'Benchmark Achieved' : 'Below Benchmark'}
                          </div>
                        </div>
                      </div>

                      {applicantDetail.itemized_answers && applicantDetail.itemized_answers.length > 0 ? (
                        applicantDetail.itemized_answers.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700 uppercase tracking-wider">
                                Question {idx + 1} &middot; {item.category}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                  item.is_correct
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-red-50 text-red-800 border border-red-200'
                                }`}
                              >
                                {item.is_correct ? 'Correct' : 'Incorrect'}
                              </span>
                            </div>

                            <p className="text-base font-bold text-slate-900 leading-snug">
                              {item.question_text}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                              <div
                                className={`p-3 rounded-xl border ${
                                  item.is_correct
                                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium'
                                    : 'bg-red-50/70 border-red-300 text-red-950 font-medium'
                                }`}
                              >
                                <span className="font-bold block uppercase text-2xs mb-0.5">
                                  Candidate Answer:
                                </span>
                                {item.selected_option_id ? (
                                  <span>Option ({item.selected_option_id.toUpperCase()})</span>
                                ) : (
                                  <span className="italic">No answer</span>
                                )}
                              </div>

                              <div className="p-3 rounded-xl border bg-blue-50/70 border-blue-300 text-blue-950 font-medium">
                                <span className="font-bold block uppercase text-2xs mb-0.5 text-blue-900">
                                  Correct Key:
                                </span>
                                <span>Option ({item.correct_option_id.toUpperCase()})</span>
                              </div>
                            </div>

                            {item.explanation && (
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
                                <span className="font-bold text-slate-900">Explanation:</span>{' '}
                                {item.explanation}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                          No assessment submission available for this applicant.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: AI TECHNICAL SCREEN REVIEW */}
                  {activeTab === 'ai' && (
                    <div className="space-y-4">
                      {applicantDetail.ai_interview ? (
                        <>
                          {applicantDetail.ai_interview.summary_evaluation && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div>
                                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Overall AI Rating
                                  </div>
                                  <div className="text-2xl font-black text-kulkul-purple">
                                    {applicantDetail.ai_interview.scorecard_score}/100
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Recommendation
                                  </div>
                                  <div className="text-sm font-bold text-kulkul-purple">
                                    {applicantDetail.ai_interview.summary_evaluation.recommendation}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
                                  Key Strengths
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                                  {(applicantDetail.ai_interview.summary_evaluation.key_strengths || []).map(
                                    (st: string, i: number) => (
                                      <li key={i}>{st}</li>
                                    )
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                                  Areas for Growth
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                                  {(applicantDetail.ai_interview.summary_evaluation.areas_for_growth || []).map(
                                    (ga: string, i: number) => (
                                      <li key={i}>{ga}</li>
                                    )
                                  )}
                                </ul>
                              </div>
                            </div>
                          )}

                          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
                              Conversational Transcript
                            </h3>
                            <div className="space-y-4">
                              {applicantDetail.ai_interview.transcript?.map((msg, i) => (
                                <div
                                  key={i}
                                  className={`p-4 rounded-2xl border text-sm leading-relaxed ${
                                    msg.role === 'ai'
                                      ? 'bg-kulkul-purple-light/50 border-kulkul-purple-subtle text-slate-900'
                                      : 'bg-kulkul-orange-light/50 border-kulkul-orange/20 text-slate-950 font-medium'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-2xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">
                                    <span>{msg.role === 'ai' ? 'AI Technical Screener' : 'Candidate'}</span>
                                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="whitespace-pre-wrap">{msg.message}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                          Candidate has not yet completed the technical screening session.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: INTAKE PROFILE */}
                  {activeTab === 'profile' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                      <div>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                          Contact Information
                        </h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-kulkul-purple" />
                            <span className="text-slate-900 font-medium">{applicantDetail.applicant.email}</span>
                          </div>
                          {applicantDetail.applicant.phone && (
                            <div className="flex items-center gap-3">
                              <Phone className="w-4 h-4 text-kulkul-purple" />
                              <span className="text-slate-900 font-medium">{applicantDetail.applicant.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                          Verified Portfolio Links
                        </h3>
                        <div className="space-y-3">
                          {applicantDetail.applicant.github_url && (
                            <a
                              href={applicantDetail.applicant.github_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold transition"
                            >
                              <div className="flex items-center gap-2.5">
                                <Github className="w-4 h-4 text-slate-700" />
                                <span>GitHub Profile</span>
                              </div>
                              <ExternalLink className="w-4 h-4 text-slate-400" />
                            </a>
                          )}

                          {applicantDetail.applicant.linkedin_url && (
                            <a
                              href={applicantDetail.applicant.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold transition"
                            >
                              <div className="flex items-center gap-2.5">
                                <Linkedin className="w-4 h-4 text-stitch-blue" />
                                <span>LinkedIn Profile</span>
                              </div>
                              <ExternalLink className="w-4 h-4 text-slate-400" />
                            </a>
                          )}

                          {applicantDetail.applicant.resume_url && (
                            <a
                              href={applicantDetail.applicant.resume_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold transition"
                            >
                              <div className="flex items-center gap-2.5">
                                <FileText className="w-4 h-4 text-kulkul-orange" />
                                <span>Resume / Curriculum Vitae</span>
                              </div>
                              <ExternalLink className="w-4 h-4 text-slate-400" />
                            </a>
                          )}
                        </div>
                      </div>

                      {applicantDetail.applicant.notes && (
                        <div className="border-t border-slate-100 pt-5">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Candidate Notes
                          </h3>
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 leading-relaxed">
                            {applicantDetail.applicant.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Decision Footer Actions */}
            <div className="p-5 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={decisionMutation.isPending}
                onClick={() =>
                  decisionMutation.mutate({
                    applicantId: selectedApplicantId!,
                    action: 'reject',
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-full transition disabled:opacity-50"
              >
                <ThumbsDown className="w-4 h-4" />
                <span>Reject Application</span>
              </button>

              <button
                type="button"
                disabled={decisionMutation.isPending}
                onClick={() =>
                  decisionMutation.mutate({
                    applicantId: selectedApplicantId!,
                    action: 'approve',
                  })
                }
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover rounded-full shadow-md transition disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-kulkul-orange" />
                <span>Approve for Live Interview</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
