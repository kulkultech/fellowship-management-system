import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { sessionService } from '@/services/sessionService';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import toast from 'react-hot-toast';
import {
  Calendar,
  Clock,
  Video,
  Users,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  AlertCircle,
  Loader2,
  Award,
  FileText,
  UserCheck,
  Upload,
  Image as ImageIcon,
  Eye,
  X,
  Camera,
  ShieldCheck,
  Code2,
  Home,
  CalendarDays,
  BookOpen,
  Link2,
} from 'lucide-react';
import { ProgramAssignmentsView } from '@/components/assignments/ProgramAssignmentsView';
import { RoomContentView, roomContentQueryKey } from '@/components/room/RoomContentView';
import { roomContentService } from '@/services/roomContentService';
import { uploadService } from '@/services/uploadService';
import type { ProgramSession, SessionAttendance } from '@/services/types';
import { getGoogleCalendarUrl } from '@/utils/googleCalendar';

export const ProgramRoomPage: React.FC = () => {
  const { orgSlug = '', programSlug = '' } = useParams<{ orgSlug: string; programSlug: string }>();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'assignments' | 'sessions' | 'curriculum' | 'resources'>('assignments');
  const isMentorOrAdmin = Boolean(
    authUser?.role === 'mentor' ||
    authUser?.role === 'org_admin' ||
    authUser?.role === 'superadmin'
  );

  // Check-In with Proof State
  const [checkInSession, setCheckInSession] = useState<ProgramSession | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [viewProofAttendance, setViewProofAttendance] = useState<SessionAttendance | null>(null);

  // 1. Fetch Program Info
  const { data: progData, isLoading: isLoadingProg } = useQuery({
    queryKey: ['program-room-info', orgSlug, programSlug],
    queryFn: () => programService.getProgram(orgSlug, programSlug),
  });

  // 2. Fetch Candidate Applications to verify program room invitation
  const { data: candData, isLoading: isLoadingCand } = useQuery({
    queryKey: ['candidate-applications', authUser?.email],
    queryFn: async () => {
      const res = await apiClient.get('/candidate/applications');
      return res.data;
    },
    enabled: Boolean(authUser?.email),
  });

  const program = progData?.program;
  const org = progData?.organization;
  const applications = candData?.applications || [];
  const currentApp = applications.find(
    (a: any) =>
      a.program_slug === programSlug ||
      (program && a.program_id === program.id)
  );

  const isInvited = Boolean(currentApp?.program_room_invited_at || authUser?.role === 'superadmin' || authUser?.role === 'org_admin' || authUser?.role === 'mentor');

  // 3. Fetch Live Program Sessions
  const { data: realSessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ['candidate-program-sessions', program?.id],
    queryFn: () => (program?.id ? sessionService.listSessions(program.id) : Promise.resolve([])),
    enabled: Boolean(program?.id),
  });

  // Check-In Mutation
  const checkInMutation = useMutation({
    mutationFn: async (payload: { sessionId: string; proof_image_url: string; notes?: string }) => {
      if (!program?.id) return;
      return sessionService.fellowCheckIn(program.id, payload.sessionId, {
        proof_image_url: payload.proof_image_url,
        notes: payload.notes,
      });
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Attendance proof submitted! Awaiting mentor validation.');
      queryClient.invalidateQueries({ queryKey: ['candidate-program-sessions', program?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Check-in failed');
    },
  });

  // Fellow Personal Attendance Stats
  const fellowStats = React.useMemo(() => {
    if (realSessions.length === 0) return null;
    const total = realSessions.length;
    let attended = 0;
    let pending = 0;
    realSessions.forEach((s) => {
      if (s.fellow_attendance?.status === 'present' || s.fellow_attendance?.status === 'late') {
        attended++;
      } else if (s.fellow_attendance?.status === 'pending_validation') {
        pending++;
      }
    });
    const rate = Math.round((attended / total) * 100);
    return { total, attended, pending, rate };
  }, [realSessions]);

  const handleProofFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }
    setProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setProofPreviewUrl(objectUrl);
  };

  const handlePasteProof = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleProofFileSelect(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handlePerformCheckIn = async () => {
    if (!checkInSession || !proofFile || !program?.id) {
      toast.error('Screenshot proof is required to validate attendance');
      return;
    }

    try {
      setIsUploadingProof(true);
      const uploadRes = await uploadService.uploadFile(proofFile, 'attendance');
      await checkInMutation.mutateAsync({
        sessionId: checkInSession.id,
        proof_image_url: uploadRes.url,
        notes: checkInNotes.trim(),
      });
      setCheckInSession(null);
      setProofFile(null);
      setProofPreviewUrl('');
      setCheckInNotes('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to upload proof and check in');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const isLoading = isLoadingProg || isLoadingCand;

  // Curriculum & resources: staff always see them (to add content); fellows once something is there
  const { data: roomContent } = useQuery({
    queryKey: roomContentQueryKey(program?.id || ''),
    queryFn: () => roomContentService.getContent(program!.id),
    enabled: Boolean(program?.id && (isInvited || isMentorOrAdmin)),
  });
  const showCurriculum = Boolean(roomContent?.can_edit || (roomContent?.content.curriculum.length ?? 0) > 0);
  const showResources = Boolean(roomContent?.can_edit || (roomContent?.content.resources.length ?? 0) > 0);

  const roomSections = [
    { id: 'assignments' as const, label: 'Assignments & Projects', icon: FileText },
    { id: 'sessions' as const, label: 'Sessions & Attendance', icon: Calendar },
    ...(showCurriculum ? [{ id: 'curriculum' as const, label: 'Curriculum & Milestones', icon: BookOpen }] : []),
    ...(showResources ? [{ id: 'resources' as const, label: 'Channels & Resources', icon: Link2 }] : []),
  ];
  const roomChildren = roomSections.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    onClick: () => setActiveTab(section.id),
  }));

  const staffDashboardUrl =
    authUser?.role === 'mentor'
      ? '/mentor/dashboard'
      : authUser?.role === 'superadmin'
      ? '/superadmin/dashboard'
      : '/admin/dashboard';

  // Every Program Room this fellow has joined. With more than one, list each program and
  // expand the current one into its sections so they can switch rooms in one click.
  const joinedRooms = applications.filter(
    (a: any) => a.current_stage === 'approved_for_live' && Boolean(a.program_room_invited_at)
  );
  const isCurrentRoom = (a: any) => a.program_slug === programSlug && a.org_slug === orgSlug;
  const candidateRoomChildren =
    joinedRooms.length > 1
      ? joinedRooms.map((a: any) => ({
          id: `room-${a.program_id}`,
          label: a.program_name,
          icon: GraduationCap,
          isExpanded: isCurrentRoom(a),
          onClick: isCurrentRoom(a)
            ? () => setActiveTab('assignments')
            : () => navigate(a.redirect_url || `/programs/${a.org_slug}/${a.program_slug}/room`),
          children: isCurrentRoom(a) ? roomChildren : undefined,
        }))
      : roomChildren;

  // Same sidebar as the candidate dashboard, with this room's sections under Program Room
  const navItems: NavItem[] = isMentorOrAdmin
    ? [
        { id: 'dashboard', label: 'Back to Dashboard', icon: ArrowLeft, onClick: () => navigate(staffDashboardUrl) },
        { id: 'program_room', label: 'Program Room', icon: GraduationCap, onClick: () => setActiveTab('assignments'), children: roomChildren },
      ]
    : [
        { id: 'home', label: 'Home', icon: Home, onClick: () => navigate('/candidate/dashboard') },
        {
          id: 'applications',
          label: 'My Applications',
          icon: FileText,
          onClick: () => navigate('/candidate/dashboard?tab=applications'),
          isExpanded: false,
          children: [
            { id: 'assessments', label: 'Logic MCQ Tests', icon: Clock, onClick: () => navigate('/candidate/dashboard?tab=assessments') },
            { id: 'ai_interview', label: 'AI Technical Screen', icon: Code2, onClick: () => navigate('/candidate/dashboard?tab=ai_interview') },
          ],
        },
        { id: 'program_room', label: 'Program Room', icon: GraduationCap, onClick: () => setActiveTab('assignments'), children: candidateRoomChildren },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays, onClick: () => navigate('/candidate/dashboard?tab=calendar') },
        { id: 'credentials', label: 'Badges & Certificates', icon: Award, onClick: () => navigate('/candidate/dashboard?tab=credentials') },
      ];

  const portalType =
    authUser?.role === 'mentor'
      ? 'mentor'
      : authUser?.role === 'superadmin'
      ? 'superadmin'
      : authUser?.role === 'org_admin'
      ? 'company_admin'
      : 'candidate';

  const roomSubtitle = [
    program?.tracks && program.tracks.length > 0 && currentApp?.track_name ? `Track: ${currentApp.track_name}` : '',
    `Hosted by ${org?.name || 'KulKul Tech'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const renderRoom = (content: React.ReactNode) => (
    <DashboardLayout
      portalType={portalType}
      title={program?.name || 'Program Room'}
      subtitle={program ? roomSubtitle : undefined}
      candidateName={currentApp?.full_name}
      candidateEmail={portalType === 'candidate' ? authUser?.email : undefined}
      companyName={org?.name}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => {
        if (roomSections.some((section) => section.id === id)) setActiveTab(id as typeof activeTab);
      }}
    >
      {content}
    </DashboardLayout>
  );

  if (isLoading) {
    return renderRoom(
      <div className="content-card p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Opening Program Room…</span>
      </div>
    );
  }

  return renderRoom(
      <div className="space-y-6">
        {/* Access Check Notice if pending invite */}
        {!isInvited && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="font-bold">Pending Formal Invitation Email:</strong> Our admissions team has approved your application. You will receive an official room access invitation email shortly.
            </div>
          </div>
        )}

        {/* Tab Content: Assignments & Projects */}
        {activeTab === 'assignments' && program?.id && (
          <ProgramAssignmentsView
            programId={program.id}
            isMentorOrAdmin={isMentorOrAdmin}
            tracks={program.tracks}
            candidateTrackId={currentApp?.track_id}
            userRole={authUser?.role}
          />
        )}

        {activeTab === 'curriculum' && program?.id && <RoomContentView programId={program.id} section="curriculum" />}
        {activeTab === 'resources' && program?.id && <RoomContentView programId={program.id} section="resources" />}

        {/* Tab Content: Sessions & Attendance */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            {/* Fellow attendance: one line + progress bar (colour shows the status) */}
            {fellowStats && !isMentorOrAdmin && (
              <div className="content-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  <strong
                    className={`text-sm font-extrabold ${
                      fellowStats.rate >= 80
                        ? 'text-emerald-700'
                        : fellowStats.rate >= 65
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {fellowStats.rate}% attendance
                  </strong>
                  {' · '}
                  {fellowStats.attended}/{fellowStats.total} sessions · 80% needed to graduate
                  {fellowStats.pending > 0 && (
                    <span className="text-amber-700 font-bold"> · {fellowStats.pending} awaiting mentor validation</span>
                  )}
                </p>

                <div className="sm:w-56 w-full bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      fellowStats.rate >= 80
                        ? 'bg-emerald-500'
                        : fellowStats.rate >= 65
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, fellowStats.rate))}%` }}
                  />
                </div>
              </div>
            )}

            <div className="content-card space-y-6">
              {isLoadingSessions ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Loading fellowship sessions...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {realSessions.length > 0 ? (
                    realSessions.map((sess) => {
                      const isPendingValidation = sess.fellow_attendance?.status === 'pending_validation';
                      const isVerified = Boolean(
                        sess.fellow_attendance?.status === 'present' ||
                        sess.fellow_attendance?.status === 'late'
                      );
                      const isExcused = sess.fellow_attendance?.status === 'excused';
                      const isRejectedProof = Boolean(
                        sess.fellow_attendance?.status === 'absent' && sess.fellow_attendance?.proof_image_url
                      );

                      const startDate = new Date(sess.start_time);
                      const endDate = new Date(sess.end_time);
                      const formattedDate = new Intl.DateTimeFormat('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      }).format(startDate);
                      const formattedTime = `${startDate.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                      return (
                        <div
                          key={sess.id}
                          className="panel-muted hover:border-slate-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0 border border-purple-200">
                              <Video className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="card-title">{sess.title}</h4>
                                <span className="text-3xs font-bold uppercase tracking-wider text-slate-500">
                                  {sess.session_type.replace('_', ' ')}
                                </span>
                                {sess.target_applicant_ids && sess.target_applicant_ids.length === 1 ? (
                                  <span className="text-2xs font-bold text-amber-700 flex items-center gap-1">
                                    <UserCheck className="w-3 h-3" />
                                    1-on-1 Session
                                  </span>
                                ) : isMentorOrAdmin && sess.target_applicant_ids && sess.target_applicant_ids.length > 1 ? (
                                  <span className="text-2xs font-bold text-indigo-700 flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    Group Session
                                  </span>
                                ) : null}
                                {sess.track_name && Boolean(program?.tracks && program.tracks.length > 0) && (
                                  <span className="text-2xs font-bold text-kulkul-purple">
                                    {sess.track_name}
                                  </span>
                                )}
                              </div>
                              {sess.description && (
                                <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{sess.description}</p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                                <span>{formattedDate}</span>
                                <span>&bull;</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formattedTime}
                                </span>
                                {sess.mentor_name && (
                                  <>
                                    <span>&bull;</span>
                                    <span>Host: <strong>{sess.mentor_name}</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto flex-wrap">
                            {isPendingValidation ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                                  <span>Attendance Submitted &bull; Awaiting Validation</span>
                                </span>
                                {sess.fellow_attendance?.proof_image_url && (
                                  <button
                                    type="button"
                                    onClick={() => setViewProofAttendance(sess.fellow_attendance!)}
                                    className="btn btn-sm btn-outline"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                                    <span>View Proof</span>
                                  </button>
                                )}
                              </div>
                            ) : isVerified ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>
                                    Verified {sess.fellow_attendance?.status === 'late' ? 'Late' : 'Present'}
                                  </span>
                                </span>
                                {sess.fellow_attendance?.proof_image_url && (
                                  <button
                                    type="button"
                                    onClick={() => setViewProofAttendance(sess.fellow_attendance!)}
                                    className="btn btn-sm btn-outline"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                                    <span>View Proof</span>
                                  </button>
                                )}
                              </div>
                            ) : isRejectedProof ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Attendance Not Validated</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCheckInSession(sess);
                                    setProofFile(null);
                                    setProofPreviewUrl('');
                                    setCheckInNotes('');
                                  }}
                                  className="btn btn-sm btn-danger-ghost"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Re-submit Proof</span>
                                </button>
                              </div>
                            ) : isExcused ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                <span>Excused</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckInSession(sess);
                                  setProofFile(null);
                                  setProofPreviewUrl('');
                                  setCheckInNotes('');
                                }}
                                className="btn btn-sm btn-success"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Check-in Attendance</span>
                              </button>
                            )}

                            <Link
                              to={`/programs/${orgSlug}/${programSlug}/sessions/${sess.id}/room`}
                              className="btn btn-sm btn-outline"
                              title="Open Live Code Workspace"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                              <span>Code Workspace</span>
                            </Link>

                            {sess.meeting_url && (
                              <a
                                href={sess.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-sm btn-outline"
                                title="Join Google Meet"
                              >
                                <Video className="w-3.5 h-3.5 text-blue-600" />
                                <span>Meet</span>
                              </a>
                            )}

                            <a
                              href={getGoogleCalendarUrl(sess)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-sm btn-outline"
                              title="Add to Google Calendar"
                            >
                              <Calendar className="w-3.5 h-3.5 text-kulkul-purple" />
                              <span>Calendar</span>
                            </a>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-10 text-center text-xs text-slate-500">No sessions scheduled yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Check-In with Proof Screenshot Modal */}
        {checkInSession && (
          <div
            className="modal-backdrop animate-in fade-in"
            onPaste={handlePasteProof}
          >
            <div className="modal-panel max-w-lg animate-in zoom-in-95">
              <div className="section-header">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="section-title">Attendance Validation</h3>
                    <p className="section-subtitle line-clamp-1">{checkInSession.title}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCheckInSession(null);
                    setProofFile(null);
                    setProofPreviewUrl('');
                    setCheckInNotes('');
                  }}
                  className="btn btn-icon-sm btn-ghost"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Requirement Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <Camera className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Screenshot proof required: </span>
                  Please upload a screenshot of your live meeting screen (Google Meet / Zoom) showing your presence. Your mentor will review and validate whether you attended before attendance is officially verified.
                </div>
              </div>

              {/* Screenshot Upload / Drop / Paste Area */}
              <div className="space-y-2">
                <label className="field-label flex items-center justify-between">
                  <span>Meeting Screenshot</span>
                  <span className="meta-text font-semibold">PNG, JPG, or WEBP (Max 10MB)</span>
                </label>

                {proofPreviewUrl ? (
                  <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                    <div className="relative rounded-xl overflow-hidden max-h-56 bg-black/5 flex items-center justify-center border border-slate-100">
                      <img
                        src={proofPreviewUrl}
                        alt="Screenshot proof preview"
                        className="object-contain max-h-56 w-full"
                      />
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {proofFile?.name || 'pasted-screenshot.png'}
                        </span>
                        {proofFile?.size && (
                          <span className="text-3xs text-slate-400 shrink-0">
                            ({(proofFile.size / 1024).toFixed(0)} KB)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProofFile(null);
                          setProofPreviewUrl('');
                        }}
                        className="btn btn-sm btn-danger-ghost"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) handleProofFileSelect(droppedFile);
                    }}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/30 rounded-2xl p-6 cursor-pointer transition text-center group"
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProofFileSelect(file);
                      }}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 group-hover:text-emerald-600 flex items-center justify-center shadow-xs border border-slate-200 group-hover:border-emerald-200 mb-2 transition">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 group-hover:text-emerald-700">
                      Click to upload or drag &amp; drop screenshot
                    </span>
                    <span className="text-2xs text-slate-500 mt-1">
                      Tip: You can also paste directly with <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-3xs">Ctrl+V</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-3xs">⌘+V</kbd>
                    </span>
                  </label>
                )}
              </div>

              {/* Optional Notes */}
              <div className="space-y-1.5">
                <label className="field-label">
                  Notes / Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="e.g. Joined from secondary device, mic muted due to noise..."
                  rows={2}
                  className="form-textarea resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="modal-footer">
                <button
                  type="button"
                  disabled={isUploadingProof || checkInMutation.isPending}
                  onClick={() => {
                    setCheckInSession(null);
                    setProofFile(null);
                    setProofPreviewUrl('');
                    setCheckInNotes('');
                  }}
                  className="btn btn-sm btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!proofFile || isUploadingProof || checkInMutation.isPending}
                  onClick={handlePerformCheckIn}
                  className="btn btn-sm btn-success"
                >
                  {isUploadingProof || checkInMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating Proof...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Submit Attendance Proof</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Submitted Proof Modal */}
        {viewProofAttendance && (
          <div className="modal-backdrop animate-in fade-in">
            <div className="modal-panel max-w-xl animate-in zoom-in-95">
              <div className="section-header">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="section-title">Attendance Validation Proof</h3>
                    <p className="section-subtitle">
                      Status: <span className="font-bold text-emerald-700 uppercase">{viewProofAttendance.status}</span>
                      {viewProofAttendance.checked_in_at && ` • ${new Date(viewProofAttendance.checked_in_at).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewProofAttendance(null)}
                  className="btn btn-icon-sm btn-ghost"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {viewProofAttendance.proof_image_url ? (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-[70vh] flex items-center justify-center">
                    <img
                      src={viewProofAttendance.proof_image_url}
                      alt="Uploaded Attendance Proof"
                      className="object-contain max-h-[60vh] w-full"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    {viewProofAttendance.notes ? (
                      <p className="text-slate-600 italic">
                        <span className="font-semibold not-italic text-slate-800">Fellow Note: </span>
                        {viewProofAttendance.notes}
                      </p>
                    ) : (
                      <span className="text-slate-400">No additional notes submitted.</span>
                    )}
                    <a
                      href={viewProofAttendance.proof_image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline shrink-0 ml-3"
                    >
                      <span>Full Resolution</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-xs">No screenshot proof recorded for this attendance record.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
};
