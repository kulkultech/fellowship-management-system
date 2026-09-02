import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, type CreateProgramPayload, type CreateTrackPayload } from '@/services/adminService';
import { programService } from '@/services/programService';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { MCQQuestion, Track, ApplicationStageItem, CreateQuestionSetPayload } from '@/services/types';
import {
  Users,
  Search,
  CheckCircle2,
  ChevronRight,
  X,
  ExternalLink,
  Check,
  Plus,
  Clock,
  Calendar,
  Copy,
  Trash2,
  HelpCircle,
  Bot,
  Layers,
  Award,
  FileText,
  Workflow,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_STAGES: ApplicationStageItem[] = [
  {
    step_number: 1,
    title: 'Profile Registration',
    description: 'Candidate registers their contact details, academic major, and LinkedIn/GitHub links.',
  },
  {
    step_number: 2,
    title: 'Timed Logic & Problem Solving MCQ',
    description: '30-minute timed multiple choice logic and critical problem-solving assessment.',
  },
  {
    step_number: 3,
    title: 'Submission & Automated Verification',
    description: 'Test results are scored immediately against calibrated benchmark passing criteria.',
  },
  {
    step_number: 4,
    title: 'Application Confirmation Email',
    description: 'Candidate submits application and receives an official confirmation email.',
  },
  {
    step_number: 5,
    title: 'Talent & Technical Review',
    description: 'Recruitment team reviews itemized answer sheets and AI technical screen evaluation.',
  },
  {
    step_number: 6,
    title: 'Final Interview Scheduling',
    description: 'Approved candidates receive an official fellowship invitation and link to schedule their final interview with the host organization.',
  },
];

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
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
  const [isCreateTrackModalOpen, setIsCreateTrackModalOpen] = useState(false);
  const [isCreateQuestionSetModalOpen, setIsCreateQuestionSetModalOpen] = useState(false);
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

  // Organization Profile Edit State
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editOrgForm, setEditOrgForm] = useState({
    name: user?.organization?.name || '',
    contact_email: user?.organization?.contact_email || '',
    logo_url: user?.organization?.logo_url || '',
  });

  // Fetch current organization details
  const { data: orgProfile, refetch: refetchOrgProfile } = useQuery({
    queryKey: ['admin-organization-profile'],
    queryFn: () => adminService.getOrganization(),
  });

  useEffect(() => {
    if (orgProfile) {
      setEditOrgForm({
        name: orgProfile.name || '',
        contact_email: orgProfile.contact_email || '',
        logo_url: orgProfile.logo_url || '',
      });
    }
  }, [orgProfile]);

  const updateOrgMutation = useMutation({
    mutationFn: (payload: { name: string; contact_email: string; logo_url: string }) =>
      adminService.updateOrganization(payload),
    onSuccess: (updated) => {
      toast.success('Organization profile updated successfully!');
      refetchOrgProfile();
      setIsEditProfileModalOpen(false);
      if (user && user.organization) {
        useAuthStore.setState({
          user: {
            ...user,
            organization: {
              ...user.organization,
              id: updated.id,
              name: updated.name,
              slug: updated.slug,
              logo_url: updated.logo_url,
              contact_email: updated.contact_email,
              status: (updated.status || user.organization.status) as any,
            },
          },
        });
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update organization profile');
    },
  });

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

  // Load All Question Sets (Question Banks)
  const { data: allQuestionSets = [], refetch: refetchQuestionSets } = useQuery({
    queryKey: ['admin-question-sets', programId],
    queryFn: () => adminService.listQuestionSets(programId),
  });

  // Selected Question Set ID for Question Bank Editor
  const [selectedQuestionSetId, setSelectedQuestionSetId] = useState<string>('');

  React.useEffect(() => {
    if (allQuestionSets.length > 0) {
      if (!selectedQuestionSetId || !allQuestionSets.some((s) => s.id === selectedQuestionSetId)) {
        setSelectedQuestionSetId(allQuestionSets[0].id);
      }
    }
  }, [allQuestionSets, selectedQuestionSetId]);

  const activeQuestionSet = allQuestionSets.find((s) => s.id === selectedQuestionSetId);

  // Local Editable Question Bank State (Google Form Style)
  const [editingQuestions, setEditingQuestions] = useState<MCQQuestion[]>([]);
  const [editingSetName, setEditingSetName] = useState<string>('');
  const [editingSetCategory, setEditingSetCategory] = useState<string>('');
  const [editingSetDuration, setEditingSetDuration] = useState<number>(30);
  const [editingSetPassingScore, setEditingSetPassingScore] = useState<number>(70);
  const [editingSetDescription, setEditingSetDescription] = useState<string>('');

  React.useEffect(() => {
    if (activeQuestionSet) {
      setEditingQuestions(JSON.parse(JSON.stringify(activeQuestionSet.questions || [])));
      setEditingSetName(activeQuestionSet.name || '');
      setEditingSetCategory(activeQuestionSet.category || 'General Logic');
      setEditingSetDuration(activeQuestionSet.duration_minutes || 30);
      setEditingSetPassingScore(activeQuestionSet.passing_score || 70);
      setEditingSetDescription(activeQuestionSet.description || '');
    } else {
      setEditingQuestions([]);
      setEditingSetName('');
      setEditingSetCategory('General Logic');
      setEditingSetDuration(30);
      setEditingSetPassingScore(70);
      setEditingSetDescription('');
    }
  }, [activeQuestionSet, selectedQuestionSetId]);

  // Create Question Set Form State
  const [newQuestionSetForm, setNewQuestionSetForm] = useState<CreateQuestionSetPayload>({
    name: '',
    description: '',
    category: 'Software Engineering',
    duration_minutes: 35,
    passing_score: 70,
  });

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
    question_set_id: '',
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

  const handleOpenCreateTrack = (progSlug?: string) => {
    if (progSlug && progSlug !== activeProgramSlug) {
      setActiveProgramSlug(progSlug);
    }
    setEditingTrack(null);
    setTrackForm({
      question_set_id: allQuestionSets.length > 0 ? allQuestionSets[0].id : '',
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
    setIsCreateTrackModalOpen(true);
  };

  const handleOpenEditTrack = (track: Track, progSlug?: string) => {
    if (progSlug && progSlug !== activeProgramSlug) {
      setActiveProgramSlug(progSlug);
    }
    setEditingTrack(track);
    setTrackForm({
      question_set_id: track.question_set_id || (allQuestionSets.length > 0 ? allQuestionSets[0].id : ''),
      name: track.name || '',
      slug: track.slug || '',
      description: track.description || '',
      enable_mcq: track.enable_mcq ?? true,
      logic_test_duration_minutes: track.logic_test_duration_minutes || 35,
      logic_test_passing_score: track.logic_test_passing_score || 70,
      allow_retake: track.allow_retake ?? false,
      enable_ai_interview: track.enable_ai_interview ?? true,
      ai_interview_instructions: track.ai_interview_instructions || '',
      ai_interview_questions: track.ai_interview_questions || [
        'Describe a challenging project you built in this domain.',
        'How do you approach debugging complex edge-cases and performance bottlenecks?',
      ],
    });
    setIsCreateTrackModalOpen(true);
  };

  const activeFilteredTrack = programTracks.find((t) => t.id === selectedTrackFilter);

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

  // Question Sets Mutations
  const createQuestionSetMutation = useMutation({
    mutationFn: (payload: CreateQuestionSetPayload) => adminService.createQuestionSet(payload),
    onSuccess: (newSet) => {
      toast.success(`Question set "${newSet.name}" created!`);
      refetchQuestionSets();
      setSelectedQuestionSetId(newSet.id);
      setIsCreateQuestionSetModalOpen(false);
      setNewQuestionSetForm({
        name: '',
        description: '',
        category: 'Software Engineering',
        duration_minutes: 35,
        passing_score: 70,
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create question set');
    },
  });

  const saveActiveQuestionSetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQuestionSetId) throw new Error('No question set selected');
      return adminService.updateQuestionSet(selectedQuestionSetId, {
        name: editingSetName || activeQuestionSet?.name || 'Question Set',
        description: editingSetDescription,
        category: editingSetCategory || 'General Logic',
        duration_minutes: editingSetDuration || 30,
        passing_score: editingSetPassingScore || 70,
        questions: editingQuestions,
      });
    },
    onSuccess: (updated) => {
      toast.success(`Question set "${updated.name}" saved! (${editingQuestions.length} questions)`);
      refetchQuestionSets();
      refetchTracks();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save question set');
    },
  });

  const duplicateQuestionSetMutation = useMutation({
    mutationFn: (id: string) => adminService.duplicateQuestionSet(id),
    onSuccess: (dup) => {
      toast.success(`Duplicated "${dup.name}" successfully!`);
      refetchQuestionSets();
      setSelectedQuestionSetId(dup.id);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to duplicate question set');
    },
  });

  const deleteQuestionSetMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteQuestionSet(id),
    onSuccess: () => {
      toast.success('Question set deleted');
      refetchQuestionSets();
      refetchTracks();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete question set');
    },
  });

  const createProgramMutation = useMutation({
    mutationFn: (payload: CreateProgramPayload) => adminService.createProgram(payload),
    onSuccess: (newProg) => {
      toast.success(`Program "${newProg.name}" created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setActiveProgramSlug(newProg.slug);
      setSelectedTrackFilter('');
      setCurrentView('pipeline');
      setIsCreateProgramModalOpen(false);
      setNewProgSlug('');
      setNewProgName('');
      setNewProgDesc('');
      setNewProgImage('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create program');
    },
  });

  // Track Mutations
  const createTrackMutation = useMutation({
    mutationFn: (payload: CreateTrackPayload) => {
      if (!programId) throw new Error('No active program selected');
      return adminService.createProgramTrack(programId, payload);
    },
    onSuccess: (newTrack) => {
      toast.success(`Track "${newTrack.name}" created successfully!`);
      refetchTracks();
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setIsCreateTrackModalOpen(false);
      setEditingTrack(null);
      setSelectedTrackFilter(newTrack.id);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create track');
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
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setIsCreateTrackModalOpen(false);
      setEditingTrack(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update track');
    },
  });

  const deleteTrackMutation = useMutation({
    mutationFn: (trackId: string) => adminService.deleteTrack(trackId),
    onSuccess: () => {
      toast.success('Track removed');
      refetchTracks();
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      setIsCreateTrackModalOpen(false);
      setEditingTrack(null);
      setSelectedTrackFilter('');
    },
    onError: () => toast.error('Failed to delete track'),
  });

  const deleteProgramMutation = useMutation({
    mutationFn: (progId: string) => adminService.deleteProgram(progId),
    onSuccess: (_, deletedId) => {
      toast.success('Program deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      const remaining = allPrograms.filter((p) => p.id !== deletedId);
      if (remaining.length > 0) {
        setActiveProgramSlug(remaining[0].slug);
      }
      setSelectedTrackFilter('');
      setCurrentView('programs');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete program');
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
    const matchesSearch =
      a.full_name.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query) ||
      a.current_stage.toLowerCase().includes(query);
    const matchesTrack = selectedTrackFilter ? a.track_id === selectedTrackFilter : true;
    return matchesSearch && matchesTrack;
  });

  const questionsEndRef = useRef<HTMLDivElement | null>(null);

  // Question manipulation in Google Form builder
  const handleAddQuestion = () => {
    const newQ: MCQQuestion = {
      category: editingSetCategory || 'Technical Problem Solving',
      question_text: '',
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' },
      ],
      correct_option_id: 'a',
      explanation: '',
      points: 10,
    };
    setEditingQuestions((prev) => [...prev, newQ]);

    // Smooth scroll down immediately to fill the new question and focus its prompt
    setTimeout(() => {
      questionsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-question-prompt="true"]');
      if (textareas.length > 0) {
        textareas[textareas.length - 1]?.focus();
      }
    }, 80);
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

  // Active nav ID calculation for hierarchical tree
  const activeNavId =
    currentView === 'programs'
      ? 'programs'
      : currentView === 'questions'
      ? 'questions'
      : currentView === 'stages'
      ? `stages-${activeProgramSlug}`
      : selectedTrackFilter
      ? `track-${selectedTrackFilter}`
      : `all-candidates-${activeProgramSlug}`;

  const navItems: NavItem[] = [
    {
      id: 'programs',
      label: 'Programs',
      icon: Layers,
      badge: allPrograms.length,
      onClick: () => {
        setCurrentView('programs');
      },
      isExpanded: true,
      children: [
        ...allPrograms.map((p) => {
          const isCurrentActiveProg = p.slug === activeProgramSlug;
          const tracksForThisProg = isCurrentActiveProg ? programTracks : [];

          return {
            id: `program-${p.slug}`,
            label: p.name,
            icon: Layers,
            badge: isCurrentActiveProg ? applicants.length : undefined,
            isExpanded: isCurrentActiveProg,
            onClick: () => {
              setActiveProgramSlug(p.slug);
              setSelectedTrackFilter('');
              setCurrentView('pipeline');
            },
            children: [
              {
                id: `all-candidates-${p.slug}`,
                label: 'All Candidates',
                icon: Users,
                badge: isCurrentActiveProg ? applicants.length : undefined,
                onClick: () => {
                  setActiveProgramSlug(p.slug);
                  setSelectedTrackFilter('');
                  setCurrentView('pipeline');
                },
              },
              ...tracksForThisProg.map((t) => ({
                id: `track-${t.id}`,
                label: t.name,
                icon: Award,
                onClick: () => {
                  setActiveProgramSlug(p.slug);
                  setSelectedTrackFilter(t.id);
                  setCurrentView('pipeline');
                },
              })),
              {
                id: `add-track-${p.slug}`,
                label: 'Add Specialization Track',
                icon: Plus,
                onClick: () => {
                  handleOpenCreateTrack(p.slug);
                },
              },
              {
                id: `stages-${p.slug}`,
                label: 'Application Stages',
                icon: Workflow,
                onClick: () => {
                  setActiveProgramSlug(p.slug);
                  setCurrentView('stages');
                },
              },
            ],
          };
        }),
        {
          id: 'launch-new-program-nav',
          label: 'Launch New Program',
          icon: Plus,
          onClick: () => {
            setIsCreateProgramModalOpen(true);
          },
        },
      ],
    },
    {
      id: 'questions',
      label: 'Question Banks',
      icon: HelpCircle,
      badge: allQuestionSets.length > 0 ? allQuestionSets.length : undefined,
      onClick: () => setCurrentView('questions'),
    },
    ...(isSuperadmin
      ? [
          {
            id: 'superadmin_portal',
            label: 'Superadmin Console',
            icon: ShieldCheck,
            badge: pendingCompaniesCount > 0 ? pendingCompaniesCount : undefined,
            badgeColor: 'bg-amber-500 text-white',
            onClick: () => navigate('/superadmin/dashboard'),
          },
        ]
      : []),
  ];

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Program Switcher */}
      {allPrograms.length > 1 && (
        <select
          value={activeProgramSlug}
          onChange={(e) => setActiveProgramSlug(e.target.value)}
          className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple shadow-2xs"
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
        className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
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
            <span>Copy Link</span>
          </>
        )}
      </button>

      {/* Public Page Icon */}
      <a
        href={getPublicProgramUrl(activeProgramSlug)}
        target="_blank"
        rel="noreferrer"
        className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 bg-white transition shadow-2xs"
        title="Open public overview page"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>

      {/* Add Specialization Track Button */}
      {programId && (
        <button
          onClick={() => handleOpenCreateTrack(activeProgramSlug)}
          className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
          title="Add specialization track to active program"
        >
          <Plus className="w-3.5 h-3.5 text-kulkul-purple" />
          <span>Add Track</span>
        </button>
      )}

      {/* Delete Active Program Button */}
      {programId && (
        <button
          onClick={() => {
            if (
              window.confirm(
                `Are you sure you want to delete program "${program?.name || activeProgramSlug}"?\nAll associated tracks, stages, and applicant assessments will be permanently removed.`
              )
            ) {
              deleteProgramMutation.mutate(programId);
            }
          }}
          disabled={deleteProgramMutation.isPending}
          className="p-2 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 bg-white transition shadow-2xs"
          title="Delete this program"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Create New Program Button */}
      <button
        onClick={() => setIsCreateProgramModalOpen(true)}
        className="px-4 py-1.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4 text-kulkul-orange" />
        <span>New Program</span>
      </button>
    </div>
  );

  return (
    <DashboardLayout
      portalType="company_admin"
      title={
        currentView === 'programs'
          ? 'Programs'
          : currentView === 'questions'
          ? `${activeQuestionSet?.name || 'Assessment'} Question Bank`
          : currentView === 'stages'
          ? 'Application & Assessment Stages'
          : program?.name || 'Candidate Pipeline'
      }
      subtitle={
        currentView === 'questions'
          ? 'Configure timed domain multiple choice questions, passing score benchmarks, and scorecard explanations.'
          : currentView === 'stages'
          ? 'Configure candidate selection funnel stages, automated scoring triggers, and review workflows.'
          : undefined
      }
      companyName={orgProfile?.name || user?.organization?.name || 'Remote Skills Academy'}
      companyLogoUrl={orgProfile?.logo_url || user?.organization?.logo_url}
      navItems={navItems}
      activeNavId={activeNavId}
      onNavChange={(id) => {
        if (id === 'programs') setCurrentView('programs');
        else if (id === 'questions') setCurrentView('questions');
      }}
      headerActions={headerActions}
      onEditProfile={() => setIsEditProfileModalOpen(true)}
    >

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

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-slate-700">
                    {allPrograms.length} {allPrograms.length === 1 ? 'Program' : 'Programs'} Hosted
                  </span>
                  <button
                    onClick={() => setIsCreateProgramModalOpen(true)}
                    className="px-4 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-kulkul-orange" />
                    <span>Launch New Program</span>
                  </button>
                </div>
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

                              <td className="py-4 px-6 align-middle whitespace-nowrap text-left" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                                    <Layers className="w-3.5 h-3.5 text-kulkul-purple" />
                                    <span>{prog.tracks ? prog.tracks.length : (prog.slug === activeProgramSlug ? programTracks.length : '0')} Tracks</span>
                                  </span>
                                  <button
                                    onClick={() => handleOpenCreateTrack(prog.slug)}
                                    className="p-1 rounded-full hover:bg-purple-100 text-kulkul-purple border border-purple-200 transition"
                                    title="Add specialization track to this program"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
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

                                  <button
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Are you sure you want to permanently delete program "${prog.name}"?\nAll associated tracks, stages, and candidate submissions will be permanently removed.`
                                        )
                                      ) {
                                        deleteProgramMutation.mutate(prog.id);
                                      }
                                    }}
                                    disabled={deleteProgramMutation.isPending}
                                    className="p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition"
                                    title="Delete program"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
        {/* VIEW: CANDIDATE PIPELINE (FILTERED BY TREE SELECTION) */}
        {/* ================================================================================= */}
        {currentView === 'pipeline' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Candidate Pipeline Header & Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
              <div className="relative w-full lg:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search candidates by name, email, or stage..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                />
              </div>

              {/* Stage Filter Tabs & Active Track Indicator & Track Actions */}
              <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 flex-wrap">
                {selectedTrackFilter && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-bold text-kulkul-purple shadow-2xs">
                    <Award className="w-3.5 h-3.5 text-kulkul-orange" />
                    <span>Track: {activeFilteredTrack?.name || 'Filtered Track'}</span>
                    {activeFilteredTrack && (
                      <button
                        onClick={() => handleOpenEditTrack(activeFilteredTrack)}
                        className="text-2xs text-kulkul-purple underline hover:text-kulkul-purple-hover font-semibold px-1"
                        title="Edit track configuration"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedTrackFilter('')}
                      className="p-0.5 rounded-full hover:bg-purple-200/50 text-slate-400 hover:text-slate-700 transition ml-0.5"
                      title="Clear track filter to view all tracks"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleOpenCreateTrack(activeProgramSlug)}
                  className="px-3.5 py-1.5 rounded-full bg-white hover:bg-purple-50 border border-purple-200 text-kulkul-purple text-xs font-bold shadow-2xs transition flex items-center gap-1.5 whitespace-nowrap"
                  title="Create new specialization track for this program"
                >
                  <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
                  <span>Add Track</span>
                </button>

                {[
                  { label: 'All Candidates', value: '' },
                  { label: 'MCQ Passed', value: 'test_completed' },
                  { label: 'AI Evaluated', value: 'ai_interview_completed' },
                  { label: 'Live Accepted', value: 'approved_for_live' },
                ].map((st) => (
                  <button
                    key={st.value}
                    onClick={() => setSelectedStage(st.value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
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
        )}

        {/* ================================================================================= */}
        {/* VIEW 4: DEDICATED REUSABLE QUESTION BANKS WORKSPACE */}
        {/* ================================================================================= */}
        {currentView === 'questions' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Card: Library Header & Actions */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Assessment Question Banks & Test Sets
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                    Create and manage reusable sets of MCQ test questions. When configuring tracks in your fellowship program, choose which test set candidates will receive.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateQuestionSetModalOpen(true)}
                    className="px-4 py-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-kulkul-purple" />
                    <span>Create Question Set</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-4 py-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-kulkul-orange" />
                    <span>Add Question to Active Set</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => saveActiveQuestionSetMutation.mutate()}
                    disabled={saveActiveQuestionSetMutation.isPending || !selectedQuestionSetId}
                    className="px-5 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-kulkul-orange" />
                    {saveActiveQuestionSetMutation.isPending ? <span>Saving Set...</span> : <span>Save Question Set</span>}
                  </button>
                </div>
              </div>

              {/* Question Sets Library Selector Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Question Sets in Your Bank ({allQuestionSets.length})
                  </span>
                  <span className="text-2xs text-slate-400">Click any set below to edit its questions</span>
                </div>

                {allQuestionSets.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <p className="text-xs font-medium">No question sets found.</p>
                    <button
                      onClick={() => setIsCreateQuestionSetModalOpen(true)}
                      className="mt-2 text-xs font-bold text-kulkul-purple hover:underline"
                    >
                      + Create Your First Question Set
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allQuestionSets.map((qs) => {
                      const isSelected = selectedQuestionSetId === qs.id;
                      const assignedTracks = programTracks.filter((t) => t.question_set_id === qs.id);

                      return (
                        <div
                          key={qs.id}
                          onClick={() => setSelectedQuestionSetId(qs.id)}
                          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-3 ${
                            isSelected
                              ? 'bg-purple-50/50 border-kulkul-purple ring-2 ring-kulkul-purple/20 shadow-sm'
                              : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-white border border-slate-200 text-slate-600">
                                {qs.category || 'Logic Assessment'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    duplicateQuestionSetMutation.mutate(qs.id);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-kulkul-purple hover:bg-white"
                                  title="Duplicate this question set"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {allQuestionSets.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Delete question set "${qs.name}"?`)) {
                                        deleteQuestionSetMutation.mutate(qs.id);
                                      }
                                    }}
                                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-white"
                                    title="Delete this question set"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <h4 className="font-black text-slate-900 text-sm mt-2 leading-snug">
                              {qs.name}
                            </h4>
                            {qs.description && (
                              <p className="text-2xs text-slate-500 mt-1 line-clamp-2">{qs.description}</p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-200/60 space-y-2">
                            <div className="flex items-center justify-between text-2xs font-bold text-slate-600">
                              <span>{qs.questions?.length || qs.total_questions || 0} Questions</span>
                              <span>{qs.duration_minutes}m &middot; {qs.passing_score}% pass</span>
                            </div>

                            <div className="text-2xs text-slate-500 flex items-center gap-1 flex-wrap">
                              <span className="font-semibold text-slate-400">Assigned:</span>
                              {assignedTracks.length > 0 ? (
                                assignedTracks.map((tr) => (
                                  <span
                                    key={tr.id}
                                    className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-bold"
                                  >
                                    {tr.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 italic">Not assigned to tracks yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Set Metrics & Inline Meta Settings */}
              {activeQuestionSet && (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Active Set Settings: {activeQuestionSet.name}
                    </span>
                    <span className="text-2xs font-mono text-slate-400">ID: {activeQuestionSet.id.substring(0, 8)}...</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Set Name</label>
                      <input
                        type="text"
                        value={editingSetName}
                        onChange={(e) => setEditingSetName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>

                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Category</label>
                      <input
                        type="text"
                        value={editingSetCategory}
                        onChange={(e) => setEditingSetCategory(e.target.value)}
                        placeholder="e.g. Software Engineering, QA"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>

                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Default Duration (Mins)</label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={editingSetDuration}
                        onChange={(e) => setEditingSetDuration(parseInt(e.target.value) || 30)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>

                    <div>
                      <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Benchmark Passing Score (%)</label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={editingSetPassingScore}
                        onChange={(e) => setEditingSetPassingScore(parseInt(e.target.value) || 70)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
                    <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                      <div className="text-2xs font-extrabold uppercase text-slate-400">Total Questions</div>
                      <div className="text-xl font-black text-slate-900 mt-0.5">{editingQuestions.length}</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                      <div className="text-2xs font-extrabold uppercase text-slate-400">Time Allowed</div>
                      <div className="text-xl font-black text-kulkul-purple mt-0.5">{editingSetDuration} mins</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                      <div className="text-2xs font-extrabold uppercase text-slate-400">Passing Score</div>
                      <div className="text-xl font-black text-emerald-600 mt-0.5">{editingSetPassingScore}%</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                      <div className="text-2xs font-extrabold uppercase text-slate-400">Total Points</div>
                      <div className="text-xl font-black text-slate-900 mt-0.5">
                        {editingQuestions.reduce((acc, q) => acc + (q.points || 10), 0)} pts
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-6">
              {editingQuestions.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                  <HelpCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <h3 className="text-base font-bold text-slate-800">No questions in this set yet</h3>
                  <p className="text-xs text-slate-400 mt-1 mb-6 max-w-sm mx-auto">
                    Add multiple choice logic and domain questions to build this assessment set.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-5 py-2.5 rounded-full bg-kulkul-purple text-white text-xs font-bold shadow-xs"
                  >
                    Add First Question
                  </button>
                </div>
              ) : (
                editingQuestions.map((q, qIdx) => (
                  <div
                    key={qIdx}
                    className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-3 py-1 rounded-full bg-kulkul-purple text-white text-xs font-extrabold tracking-wide">
                          Question {qIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.category || 'Problem Solving'}
                          onChange={(e) => handleQuestionChange(qIdx, 'category', e.target.value)}
                          placeholder="Category (e.g. Logic, Algorithms, QA)"
                          className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:border-kulkul-purple"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition"
                        title="Delete question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Question Prompt */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Question Prompt <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        data-question-prompt="true"
                        value={q.question_text}
                        onChange={(e) => handleQuestionChange(qIdx, 'question_text', e.target.value)}
                        placeholder="Enter the question text or problem description..."
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple focus:bg-white transition"
                      />
                    </div>

                    {/* Multiple Choice Options & Correct Selection */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Options & Answer Key (Select radio button for the correct answer):
                      </label>

                      <div className="space-y-2.5">
                        {q.options.map((opt, optIdx) => (
                          <div
                            key={opt.id}
                            className={`flex items-center gap-3 p-3 rounded-2xl border transition ${
                              q.correct_option_id === opt.id
                                ? 'bg-purple-50/60 border-kulkul-purple/30'
                                : 'bg-slate-50/50 border-slate-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`correct_${qIdx}`}
                              checked={q.correct_option_id === opt.id}
                              onChange={() => handleQuestionChange(qIdx, 'correct_option_id', opt.id)}
                              className="w-4 h-4 text-kulkul-purple focus:ring-kulkul-purple cursor-pointer"
                              title="Set as correct answer"
                            />
                            <span className="text-xs font-mono font-extrabold text-slate-600 w-5">
                              {opt.id}.
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                              placeholder={`Option ${optIdx + 1} text`}
                              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                            />
                            {q.correct_option_id === opt.id && (
                              <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                Correct Answer
                              </span>
                            )}
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(qIdx, optIdx)}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100"
                                title="Remove option"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddOption(qIdx)}
                        className="text-xs font-bold text-kulkul-purple hover:text-kulkul-orange transition flex items-center gap-1.5 pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Option Choice</span>
                      </button>
                    </div>

                    {/* Explanation & Points */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                      <div className="sm:col-span-3">
                        <label className="block text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Scorecard Explanation (Displayed to candidates after submission)
                        </label>
                        <input
                          type="text"
                          value={q.explanation || ''}
                          onChange={(e) => handleQuestionChange(qIdx, 'explanation', e.target.value)}
                          placeholder="Provide the rationale or proof for the correct option..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Points
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={q.points || 10}
                          onChange={(e) => handleQuestionChange(qIdx, 'points', parseInt(e.target.value) || 10)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-bold"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Anchor for Auto-Scrolling to newly added question */}
              <div ref={questionsEndRef} />

              {/* Big Bottom Add Question Card */}
              <button
                type="button"
                onClick={handleAddQuestion}
                className="w-full py-5 rounded-3xl border-2 border-dashed border-slate-300 hover:border-kulkul-purple text-slate-600 hover:text-kulkul-purple text-sm font-bold transition flex items-center justify-center gap-2 bg-white/80 hover:bg-white shadow-2xs"
              >
                <Plus className="w-5 h-5" />
                <span>Add New MCQ Question to Set</span>
              </button>

              {/* Sticky Bottom Save Bar */}
              <div className="sticky bottom-4 z-20 p-4 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between gap-4">
                <div className="text-xs text-slate-600">
                  Editing <strong>{editingQuestions.length} questions</strong> in set <strong>{editingSetName || activeQuestionSet?.name}</strong>.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentView('pipeline')}
                    className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Back to Pipeline
                  </button>
                  <button
                    type="button"
                    onClick={() => saveActiveQuestionSetMutation.mutate()}
                    disabled={saveActiveQuestionSetMutation.isPending || !selectedQuestionSetId}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-kulkul-orange" />
                    {saveActiveQuestionSetMutation.isPending ? <span>Saving Changes...</span> : <span>Save Question Set</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* MODAL 2: CREATE / EDIT TRACK MODAL (WITH QUESTION SET SELECTION) */}
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

                {/* Question Set Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-kulkul-purple" />
                      Assessment Question Bank / Test Set
                    </span>
                    <span className="text-2xs font-semibold text-slate-400">Reusable Set</span>
                  </label>
                  <select
                    value={trackForm.question_set_id || ''}
                    onChange={(e) => {
                      const qSetId = e.target.value;
                      const selectedSet = allQuestionSets.find((s) => s.id === qSetId);
                      if (selectedSet) {
                        setTrackForm((prev) => ({
                          ...prev,
                          question_set_id: qSetId,
                          logic_test_duration_minutes: selectedSet.duration_minutes || prev.logic_test_duration_minutes,
                          logic_test_passing_score: selectedSet.passing_score || prev.logic_test_passing_score,
                        }));
                      } else {
                        setTrackForm((prev) => ({
                          ...prev,
                          question_set_id: '',
                        }));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                  >
                    <option value="">-- Choose Question Set from Bank --</option>
                    {allQuestionSets.map((qs) => (
                      <option key={qs.id} value={qs.id}>
                        {qs.name} ({qs.category} · {qs.questions?.length || qs.total_questions || 0} Qs · {qs.duration_minutes}m · {qs.passing_score}%)
                      </option>
                    ))}
                  </select>
                  {trackForm.question_set_id && (
                    <p className="text-2xs text-emerald-700 mt-1 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Linked question bank will automatically supply questions and timing for this track.
                    </p>
                  )}
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

                <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
                  {editingTrack ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete track "${editingTrack.name}"?`)) {
                          deleteTrackMutation.mutate(editingTrack.id);
                          setEditingTrack(null);
                        }
                      }}
                      className="px-4 py-2 rounded-full text-xs font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Track</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
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
                        <span>{editingTrack ? 'Update Track' : 'Create Track'}</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* MODAL 3: CREATE NEW QUESTION SET MODAL */}
        {/* ================================================================================= */}
        {isCreateQuestionSetModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-5 h-5 text-kulkul-purple" />
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Create New Question Set
                  </h2>
                </div>
                <button
                  onClick={() => setIsCreateQuestionSetModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createQuestionSetMutation.mutate({
                    ...newQuestionSetForm,
                    program_id: programId,
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Question Set Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Data Engineering & Python Screening"
                    value={newQuestionSetForm.name}
                    onChange={(e) => setNewQuestionSetForm({ ...newQuestionSetForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Software Engineering, QA, AI / ML, General Logic"
                    value={newQuestionSetForm.category}
                    onChange={(e) => setNewQuestionSetForm({ ...newQuestionSetForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Assessment scope, topics covered, target skill level..."
                    value={newQuestionSetForm.description}
                    onChange={(e) => setNewQuestionSetForm({ ...newQuestionSetForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                      Duration (Mins)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={newQuestionSetForm.duration_minutes}
                      onChange={(e) => setNewQuestionSetForm({ ...newQuestionSetForm, duration_minutes: parseInt(e.target.value) || 35 })}
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
                      value={newQuestionSetForm.passing_score}
                      onChange={(e) => setNewQuestionSetForm({ ...newQuestionSetForm, passing_score: parseInt(e.target.value) || 70 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateQuestionSetModalOpen(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createQuestionSetMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition"
                  >
                    {createQuestionSetMutation.isPending ? 'Creating Set...' : 'Create Question Set'}
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
                      const name = e.target.value;
                      setNewProgName(name);
                      if (!newProgSlug || newProgSlug === newProgName.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/\s+/g, '-')) {
                        setNewProgSlug(
                          name
                            .toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                        );
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    URL Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ai-2026"
                    value={newProgSlug}
                    onChange={(e) =>
                      setNewProgSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '')
                          .replace(/\s+/g, '-')
                      )
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                  <p className="text-2xs text-slate-400 mt-1 font-mono">
                    Public candidate URL: /programs/{orgSlug}/{newProgSlug || 'slug'}
                  </p>
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

        {/* ================================================================================= */}
        {/* MODAL: EDIT ORGANIZATION PROFILE & LOGO */}
        {/* ================================================================================= */}
        {isEditProfileModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Organization Profile</h2>
                    <p className="text-xs text-slate-500">Update company identity, contact email, and logo</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditProfileModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateOrgMutation.mutate(editOrgForm);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Organization / Company Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editOrgForm.name}
                    onChange={(e) => setEditOrgForm({ ...editOrgForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                    placeholder="e.g. Remote Skills Academy (RSA)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={editOrgForm.contact_email}
                    onChange={(e) => setEditOrgForm({ ...editOrgForm, contact_email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                    placeholder="e.g. admissions@rsa.org"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Company Logo URL
                  </label>
                  <input
                    type="url"
                    value={editOrgForm.logo_url}
                    onChange={(e) => setEditOrgForm({ ...editOrgForm, logo_url: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-mono text-xs"
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-2xs text-slate-400 mt-1">
                    Direct image link (PNG, SVG, JPG) to display on workspace badges and admissions portal.
                  </p>
                </div>

                {/* Logo Live Preview */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center overflow-hidden shadow-2xs">
                    {editOrgForm.logo_url ? (
                      <img
                        src={editOrgForm.logo_url}
                        alt="Logo Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Building2 className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Logo Live Preview</span>
                    <span className="text-2xs text-slate-500">
                      {editOrgForm.logo_url ? 'Active logo configured' : 'Default building avatar active'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditProfileModalOpen(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateOrgMutation.isPending}
                    className="px-6 py-2.5 rounded-full text-xs font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm transition disabled:opacity-50"
                  >
                    {updateOrgMutation.isPending ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DashboardLayout>
  );
};
