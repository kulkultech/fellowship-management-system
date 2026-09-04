import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, type CreateProgramPayload, type CreateTrackPayload } from '@/services/adminService';
import { programService } from '@/services/programService';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import { useAuthStore } from '@/hooks/useAuthStore';
import type {
  MCQQuestion,
  Track,
  ApplicationStageItem,
  CreateQuestionSetPayload,
  Program,
  AIInterviewRubric,
  AIInterviewQuestionItem,
  RubricCriterion,
  CriterionScore,
} from '@/services/types';

const DEFAULT_LIT_RUBRIC: AIInterviewRubric = {
  name: 'LIT 2026 Engineering Fellowship - AI Interview Rubric',
  instructions:
    'Evaluate responses according to the structured 5-question rubric. Do not penalize Indonesian regional accent if communication is clear. Scoring Scale: 80–100 Strong (clear communication, confident, concise, handles unexpected questions well), 70–79 Suitable (answers reasonably well, occasional hesitation, acceptable clarity), 60–69 Borderline (struggles to articulate ideas, frequent pauses, lacks structure), <60 Below expected standard (poor vocabulary, very difficult to understand, fails to address prompt).',
  scoring_guideline:
    'Evaluate responses according to the structured 5-question rubric. Do not penalize Indonesian regional accent if communication is clear. Scoring Scale: 80–100 Strong (clear communication, confident, concise, handles unexpected questions well), 70–79 Suitable (answers reasonably well, occasional hesitation, acceptable clarity), 60–69 Borderline (struggles to articulate ideas, frequent pauses, lacks structure), <60 Below expected standard (poor vocabulary, very difficult to understand, fails to address prompt).',
  preparation_time_seconds: 60,
  response_time_seconds: 90,
  allow_rerecord: false,
  total_points: 100,
  questions: [
    {
      id: 1,
      theme: 'Self-introduction and motivation',
      question:
        'Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?',
      max_points: 15,
      criteria: [
        { id: 'q1_c1', criterion: 'Understands the prompt and gives a relevant response', points: 4 },
        { id: 'q1_c2', criterion: 'Provides a clear, structured introduction (background, interests, strengths)', points: 5 },
        { id: 'q1_c3', criterion: 'Explains why they want to join and what they hope to achieve', points: 4 },
        { id: 'q1_c4', criterion: 'Speaks with reasonable fluency, confidence, and acceptable pronunciation', points: 2 },
      ],
    },
    {
      id: 2,
      theme: 'Learning something difficult',
      question:
        'Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?',
      max_points: 15,
      criteria: [
        { id: 'q2_c1', criterion: 'Clearly describes the situation or problem', points: 4 },
        { id: 'q2_c2', criterion: 'Logically explains the steps taken to learn or solve it, and shares the result', points: 5 },
        { id: 'q2_c3', criterion: 'Uses appropriate vocabulary and sentence structure to describe the experience', points: 3 },
        { id: 'q2_c4', criterion: 'Maintains smooth delivery and coherence', points: 3 },
      ],
    },
    {
      id: 3,
      theme: 'Asking a supervisor for clarification',
      question:
        'Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?',
      max_points: 25,
      criteria: [
        { id: 'q3_c1', criterion: 'Recognizes the importance of asking for clarification promptly rather than guessing or staying silent', points: 5 },
        { id: 'q3_c2', criterion: 'Explains the problem or confusion clearly', points: 7 },
        { id: 'q3_c3', criterion: 'Demonstrates how they would ask specific, polite questions (e.g. provides a sample phrase or message)', points: 7 },
        { id: 'q3_c4', criterion: 'Uses professional, respectful English suitable for a workplace setting', points: 4 },
        { id: 'q3_c5', criterion: 'Speaks coherently with good flow and confidence', points: 2 },
      ],
    },
    {
      id: 4,
      theme: 'Teamwork and communication challenges',
      question:
        'Describe a situation where you had to work with others (e.g., a university project, an organization, or a competition) and encountered a miscommunication or disagreement. How did you address it, and what did you learn?',
      max_points: 20,
      criteria: [
        { id: 'q4_c1', criterion: 'Provides a clear and relevant context/example', points: 4 },
        { id: 'q4_c2', criterion: 'Clearly explains their role in the situation', points: 4 },
        { id: 'q4_c3', criterion: 'Explains the communication challenge and the actions taken to address or resolve it constructively', points: 6 },
        { id: 'q4_c4', criterion: 'Reflects on lessons learned', points: 3 },
        { id: 'q4_c5', criterion: 'Speaks clearly, logically, and professionally', points: 3 },
      ],
    },
    {
      id: 5,
      theme: 'Communicating a potential delay',
      question:
        'Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?',
      max_points: 25,
      criteria: [
        { id: 'q5_c1', criterion: 'Communicates early and proactively rather than waiting until the deadline passes', points: 6 },
        { id: 'q5_c2', criterion: 'States the delay honestly without making excuses', points: 5 },
        { id: 'q5_c3', criterion: 'Proposes a revised deadline, partial deliverable, or solution', points: 7 },
        { id: 'q5_c4', criterion: 'Demonstrates accountability and professionalism', points: 5 },
        { id: 'q5_c5', criterion: 'Speaks clearly, logically, and respectfully in workplace English', points: 2 },
      ],
    },
  ],
};
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
  ArrowLeft,
  RotateCcw,
  Save,
  ShieldCheck,
  Building2,
  Video,
  Download,
  PlusCircle,
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
    description: 'Candidates take a timed multiple-choice assessment to evaluate logic, analytical thinking, and domain knowledge.',
  },
  {
    step_number: 3,
    title: 'Autonomous AI Technical Screening',
    description: 'Conversational AI bot evaluates technical depth and communication with live transcription & scoring.',
  },
  {
    step_number: 4,
    title: 'Reviewer Final Evaluation',
    description: 'Admin team performs final assessment and candidate admission confirmation.',
  },
];

export interface DashboardPageProps {
  defaultView?: 'programs' | 'pipeline' | 'stages' | 'companies' | 'questions' | 'track_editor' | 'ai_rubric' | 'create_program';
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ defaultView }) => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';

  const initialView = defaultView || (searchParams.get('view') as any) || 'programs';
  // Navigation View: 'programs' | 'pipeline' | 'stages' | 'companies' | 'questions' | 'track_editor' | 'ai_rubric' | 'create_program'
  const [currentView, setCurrentView] = useState<'programs' | 'pipeline' | 'stages' | 'companies' | 'questions' | 'track_editor' | 'ai_rubric' | 'create_program'>(initialView);

  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'answers' | 'ai' | 'profile'>('answers');

  // Modals & Sub-views
  const [isCreateQuestionSetModalOpen, setIsCreateQuestionSetModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [openedQuestionSetId, setOpenedQuestionSetId] = useState<string | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // AI Interview Rubric Editor State
  const [rubricTargetProgram, setRubricTargetProgram] = useState<Program | null>(null);
  const [rubricForm, setRubricForm] = useState<AIInterviewRubric>(DEFAULT_LIT_RUBRIC);

  const handleOpenRubricPage = (targetProg: Program) => {
    setRubricTargetProgram(targetProg);
    setActiveProgramSlug(targetProg.slug);
    if (targetProg.ai_interview_rubric && targetProg.ai_interview_rubric.questions?.length > 0) {
      setRubricForm(targetProg.ai_interview_rubric);
    } else {
      setRubricForm(DEFAULT_LIT_RUBRIC);
    }
    setCurrentView('ai_rubric');
  };

  useEffect(() => {
    if (defaultView) {
      setCurrentView(defaultView);
    }
  }, [defaultView]);

  // Active Program selection
  const [activeProgramSlug, setActiveProgramSlug] = useState('lit2026');

  // Load All Programs for Company
  const { data: allPrograms = [] } = useQuery({
    queryKey: ['admin-all-programs'],
    queryFn: () => adminService.listPrograms(),
  });

  useEffect(() => {
    if (currentView === 'ai_rubric' && !rubricTargetProgram && allPrograms.length > 0) {
      const targetSlug = params.programSlug || searchParams.get('program') || activeProgramSlug;
      const target = allPrograms.find((p) => p.slug === targetSlug) || allPrograms[0];
      if (target) {
        handleOpenRubricPage(target);
      }
    }
  }, [currentView, rubricTargetProgram, allPrograms, activeProgramSlug, params.programSlug, searchParams]);

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
    setCurrentView('track_editor');
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
    setCurrentView('track_editor');
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
      setNewProgSlug('');
      setNewProgName('');
      setNewProgDesc('');
      setNewProgImage('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create program');
    },
  });

  const updateProgramRubricMutation = useMutation({
    mutationFn: ({ programId, rubric }: { programId: string; rubric: AIInterviewRubric }) =>
      adminService.updateProgramRubric(programId, rubric),
    onSuccess: (updated) => {
      toast.success(`AI Interview Rubric for "${updated.name}" saved!`);
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-program-pipeline', activeProgramSlug] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update AI interview rubric');
    },
  });

  // Rubric editing helpers
  const rubricTotalPts = (rubricForm.questions || []).reduce(
    (sum, q) => sum + (Number(q.max_points) || 0),
    0
  );

  const handleAddRubricQuestion = () => {
    const nextId = (rubricForm.questions?.length || 0) + 1;
    setRubricForm((prev) => ({
      ...prev,
      questions: [
        ...(prev.questions || []),
        {
          id: nextId,
          theme: `Competency ${nextId}: Core Skill Assessment`,
          question: '',
          max_points: 20,
          criteria: [
            { id: `q${nextId}_c1`, criterion: 'Understands prompt and articulates solution with clear logic', points: 10 },
            { id: `q${nextId}_c2`, criterion: 'Professional delivery, coherence, and appropriate vocabulary', points: 10 },
          ],
        },
      ],
    }));
  };

  const handleDeleteRubricQuestion = (qIndex: number) => {
    setRubricForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== qIndex),
    }));
  };

  const handleUpdateRubricQuestion = (qIndex: number, field: keyof AIInterviewQuestionItem, value: any) => {
    setRubricForm((prev) => {
      const updated = [...prev.questions];
      updated[qIndex] = { ...updated[qIndex], [field]: value };
      return { ...prev, questions: updated };
    });
  };

  const handleAddRubricCriterion = (qIndex: number) => {
    setRubricForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIndex];
      const nextCritId = `q${q.id}_c${(q.criteria?.length || 0) + 1}`;
      q.criteria = [...(q.criteria || []), { id: nextCritId, criterion: 'Demonstrates clear proficiency and structured reasoning', points: 5 }];
      return { ...prev, questions: updated };
    });
  };

  const handleDeleteRubricCriterion = (qIndex: number, cIndex: number) => {
    setRubricForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIndex];
      q.criteria = (q.criteria || []).filter((_, idx) => idx !== cIndex);
      return { ...prev, questions: updated };
    });
  };

  const handleUpdateRubricCriterion = (
    qIndex: number,
    cIndex: number,
    field: keyof RubricCriterion,
    value: any
  ) => {
    setRubricForm((prev) => {
      const updated = [...prev.questions];
      const q = updated[qIndex];
      const newCrit = [...(q.criteria || [])];
      newCrit[cIndex] = { ...newCrit[cIndex], [field]: value };
      q.criteria = newCrit;
      return { ...prev, questions: updated };
    });
  };

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
      setEditingTrack(null);
      setSelectedTrackFilter(newTrack.id);
      setCurrentView('pipeline');
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
      setEditingTrack(null);
      setCurrentView('pipeline');
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
      setEditingTrack(null);
      setSelectedTrackFilter('');
      setCurrentView('pipeline');
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
      : currentView === 'create_program'
      ? 'launch-new-program-nav'
      : currentView === 'questions'
      ? 'questions'
      : currentView === 'stages'
      ? `stages-${activeProgramSlug}`
      : currentView === 'ai_rubric'
      ? `ai-rubric-${activeProgramSlug}`
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
              {
                id: `ai-rubric-${p.slug}`,
                label: 'AI Rubric & Prompts',
                icon: Bot,
                onClick: () => {
                  handleOpenRubricPage(p);
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
            setCurrentView('create_program');
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
      {/* Program actions: only visible when a program is opened (not on top-level Programs directory) */}
      {currentView !== 'programs' && programId && (
        <>
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

          {/* Add Specialization Track Button - visible only when opening a program */}
          <button
            onClick={() => handleOpenCreateTrack(activeProgramSlug)}
            className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
            title="Add specialization track to active program"
          >
            <Plus className="w-3.5 h-3.5 text-kulkul-purple" />
            <span>Add Track</span>
          </button>

          {/* Delete Active Program Button */}
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
        </>
      )}

      {/* Create New Program Button */}
      <button
        onClick={() => setCurrentView('create_program')}
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
          : currentView === 'create_program'
          ? 'Launch New Program'
          : currentView === 'questions'
          ? `${activeQuestionSet?.name || 'Assessment'} Question Bank`
          : currentView === 'stages'
          ? 'Application & Assessment Stages'
          : currentView === 'ai_rubric'
          ? 'AI Rubric & Prompts'
          : program?.name || 'Candidate Pipeline'
      }
      subtitle={
        currentView === 'create_program'
          ? 'Set up a new fellowship or cohort with specialization tracks, screening modules, and candidate assessments.'
          : currentView === 'questions'
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
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-kulkul-purple" />
                    <span>Active Fellowship Cohorts</span>
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-slate-700">
                    {allPrograms.length} {allPrograms.length === 1 ? 'Program' : 'Programs'} Hosted
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentView('create_program')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-2xs transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
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
                    onClick={() => setCurrentView('create_program')}
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
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                                  <Layers className="w-3.5 h-3.5 text-kulkul-purple" />
                                  <span>{prog.tracks ? prog.tracks.length : (prog.slug === activeProgramSlug ? programTracks.length : '0')} Tracks</span>
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

                                    <button
                                      onClick={() => handleOpenRubricPage(prog)}
                                      className="px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-kulkul-purple text-xs font-bold border border-purple-200 transition flex items-center gap-1.5 shadow-2xs"
                                      title="Configure AI Interview Questions & Rubric"
                                    >
                                      <Bot className="w-3.5 h-3.5 text-kulkul-purple" />
                                      <span>Rubric</span>
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

                <button
                  onClick={() => {
                    const currentProg = allPrograms.find((p) => p.slug === activeProgramSlug) || program;
                    if (currentProg) handleOpenRubricPage(currentProg);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 border border-purple-200 text-kulkul-purple text-xs font-bold shadow-2xs transition flex items-center gap-1.5 whitespace-nowrap"
                  title="Configure AI Interview Questions, Prompts & Rubric"
                >
                  <Bot className="w-3.5 h-3.5 text-kulkul-purple" />
                  <span>AI Rubric & Prompts</span>
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
            {!openedQuestionSetId ? (
              /* Simple Question Banks Table View */
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                      <HelpCircle className="w-5 h-5 text-kulkul-purple" />
                      <span>Assessment Question Banks</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Create and manage reusable sets of MCQ questions. Click any set to inspect and edit its questions.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-full text-slate-700">
                      {allQuestionSets.length} {allQuestionSets.length === 1 ? 'Question Set' : 'Question Sets'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreateQuestionSetModalOpen(true)}
                      className="px-4 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-kulkul-orange" />
                      <span>Create Question Set</span>
                    </button>
                  </div>
                </div>

                {allQuestionSets.length === 0 ? (
                  <div className="stitch-card p-12 bg-white text-center">
                    <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-700">No question sets found</h3>
                    <p className="text-xs text-slate-500 mt-1 mb-4">
                      Create your first reusable question bank to configure domain MCQ assessments for your tracks.
                    </p>
                    <button
                      onClick={() => setIsCreateQuestionSetModalOpen(true)}
                      className="px-5 py-2 rounded-full bg-kulkul-purple text-white text-xs font-bold"
                    >
                      Create Question Set
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse table-fixed min-w-[780px]">
                        <colgroup>
                          <col className="w-[30%]" />
                          <col className="w-[18%]" />
                          <col className="w-[14%]" />
                          <col className="w-[18%]" />
                          <col className="w-[20%]" />
                        </colgroup>
                        <thead className="bg-slate-50/90 border-b border-slate-200/80 text-2xs uppercase tracking-wider text-slate-500 font-bold">
                          <tr>
                            <th className="py-3.5 px-6 font-bold">Question Set</th>
                            <th className="py-3.5 px-6 font-bold">Category</th>
                            <th className="py-3.5 px-6 font-bold">Questions</th>
                            <th className="py-3.5 px-6 font-bold">Timing & Benchmark</th>
                            <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {allQuestionSets.map((qs) => {
                            return (
                              <tr
                                key={qs.id}
                                className="hover:bg-slate-50/90 transition group cursor-pointer"
                                onClick={() => {
                                  setSelectedQuestionSetId(qs.id);
                                  setOpenedQuestionSetId(qs.id);
                                }}
                              >
                                <td className="py-4 px-6 align-middle">
                                  <div className="font-extrabold text-slate-900 group-hover:text-kulkul-purple transition text-sm">
                                    {qs.name}
                                  </div>
                                  {qs.description && (
                                    <div className="text-2xs text-slate-500 mt-0.5 line-clamp-1">
                                      {qs.description}
                                    </div>
                                  )}
                                </td>

                                <td className="py-4 px-6 align-middle whitespace-nowrap">
                                  <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-slate-100 border border-slate-200 text-slate-700">
                                    {qs.category || 'Logic Assessment'}
                                  </span>
                                </td>

                                <td className="py-4 px-6 align-middle whitespace-nowrap text-xs font-bold text-slate-800">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-kulkul-purple border border-purple-200 text-2xs font-bold">
                                    {qs.questions?.length || qs.total_questions || 0} Questions
                                  </span>
                                </td>

                                <td className="py-4 px-6 align-middle whitespace-nowrap text-xs text-slate-600">
                                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{qs.duration_minutes} mins · {qs.passing_score}% pass</span>
                                  </div>
                                </td>

                                <td className="py-4 px-6 align-middle text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedQuestionSetId(qs.id);
                                        setOpenedQuestionSetId(qs.id);
                                      }}
                                      className="px-3.5 py-1.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-xs transition flex items-center gap-1"
                                    >
                                      <span>Open Set</span>
                                      <ChevronRight className="w-3.5 h-3.5 text-kulkul-orange" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => duplicateQuestionSetMutation.mutate(qs.id)}
                                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-kulkul-purple border border-slate-200 transition"
                                      title="Duplicate question set"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>

                                    {allQuestionSets.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete question set "${qs.name}"?`)) {
                                            deleteQuestionSetMutation.mutate(qs.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition"
                                        title="Delete question set"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
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
            ) : (
              /* Opened Question Set Detail / Questions Editor */
              <div className="space-y-6">
                {/* Top Action Bar with Back button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setOpenedQuestionSetId(null)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kulkul-purple px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Question Banks</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleAddQuestion}
                      className="px-4 py-2 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 text-kulkul-purple" />
                      <span>Add Question</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => saveActiveQuestionSetMutation.mutate()}
                      disabled={saveActiveQuestionSetMutation.isPending || !selectedQuestionSetId}
                      className="px-5 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5 text-kulkul-orange" />
                      {saveActiveQuestionSetMutation.isPending ? <span>Saving...</span> : <span>Save Question Set</span>}
                    </button>
                  </div>
                </div>

                {/* Active Set Metrics & Settings */}
                {activeQuestionSet && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="text-base font-black text-slate-900">
                          {activeQuestionSet.name}
                        </h3>
                        <p className="text-2xs text-slate-400 font-mono mt-0.5">
                          ID: {activeQuestionSet.id}
                        </p>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                        {editingQuestions.length} Questions Configured
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Set Name</label>
                        <input
                          type="text"
                          value={editingSetName}
                          onChange={(e) => setEditingSetName(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Category</label>
                        <input
                          type="text"
                          value={editingSetCategory}
                          onChange={(e) => setEditingSetCategory(e.target.value)}
                          placeholder="e.g. Software Engineering, QA"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Duration (Minutes)</label>
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={editingSetDuration}
                          onChange={(e) => setEditingSetDuration(parseInt(e.target.value) || 30)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">Passing Score (%)</label>
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={editingSetPassingScore}
                          onChange={(e) => setEditingSetPassingScore(parseInt(e.target.value) || 70)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <div className="text-2xs font-extrabold uppercase text-slate-400">Total Questions</div>
                        <div className="text-lg font-black text-slate-900 mt-0.5">{editingQuestions.length}</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <div className="text-2xs font-extrabold uppercase text-slate-400">Time Limit</div>
                        <div className="text-lg font-black text-kulkul-purple mt-0.5">{editingSetDuration} mins</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <div className="text-2xs font-extrabold uppercase text-slate-400">Passing Score</div>
                        <div className="text-lg font-black text-emerald-600 mt-0.5">{editingSetPassingScore}%</div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <div className="text-2xs font-extrabold uppercase text-slate-400">Total Points</div>
                        <div className="text-lg font-black text-slate-900 mt-0.5">
                          {editingQuestions.reduce((acc, q) => acc + (q.points || 10), 0)} pts
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                        onClick={() => setOpenedQuestionSetId(null)}
                        className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                      >
                        Back to Question Banks
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
          </div>
        )}

        {/* ================================================================================= */}
        {/* VIEW 5: SPECIALIZATION TRACK EDITOR FULL PAGE VIEW */}
        {/* ================================================================================= */}
        {currentView === 'track_editor' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Navigation / Breadcrumb */}
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentView('pipeline')}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kulkul-purple px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Candidate Pipeline</span>
              </button>

              <span className="text-xs font-bold px-3.5 py-1.5 bg-purple-50 text-kulkul-purple border border-purple-200 rounded-full">
                Program: {program?.name || activeProgramSlug}
              </span>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-kulkul-purple" />
                  <span>{editingTrack ? `Edit Track: ${editingTrack.name}` : 'Create Specialization Track'}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure candidate specialization tracks, MCQ question sets, and AI technical screening parameters.
                </p>
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
                className="space-y-6"
              >
                {/* Section 1: Track Details */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    1. Track Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
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
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                    </div>
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
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                    />
                  </div>
                </div>

                {/* Section 2: Question Bank & Logic MCQ */}
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-kulkul-purple" />
                      <span>2. Timed Logic & Domain MCQ Assessment</span>
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trackForm.enable_mcq}
                        onChange={(e) => setTrackForm({ ...trackForm, enable_mcq: e.target.checked })}
                        className="w-4 h-4 text-kulkul-purple rounded"
                      />
                      <span className="text-xs font-bold text-slate-700">Enable Assessment</span>
                    </label>
                  </div>

                  {trackForm.enable_mcq && (
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                          Question Bank / Reusable Test Set
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
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                        >
                          <option value="">-- Choose Question Set from Bank --</option>
                          {allQuestionSets.map((qs) => (
                            <option key={qs.id} value={qs.id}>
                              {qs.name} ({qs.category} · {qs.questions?.length || qs.total_questions || 0} Qs · {qs.duration_minutes}m · {qs.passing_score}%)
                            </option>
                          ))}
                        </select>
                        {trackForm.question_set_id && (
                          <p className="text-2xs text-emerald-700 mt-1.5 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Linked question bank will automatically supply questions and passing criteria for this track.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                            Logic Test Duration (Minutes)
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={180}
                            value={trackForm.logic_test_duration_minutes}
                            onChange={(e) => setTrackForm({ ...trackForm, logic_test_duration_minutes: parseInt(e.target.value) || 35 })}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                            Passing Score Benchmark (%)
                          </label>
                          <input
                            type="number"
                            min={10}
                            max={100}
                            value={trackForm.logic_test_passing_score}
                            onChange={(e) => setTrackForm({ ...trackForm, logic_test_passing_score: parseInt(e.target.value) || 70 })}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: AI Technical Screening */}
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Bot className="w-4 h-4 text-kulkul-purple" />
                      <span>3. Autonomous AI Technical Screening Room</span>
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trackForm.enable_ai_interview}
                        onChange={(e) => setTrackForm({ ...trackForm, enable_ai_interview: e.target.checked })}
                        className="w-4 h-4 text-kulkul-purple rounded"
                      />
                      <span className="text-xs font-bold text-slate-700">Enable AI Screening</span>
                    </label>
                  </div>

                  {trackForm.enable_ai_interview && (
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                          AI Interviewer Guidelines & System Instructions
                        </label>
                        <input
                          type="text"
                          value={trackForm.ai_interview_instructions}
                          onChange={(e) => setTrackForm({ ...trackForm, ai_interview_instructions: e.target.value })}
                          placeholder="e.g. Assess system design principles, debugging methodology, and communication clarity."
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                          Track Technical Interview Questions (One question per line)
                        </label>
                        <textarea
                          rows={4}
                          value={(trackForm.ai_interview_questions || []).join('\n')}
                          onChange={(e) =>
                            setTrackForm({
                              ...trackForm,
                              ai_interview_questions: e.target.value.split('\n').filter((q) => q.trim().length > 0),
                            })
                          }
                          placeholder="Enter domain-specific questions for the AI interviewer..."
                          className="w-full p-4 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple leading-relaxed"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons Footer */}
                <div className="pt-4 flex items-center justify-between gap-4 border-t border-slate-100">
                  {editingTrack ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to permanently delete track "${editingTrack.name}"?`)) {
                          deleteTrackMutation.mutate(editingTrack.id);
                        }
                      }}
                      disabled={deleteTrackMutation.isPending}
                      className="px-4 py-2.5 rounded-full text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Track</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentView('pipeline')}
                      className="px-5 py-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={createTrackMutation.isPending || updateTrackMutation.isPending}
                      className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4 text-kulkul-orange" />
                      <span>{editingTrack ? 'Save Track Changes' : 'Create Specialization Track'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* VIEW 6: AI INTERVIEW QUESTIONS & RUBRIC CONFIGURATION FULL PAGE VIEW */}
        {/* ================================================================================= */}
        {currentView === 'ai_rubric' && rubricTargetProgram && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Navigation / Breadcrumb & Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentView('pipeline')}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kulkul-purple px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Candidate Pipeline</span>
              </button>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-start sm:justify-end">
                {allPrograms.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Program:</span>
                    <select
                      value={rubricTargetProgram.slug}
                      onChange={(e) => {
                        const target = allPrograms.find((p) => p.slug === e.target.value);
                        if (target) handleOpenRubricPage(target);
                      }}
                      className="px-3.5 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-kulkul-purple text-xs font-bold focus:outline-none shadow-2xs"
                    >
                      {allPrograms.map((p) => (
                        <option key={p.id} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div
                  className={`px-3.5 py-1.5 rounded-full text-xs font-black tracking-wider flex items-center gap-1.5 border shadow-2xs ${
                    rubricTotalPts === 100
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-amber-50 text-amber-700 border-amber-300'
                  }`}
                >
                  <span>Total: {rubricTotalPts} / 100 Pts</span>
                  {rubricTotalPts === 100 && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
              </div>
            </div>

            {/* Main Editor Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center border border-purple-200 shrink-0 shadow-2xs">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">
                      AI Interview Questions & Rubric Settings
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!rubricTargetProgram) return;
                      updateProgramRubricMutation.mutate({
                        programId: rubricTargetProgram.id,
                        rubric: {
                          ...rubricForm,
                          total_points: rubricTotalPts,
                        },
                      });
                    }}
                    disabled={updateProgramRubricMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-kulkul-orange" />
                    <span>
                      {updateProgramRubricMutation.isPending ? 'Saving Rubric...' : 'Save Rubric Configuration'}
                    </span>
                  </button>
                </div>
              </div>

              {/* General Timing & Screening Parameters */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-kulkul-purple" />
                  <span>Screening Chamber & Timing Parameters</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                      Preparation Buffer
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={rubricForm.preparation_time_seconds ?? 60}
                        onChange={(e) =>
                          setRubricForm({
                            ...rubricForm,
                            preparation_time_seconds: parseInt(e.target.value) || 60,
                          })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">
                        sec
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                      Max Response Duration
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={15}
                        max={600}
                        value={rubricForm.response_time_seconds ?? 90}
                        onChange={(e) =>
                          setRubricForm({
                            ...rubricForm,
                            response_time_seconds: parseInt(e.target.value) || 90,
                          })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">
                        sec
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                      Re-recording Policy
                    </label>
                    <label className="flex items-center gap-2 mt-1 cursor-pointer bg-white p-2 px-3 rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        checked={rubricForm.allow_rerecord ?? false}
                        onChange={(e) =>
                          setRubricForm({
                            ...rubricForm,
                            allow_rerecord: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-kulkul-purple rounded"
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        Allow Re-record (Unchecked = Single Take)
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                    AI Evaluator Instructions & Accent Fairness Guidelines
                  </label>
                  <textarea
                    rows={3}
                    value={rubricForm.instructions || rubricForm.scoring_guideline || ''}
                    onChange={(e) =>
                      setRubricForm({
                        ...rubricForm,
                        instructions: e.target.value,
                        scoring_guideline: e.target.value,
                      })
                    }
                    placeholder="e.g. Do not penalize Indonesian regional accent if communication is clear..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 text-xs bg-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>
              </div>

              {/* Structured Questions & Criteria Section */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-kulkul-purple" />
                      <span>AI Video Prompts & Criteria ({rubricForm.questions?.length || 0} Questions)</span>
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRubricQuestion}
                    className="px-4 py-2 rounded-full bg-purple-50 hover:bg-purple-100 text-kulkul-purple text-xs font-bold border border-purple-200 transition flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
                    <span>Add Question</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {(rubricForm.questions || []).map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 relative hover:border-purple-300 transition"
                    >
                      {/* Question Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                          <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-900 font-black text-xs flex items-center justify-center shrink-0">
                            0{qIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={q.theme}
                            onChange={(e) => handleUpdateRubricQuestion(qIdx, 'theme', e.target.value)}
                            placeholder="Theme / Competency area..."
                            className="w-full sm:w-96 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-kulkul-purple"
                          />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Max Points:</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={q.max_points}
                              onChange={(e) =>
                                handleUpdateRubricQuestion(qIdx, 'max_points', parseInt(e.target.value) || 0)
                              }
                              className="w-16 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-purple-900 text-center font-mono"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteRubricQuestion(qIdx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete Question"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Question Prompt Textarea */}
                      <div>
                        <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                          Question Prompt Spoken by AI to Candidate
                        </label>
                        <textarea
                          rows={2}
                          value={q.question}
                          onChange={(e) => handleUpdateRubricQuestion(qIdx, 'question', e.target.value)}
                          placeholder="Enter the spoken technical or situational prompt..."
                          className="w-full p-3.5 rounded-xl border border-slate-200 text-xs bg-slate-50/50 leading-relaxed focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                        />
                      </div>

                      {/* Criteria Sub-table */}
                      <div className="bg-purple-50/40 border border-purple-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xs font-extrabold uppercase tracking-wider text-purple-900">
                            Itemized Scoring Rubric Criteria ({q.criteria?.length || 0})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddRubricCriterion(qIdx)}
                            className="text-2xs font-bold text-kulkul-purple hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
                            <span>Add Criterion</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(q.criteria || []).map((crit, cIdx) => (
                            <div key={crit.id || cIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={crit.criterion}
                                onChange={(e) =>
                                  handleUpdateRubricCriterion(qIdx, cIdx, 'criterion', e.target.value)
                                }
                                placeholder="Criterion description (e.g. Clearly describes situation or problem)..."
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-kulkul-purple"
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={crit.points}
                                  onChange={(e) =>
                                    handleUpdateRubricCriterion(
                                      qIdx,
                                      cIdx,
                                      'points',
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-16 px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-purple-900 text-center font-mono bg-white"
                                />
                                <span className="text-3xs text-slate-500 font-medium">pts</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteRubricCriterion(qIdx, cIdx)}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition"
                                title="Delete criterion"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Footer Bar */}
              <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500">
                  Total Allocated: <strong className="text-slate-900">{rubricTotalPts} points</strong>
                  {rubricTotalPts !== 100 && (
                    <span className="text-amber-600 ml-2 font-medium">
                      (Recommended standard is 100 points)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentView('pipeline')}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition shadow-2xs"
                  >
                    Back to Pipeline
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!rubricTargetProgram) return;
                      updateProgramRubricMutation.mutate({
                        programId: rubricTargetProgram.id,
                        rubric: {
                          ...rubricForm,
                          total_points: rubricTotalPts,
                        },
                      });
                    }}
                    disabled={updateProgramRubricMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-kulkul-orange" />
                    <span>
                      {updateProgramRubricMutation.isPending ? 'Saving Rubric...' : 'Save Rubric Configuration'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================================= */}
        {/* VIEW 7: LAUNCH NEW PROGRAM FULL PAGE VIEW */}
        {/* ================================================================================= */}
        {currentView === 'create_program' && (
          <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
            {/* Top Navigation / Breadcrumb */}
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentView('programs')}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kulkul-purple px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Programs</span>
              </button>
            </div>

            {/* Main Form Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8">
              <div className="border-b border-slate-100 pb-5 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center border border-purple-200 shrink-0 shadow-2xs">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Launch New Program
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure cohort branding, public portal paths, and autonomous screening assessment pipelines.
                  </p>
                </div>
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
                className="space-y-6"
              >
                {/* Section 1: Program Information */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    1. Program Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          if (
                            !newProgSlug ||
                            newProgSlug ===
                              newProgName
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, '')
                                .replace(/\s+/g, '-')
                          ) {
                            setNewProgSlug(
                              name
                                .toLowerCase()
                                .replace(/[^a-z0-9\s-]/g, '')
                                .replace(/\s+/g, '-')
                            );
                          }
                        }}
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
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
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      />
                      <p className="text-2xs text-slate-400 mt-1 font-mono">
                        Public candidate URL: /programs/{orgSlug}/{newProgSlug || 'slug'}
                      </p>
                    </div>
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
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
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
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                    />
                  </div>
                </div>

                {/* Section 2: Screening Pipeline Modules */}
                <div className="space-y-4 p-6 rounded-2xl bg-slate-50 border border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Screening Pipeline Modules
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        id="pageMcqToggle"
                        checked={newProgEnableMCQ}
                        onChange={(e) => setNewProgEnableMCQ(e.target.checked)}
                        className="w-4 h-4 text-kulkul-purple rounded"
                      />
                      <label htmlFor="pageMcqToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Enable Timed MCQ Logic Test
                      </label>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        id="pageAiToggle"
                        checked={newProgEnableAI}
                        onChange={(e) => setNewProgEnableAI(e.target.checked)}
                        className="w-4 h-4 text-kulkul-orange rounded"
                      />
                      <label htmlFor="pageAiToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Enable AI Video Interview
                      </label>
                    </div>
                  </div>

                  {newProgEnableMCQ && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                          MCQ Duration (Minutes)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={newProgDuration}
                          onChange={(e) => setNewProgDuration(parseInt(e.target.value) || 30)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-2xs font-bold text-slate-600 uppercase mb-1">
                          Passing Score Benchmark (%)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={newProgPassingScore}
                          onChange={(e) => setNewProgPassingScore(parseInt(e.target.value) || 70)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons Footer */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCurrentView('programs')}
                    className="px-5 py-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createProgramMutation.isPending}
                    className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 text-kulkul-orange" />
                    <span>{createProgramMutation.isPending ? 'Launching Program...' : 'Launch Program'}</span>
                  </button>
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
                      {/* Video Recording Inspection Player */}
                      <div className="stitch-card bg-slate-900 border border-slate-800 p-4 rounded-2xl overflow-hidden shadow-lg text-white space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              Candidate Video Assessment Recording
                            </span>
                          </div>
                          {applicantDetail.ai_screen.recording_url ? (
                            <span className="px-2.5 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Stored in Database
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Recording Pending
                            </span>
                          )}
                        </div>

                        {applicantDetail.ai_screen.recording_url ? (
                          <div className="space-y-3">
                            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
                              <video
                                src={applicantDetail.ai_screen.recording_url}
                                controls
                                playsInline
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="flex items-center justify-between text-2xs text-slate-400 pt-1">
                              <span>Playback Speed: 1.0x (controls available in player)</span>
                              <a
                                href={applicantDetail.ai_screen.recording_url}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Recording</span>
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-video bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                            <Video className="w-10 h-10 mb-2 text-slate-600" />
                            <p className="text-xs font-semibold text-slate-400">
                              No video recording uploaded yet
                            </p>
                            <p className="text-3xs text-slate-500 mt-1 max-w-xs">
                              Video response captures will appear here once the candidate records and completes their AI interview session.
                            </p>
                          </div>
                        )}
                      </div>

                      {applicantDetail.ai_screen.summary_evaluation && (
                        <div className="stitch-card bg-purple-50/50 p-5 border border-purple-200 space-y-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase text-purple-900 tracking-wider">
                              AI Screening Scorecard
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-purple-900 bg-purple-100 px-3 py-0.5 rounded-full">
                                Score: {applicantDetail.ai_screen.summary_evaluation.overall_score}/100
                              </span>
                              {applicantDetail.ai_screen.summary_evaluation.recommendation && (
                                <span
                                  className={`text-2xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                                    applicantDetail.ai_screen.summary_evaluation.recommendation
                                      .toLowerCase()
                                      .includes('strong')
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : applicantDetail.ai_screen.summary_evaluation.recommendation
                                          .toLowerCase()
                                          .includes('suitable')
                                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                                      : applicantDetail.ai_screen.summary_evaluation.recommendation
                                          .toLowerCase()
                                          .includes('borderline')
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-rose-100 text-rose-800 border-rose-300'
                                  }`}
                                >
                                  {applicantDetail.ai_screen.summary_evaluation.recommendation}
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-purple-950 leading-relaxed font-medium">
                            {applicantDetail.ai_screen.summary_evaluation.executive_summary}
                          </p>

                          {/* Metric breakdown */}
                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-purple-100 text-2xs">
                            <div className="bg-white p-2 rounded-xl border border-purple-100 text-center">
                              <span className="text-slate-400 block font-bold uppercase">Technical</span>
                              <span className="text-sm font-black text-purple-900">
                                {applicantDetail.ai_screen.summary_evaluation.technical_acumen}/10
                              </span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-purple-100 text-center">
                              <span className="text-slate-400 block font-bold uppercase">Communication</span>
                              <span className="text-sm font-black text-purple-900">
                                {applicantDetail.ai_screen.summary_evaluation.communication}/10
                              </span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-purple-100 text-center">
                              <span className="text-slate-400 block font-bold uppercase">Problem Solving</span>
                              <span className="text-sm font-black text-purple-900">
                                {applicantDetail.ai_screen.summary_evaluation.problem_solving}/10
                              </span>
                            </div>
                          </div>

                          {/* Itemized Question & Rubric Evaluation */}
                          {applicantDetail.ai_screen.summary_evaluation.question_evaluations &&
                            applicantDetail.ai_screen.summary_evaluation.question_evaluations.length > 0 && (
                              <div className="pt-3 border-t border-purple-200/80 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-2xs font-extrabold uppercase text-purple-900 tracking-wider">
                                    Itemized Rubric Criteria Breakdown ({applicantDetail.ai_screen.summary_evaluation.question_evaluations.length} Questions)
                                  </span>
                                  <span className="text-3xs text-purple-600 font-mono">Cloudflare AI Proctor</span>
                                </div>

                                <div className="space-y-3">
                                  {applicantDetail.ai_screen.summary_evaluation.question_evaluations.map((qe, qIdx) => (
                                    <div
                                      key={qIdx}
                                      className="bg-white p-3.5 rounded-2xl border border-purple-100 shadow-2xs space-y-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-900">
                                          Q{qe.question_id}: {qe.theme}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-900 font-mono shrink-0">
                                          {qe.score} / {qe.max_points ?? qe.max_score ?? 20} pts
                                        </span>
                                      </div>

                                      {qe.feedback && (
                                        <p className="text-2xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed italic">
                                          "{qe.feedback}"
                                        </p>
                                      )}

                                      {((qe.criteria_scores && qe.criteria_scores.length > 0) ||
                                        (qe.criteria && qe.criteria.length > 0)) && (
                                        <div className="space-y-1 pt-1">
                                          <span className="text-3xs font-extrabold uppercase text-slate-400 block">
                                            Criteria Scores:
                                          </span>
                                          {(qe.criteria_scores || qe.criteria || []).map(
                                            (cs: CriterionScore, cIdx: number) => (
                                              <div
                                                key={cIdx}
                                                className="flex items-center justify-between text-2xs p-1.5 px-2.5 rounded-lg bg-purple-50/40 border border-purple-100/60"
                                              >
                                                <span className="text-slate-700 font-medium truncate pr-2">
                                                  {cs.criterion}
                                                </span>
                                                <span className="shrink-0 font-bold text-purple-900 font-mono">
                                                  {cs.score} / {cs.max_points ?? cs.max_score ?? 5} pts
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
