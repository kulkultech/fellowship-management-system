import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionService } from '@/services/sessionService';
import { mentorService } from '@/services/mentorService';
import type {
  ProgramSession,
  CreateSessionPayload,
  AttendanceStatus,
  Track,
  ProgramMentor,
  MentorAttendance,
} from '@/services/types';
import {
  Calendar,
  Clock,
  Video,
  Plus,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Edit2,
  Trash2,
  Search,
  TrendingUp,
  Check,
  X,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Award,
  AlertTriangle,
  Eye,
  Camera,
  Code2,
  CalendarDays,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { IndonesianCalendarView } from './IndonesianCalendarView';
import { FellowPicker } from './FellowPicker';
import { getIndonesianHoliday } from '@/utils/indonesianHolidays';
import { getGoogleCalendarUrl, generateClientGoogleMeetLink } from '@/utils/googleCalendar';

interface ProgramSessionsViewProps {
  programId: string;
  programName?: string;
  isMentor?: boolean;
  tracks?: Track[];
  mentors?: ProgramMentor[];
  /** Show the metric cards above the sessions (default true) */
  showSummary?: boolean;
}

export const ProgramSessionsView: React.FC<ProgramSessionsViewProps> = ({
  showSummary = true,
  programId,
  isMentor = false,
  tracks = [],
  mentors = [],
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'sessions' | 'calendar' | 'summary'>('sessions');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ProgramSession | null>(null);
  const [activeAttendanceSession, setActiveAttendanceSession] = useState<ProgramSession | null>(null);

  // Filter & Search
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Fetch Sessions
  const {
    data: sessions = [],
    isLoading: isLoadingSessions,
  } = useQuery({
    queryKey: ['program-sessions', programId],
    queryFn: () => sessionService.listSessions(programId),
    enabled: Boolean(programId),
  });

  // 2. Fetch Attendance Summary
  const {
    data: summaries = [],
    isLoading: isLoadingSummaries,
  } = useQuery({
    queryKey: ['program-attendance-summary', programId],
    queryFn: () => sessionService.getAttendanceSummary(programId),
    enabled: Boolean(programId),
  });

  // 3. Fetch Attendance for Active Session Modal
  const {
    data: sessionAttendanceList = [],
    isLoading: isLoadingAttendance,
  } = useQuery({
    queryKey: ['session-attendance', programId, activeAttendanceSession?.id],
    queryFn: () =>
      activeAttendanceSession
        ? sessionService.getSessionAttendance(programId, activeAttendanceSession.id)
        : Promise.resolve([]),
    enabled: Boolean(programId && activeAttendanceSession?.id),
  });

  // Local Attendance State for Check Sheet (optimistic batch editing)
  const [attendanceSheet, setAttendanceSheet] = useState<
    Array<{
      applicant_id: string;
      status: AttendanceStatus;
      notes: string;
      fellow_name: string;
      track_name: string;
      proof_image_url?: string;
    }>
  >([]);

  // Mentor Screenshot Proof Lightbox State
  const [previewProof, setPreviewProof] = useState<{
    applicant_id: string;
    fellow_name: string;
    proof_image_url: string;
    notes?: string;
    status: string;
  } | null>(null);

  // Sync attendanceSheet when sessionAttendanceList loads
  React.useEffect(() => {
    if (sessionAttendanceList.length > 0) {
      setAttendanceSheet(
        sessionAttendanceList.map((a) => ({
          applicant_id: a.applicant_id,
          status: a.status || 'absent',
          notes: a.notes || '',
          fellow_name: a.fellow_name || 'Fellow',
          track_name: a.track_name || '',
          proof_image_url: a.proof_image_url || '',
        }))
      );
    }
  }, [sessionAttendanceList]);

  // Mentor attendance (tracked by admins; mentors only see fellows)
  const canTrackMentors = !isMentor;
  const [checkSheetTab, setCheckSheetTab] = useState<'fellows' | 'mentors'>('fellows');
  const [summaryView, setSummaryView] = useState<'fellows' | 'mentors'>('fellows');
  const [mentorSheet, setMentorSheet] = useState<MentorAttendance[]>([]);

  React.useEffect(() => {
    setCheckSheetTab('fellows');
  }, [activeAttendanceSession?.id]);

  const { data: mentorAttendanceList = [], isLoading: isLoadingMentorAttendance } = useQuery({
    queryKey: ['session-mentor-attendance', programId, activeAttendanceSession?.id],
    queryFn: () => sessionService.getMentorAttendance(programId, activeAttendanceSession!.id),
    enabled: Boolean(canTrackMentors && programId && activeAttendanceSession?.id),
  });

  React.useEffect(() => {
    setMentorSheet(mentorAttendanceList.map((m) => ({ ...m, notes: m.notes || '' })));
  }, [mentorAttendanceList]);

  const { data: mentorSummaries = [], isLoading: isLoadingMentorSummaries } = useQuery({
    queryKey: ['program-mentor-attendance-summary', programId],
    queryFn: () => sessionService.getMentorAttendanceSummary(programId),
    enabled: Boolean(canTrackMentors && programId && activeTab === 'summary' && summaryView === 'mentors'),
  });

  const saveMentorAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!activeAttendanceSession) return;
      await sessionService.batchUpdateMentorAttendance(
        programId,
        activeAttendanceSession.id,
        mentorSheet.map((m) => ({ user_id: m.user_id, status: m.status, notes: m.notes }))
      );
    },
    onSuccess: () => {
      toast.success('Mentor attendance saved');
      queryClient.invalidateQueries({ queryKey: ['program-mentor-attendance-summary', programId] });
      queryClient.invalidateQueries({ queryKey: ['session-mentor-attendance', programId, activeAttendanceSession?.id] });
      setActiveAttendanceSession(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save mentor attendance');
    },
  });

  const updateMentorSheet = (userId: string, changes: Partial<MentorAttendance>) => {
    setMentorSheet((prev) => prev.map((m) => (m.user_id === userId ? { ...m, ...changes } : m)));
  };

  // Session Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<ProgramSession['session_type']>('live_lecture');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formRecordingUrl, setFormRecordingUrl] = useState('');
  const [formTrackId, setFormTrackId] = useState<string>('');
  const [formMentorId, setFormMentorId] = useState<string>('');
  const [formAutoGenerateMeet, setFormAutoGenerateMeet] = useState<boolean>(true);
  const [formSendCalendarInvites, setFormSendCalendarInvites] = useState<boolean>(true);

  // Indonesian Calendar Sync Toggle state
  const [syncIndonesianCalendar, setSyncIndonesianCalendar] = useState<boolean>(() => {
    const saved = localStorage.getItem(`sync_indonesian_calendar_${programId}`);
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleIndonesianSync = (val: boolean) => {
    setSyncIndonesianCalendar(val);
    localStorage.setItem(`sync_indonesian_calendar_${programId}`, String(val));
  };

  // Indonesian Holiday Validation for selected dates
  const startHolidayInfo = useMemo(() => getIndonesianHoliday(formStartDate), [formStartDate]);
  const endHolidayInfo = useMemo(() => getIndonesianHoliday(formEndDate), [formEndDate]);
  const isHolidaySelected = syncIndonesianCalendar && (startHolidayInfo.isHoliday || endHolidayInfo.isHoliday);

  // Student targeting for sessions
  const { data: fellowsData } = useQuery({
    queryKey: ['program-fellows-for-sessions', programId],
    queryFn: () => mentorService.getProgramFellows(programId),
    enabled: Boolean(programId),
  });
  const allFellows = fellowsData?.fellows || [];

  const [formAudience, setFormAudience] = useState<'all' | 'group'>('all');
  const [selectedFellowIds, setSelectedFellowIds] = useState<string[]>([]);

  const openCreateModal = (initialDate?: string) => {
    setEditingSession(null);
    setFormTitle('');
    setFormDescription('');
    setFormType('live_lecture');
    setFormAudience('all');
    setSelectedFellowIds([]);
    const targetDate = initialDate || new Date().toISOString().split('T')[0];
    setFormStartDate(targetDate);
    setFormStartTime('19:00');
    setFormEndDate(targetDate);
    setFormEndTime('20:30');
    setFormAutoGenerateMeet(true);
    setFormSendCalendarInvites(true);
    setFormMeetingUrl(generateClientGoogleMeetLink());
    setFormRecordingUrl('');
    setFormTrackId('');
    setFormMentorId('');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (sess: ProgramSession) => {
    setEditingSession(sess);
    setFormTitle(sess.title);
    setFormDescription(sess.description || '');
    setFormType(sess.session_type);

    if (sess.target_applicant_ids && sess.target_applicant_ids.length > 0) {
      setFormAudience('group');
      setSelectedFellowIds(sess.target_applicant_ids);
    } else {
      setFormAudience('all');
      setSelectedFellowIds([]);
    }

    const s = new Date(sess.start_time);
    const e = new Date(sess.end_time);

    setFormStartDate(s.toISOString().split('T')[0]);
    setFormStartTime(s.toTimeString().slice(0, 5));
    setFormEndDate(e.toISOString().split('T')[0]);
    setFormEndTime(e.toTimeString().slice(0, 5));

    setFormAutoGenerateMeet(false);
    setFormSendCalendarInvites(true);
    setFormMeetingUrl(sess.meeting_url || '');
    setFormRecordingUrl(sess.recording_url || '');
    setFormTrackId(sess.track_id || '');
    setFormMentorId(sess.mentor_id || '');
    setIsCreateModalOpen(true);
  };

  // Create / Update Mutation
  const saveSessionMutation = useMutation({
    mutationFn: async () => {
      if (formAudience === 'group' && selectedFellowIds.length === 0) {
        throw new Error('Please select at least 1 fellow for a group session');
      }

      if (syncIndonesianCalendar && isHolidaySelected) {
        const holidayName = startHolidayInfo.name || endHolidayInfo.name || 'Public Holiday';
        throw new Error(`Cannot schedule session on Indonesian national holiday: ${holidayName}`);
      }

      const startDateTime = new Date(`${formStartDate}T${formStartTime}:00`).toISOString();
      const endDateTime = new Date(`${formEndDate}T${formEndTime}:00`).toISOString();

      const payload: CreateSessionPayload = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        session_type: formType,
        start_time: startDateTime,
        end_time: endDateTime,
        meeting_url: formMeetingUrl.trim(),
        recording_url: formRecordingUrl.trim() || undefined,
        track_id: formTrackId || undefined,
        mentor_id: formMentorId || undefined,
        target_applicant_ids: formAudience !== 'all' ? selectedFellowIds : [],
        sync_indonesian_calendar: syncIndonesianCalendar,
        auto_generate_meeting: formAutoGenerateMeet,
        send_calendar_invites: formSendCalendarInvites,
      };

      if (editingSession) {
        return sessionService.updateSession(programId, editingSession.id, payload);
      }
      return sessionService.createSession(programId, payload);
    },
    onSuccess: () => {
      toast.success(editingSession ? 'Session updated successfully' : 'Session scheduled successfully');
      queryClient.invalidateQueries({ queryKey: ['program-sessions', programId] });
      queryClient.invalidateQueries({ queryKey: ['program-attendance-summary', programId] });
      setIsCreateModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save session');
    },
  });

  // Delete Mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await sessionService.deleteSession(programId, sessionId);
    },
    onSuccess: () => {
      toast.success('Session deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['program-sessions', programId] });
      queryClient.invalidateQueries({ queryKey: ['program-attendance-summary', programId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete session');
    },
  });

  // Batch Attendance Save Mutation
  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!activeAttendanceSession) return;
      await sessionService.batchUpdateAttendance(programId, activeAttendanceSession.id, {
        attendances: attendanceSheet.map((a) => ({
          applicant_id: a.applicant_id,
          status: a.status,
          notes: a.notes,
        })),
      });
    },
    onSuccess: () => {
      toast.success('Attendance recorded and updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['program-sessions', programId] });
      queryClient.invalidateQueries({ queryKey: ['program-attendance-summary', programId] });
      queryClient.invalidateQueries({ queryKey: ['session-attendance', programId, activeAttendanceSession?.id] });
      setActiveAttendanceSession(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to update attendance');
    },
  });

  // Single Fellow Attendance Validation Mutation (Mentor Validation)
  const validateAttendanceMutation = useMutation({
    mutationFn: async ({
      applicantId,
      status,
      notes,
    }: {
      applicantId: string;
      status: AttendanceStatus;
      notes?: string;
    }) => {
      if (!activeAttendanceSession) return;
      return sessionService.validateAttendance(programId, activeAttendanceSession.id, applicantId, {
        status,
        notes,
      });
    },
    onSuccess: (_, variables) => {
      const statusLabel =
        variables.status === 'present'
          ? 'Present'
          : variables.status === 'late'
          ? 'Late'
          : variables.status === 'absent'
          ? 'Absent'
          : 'Excused';
      toast.success(`Attendance validated as ${statusLabel}!`);
      // Update local check sheet table immediately
      setAttendanceSheet((prev) =>
        prev.map((item) =>
          item.applicant_id === variables.applicantId
            ? { ...item, status: variables.status, notes: variables.notes !== undefined ? variables.notes : item.notes }
            : item
        )
      );
      queryClient.invalidateQueries({ queryKey: ['program-sessions', programId] });
      queryClient.invalidateQueries({ queryKey: ['program-attendance-summary', programId] });
      queryClient.invalidateQueries({ queryKey: ['session-attendance', programId, activeAttendanceSession?.id] });
      setPreviewProof(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to validate attendance');
    },
  });

  // Helper: Mark All Present
  const handleMarkAllPresent = () => {
    setAttendanceSheet((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'present',
      }))
    );
    toast.success('All fellows marked Present. Click "Save Attendance" to confirm.');
  };

  // Helper: Update Single Fellow Status
  const handleToggleFellowStatus = (applicantId: string, status: AttendanceStatus) => {
    setAttendanceSheet((prev) =>
      prev.map((item) => (item.applicant_id === applicantId ? { ...item, status } : item))
    );
  };

  // Helper: Update Single Fellow Note
  const handleUpdateFellowNote = (applicantId: string, notes: string) => {
    setAttendanceSheet((prev) =>
      prev.map((item) => (item.applicant_id === applicantId ? { ...item, notes } : item))
    );
  };

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedTrackFilter !== 'all' && s.track_id !== selectedTrackFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.title.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.session_type.toLowerCase().includes(q) ||
          s.mentor_name?.toLowerCase().includes(q) ||
          s.track_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sessions, selectedTrackFilter, searchQuery]);

  // Overall Cohort Metrics
  const cohortMetrics = useMemo(() => {
    const totalFellows = summaries.length;
    const totalSessions = sessions.length;

    let totalAttendanceRateSum = 0;
    let goodCount = 0;
    let warningCount = 0;
    let atRiskCount = 0;

    summaries.forEach((s) => {
      totalAttendanceRateSum += s.attendance_rate;
      if (s.status === 'Good') goodCount++;
      else if (s.status === 'Warning') warningCount++;
      else atRiskCount++;
    });

    const avgAttendanceRate =
      totalFellows > 0 ? Math.round(totalAttendanceRateSum / totalFellows) : totalSessions > 0 ? 0 : 100;

    return {
      totalFellows,
      totalSessions,
      avgAttendanceRate,
      goodCount,
      warningCount,
      atRiskCount,
    };
  }, [summaries, sessions]);

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics Banner */}
      {showSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="content-card space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="stat-label">Accepted Fellows</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="stat-value">{cohortMetrics.totalFellows}</div>
          </div>

          <div className="content-card space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="stat-label">Cohort Attendance</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="stat-value">{cohortMetrics.avgAttendanceRate}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cohortMetrics.avgAttendanceRate >= 80
                    ? 'bg-emerald-500'
                    : cohortMetrics.avgAttendanceRate >= 65
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, cohortMetrics.avgAttendanceRate))}%` }}
              />
            </div>
          </div>

          <div className="content-card space-y-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="stat-label">Attendance Health</span>
              <Award className="w-4 h-4 text-kulkul-orange" />
            </div>
            <div className="flex items-center gap-3 pt-0.5 text-2xs font-bold">
              <span className="text-emerald-700">
                {cohortMetrics.goodCount} Good
              </span>
              <span className="text-amber-700">
                {cohortMetrics.warningCount} Warn
              </span>
              {cohortMetrics.atRiskCount > 0 && (
                <span className="text-rose-700">
                  {cohortMetrics.atRiskCount} Risk
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="content-card space-y-6">
        {/* Tabs + primary action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full scrollbar-none">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`tab-pill shrink-0 ${activeTab === 'sessions' ? 'tab-pill-active' : ''}`}
            >
              <Calendar className="w-4 h-4" />
              <span>Cohort Sessions ({sessions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`tab-pill shrink-0 ${activeTab === 'calendar' ? 'tab-pill-active' : ''}`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>{syncIndonesianCalendar ? 'Calendar & ID Holidays' : 'Calendar & Schedule'}</span>
            </button>

            <button
              onClick={() => setActiveTab('summary')}
              className={`tab-pill shrink-0 ${activeTab === 'summary' ? 'tab-pill-active' : ''}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Attendance Tracker &amp; Risk Monitor</span>
            </button>
          </div>

          <button onClick={() => openCreateModal()} className="btn btn-sm btn-primary shrink-0 self-end sm:self-auto">
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule New Session</span>
          </button>
        </div>

        {/* Tab 1: Cohort Sessions */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            {/* Toolbar: search on the left, filters on the right */}
            <div className="table-toolbar">
              <div className="search-field">
                <Search />
                <input
                  type="text"
                  placeholder="Search sessions by title, mentor, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>

              {tracks.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTrackFilter}
                    onChange={(e) => setSelectedTrackFilter(e.target.value)}
                    className="filter-select"
                    aria-label="Filter by track"
                  >
                    <option value="all">All Tracks</option>
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {isLoadingSessions ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                <span className="text-xs font-bold">Loading fellowship sessions...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6" />
                </div>
                <h4 className="card-title">No Fellowship Sessions Scheduled</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Get your cohort underway by scheduling live lectures, technical workshops, or weekly mentor syncs.
                </p>
                <button onClick={() => openCreateModal()} className="btn btn-sm btn-outline mt-2">
                  <Plus className="w-3.5 h-3.5" />
                  Schedule First Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="panel hover:border-slate-300 hover:bg-slate-50/50 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0 border border-purple-100">
                        <Video className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="card-title">{sess.title}</h4>
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {sess.session_type.replace('_', ' ')}
                          </span>
                          {sess.target_applicant_ids && sess.target_applicant_ids.length > 0 ? (
                            <span className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              Group ({sess.target_applicant_ids.length} {sess.target_applicant_ids.length === 1 ? 'fellow' : 'fellows'})
                            </span>
                          ) : null}
                          {sess.track_name && tracks.length > 0 && (
                            <span className="text-xs font-bold text-kulkul-purple">
                              {sess.track_name}
                            </span>
                          )}
                        </div>

                        {sess.description && (
                          <p className="text-xs text-slate-600 line-clamp-1">{sess.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap pt-0.5">
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatDateTime(sess.start_time)} &ndash;{' '}
                            {new Date(sess.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {sess.mentor_name && (
                            <span>&bull; Lead: <strong>{sess.mentor_name}</strong></span>
                          )}
                          {sess.google_calendar_event_id && (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700" title="Synchronized with Google Calendar">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Calendar Synced</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Action & Attendance Stat */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 self-stretch lg:self-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 w-full lg:w-auto justify-between lg:justify-end">
                      <div className="flex items-center gap-3">
                        {sess.pending_count !== undefined && sess.pending_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 animate-pulse">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{sess.pending_count} Pending Review</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {sess.present_count || 0} / {sess.total_fellows || cohortMetrics.totalFellows} Present
                          </span>
                          {sess.attendance_rate !== undefined && (
                            <span
                              className={`ml-1 text-xs font-extrabold ${
                                sess.attendance_rate >= 80
                                  ? 'text-emerald-700'
                                  : sess.attendance_rate >= 65
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              ({sess.attendance_rate}%)
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
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

                        {!sess.google_calendar_event_id && (
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
                        )}

                        <Link
                          to={`/sessions/${sess.id}/room`}
                          className="btn btn-sm btn-outline"
                          title="Enter Live Workspace (Code Studio, Excalidraw Whiteboard, Notes)"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span>Live Workspace</span>
                        </Link>

                        <button
                          onClick={() => {
                            setActiveAttendanceSession(sess);
                          }}
                          className="btn btn-sm btn-success"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Attendance</span>
                        </button>

                        <button
                          onClick={() => openEditModal(sess)}
                          className="btn btn-icon-sm btn-ghost"
                          title="Edit Session"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete session "${sess.title}"?`)) {
                              deleteSessionMutation.mutate(sess.id);
                            }
                          }}
                          className="btn btn-icon-sm btn-ghost-danger"
                          title="Delete Session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Indonesian Calendar & Public Holidays */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <IndonesianCalendarView
              sessions={sessions}
              onSelectDateToSchedule={(dateStr) => {
                openCreateModal(dateStr);
              }}
              onSelectSession={(session) => {
                openEditModal(session);
              }}
              isMentorOrAdmin={true}
              syncIndonesianCalendar={syncIndonesianCalendar}
              onToggleSyncIndonesianCalendar={handleToggleIndonesianSync}
            />
          </div>
        )}

        {/* Tab 3: Attendance Summary & Risk Monitor */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {canTrackMentors && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSummaryView('fellows')}
                  className={`tab-pill ${summaryView === 'fellows' ? 'tab-pill-active' : ''}`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Fellows</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryView('mentors')}
                  className={`tab-pill ${summaryView === 'mentors' ? 'tab-pill-active' : ''}`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Mentors</span>
                </button>
              </div>
            )}

            {summaryView === 'mentors' ? (
              isLoadingMentorSummaries ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Calculating mentor attendance...</span>
                </div>
              ) : mentorSummaries.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8 space-y-2">
                  <Award className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="card-title">No Mentors Yet</h4>
                  <p className="text-xs text-slate-500">
                    Mentors assigned to this program, or leading one of its sessions, appear here.
                  </p>
                </div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>Mentor</th>
                        <th className="text-center">Sessions Held</th>
                        <th className="text-center">Led</th>
                        <th className="text-center">Present</th>
                        <th className="text-center">Late</th>
                        <th className="text-center">Absent</th>
                        <th className="text-center">Excused</th>
                        <th className="text-center">Rate (%)</th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mentorSummaries.map((m) => (
                        <tr key={m.user_id} className="transition">
                          <td>
                            <div className="cell-primary">{m.full_name}</div>
                            <div className="cell-secondary">{m.role_title || m.email}</div>
                          </td>
                          <td className="text-center font-bold text-slate-700">{m.total_sessions}</td>
                          <td className="text-center font-bold text-kulkul-purple">{m.led_count}</td>
                          <td className="text-center font-bold text-emerald-700">{m.present_count}</td>
                          <td className="text-center font-bold text-amber-600">{m.late_count}</td>
                          <td className="text-center font-bold text-rose-600">{m.absent_count}</td>
                          <td className="text-center font-bold text-slate-500">{m.excused_count}</td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-extrabold text-slate-900">{m.attendance_rate}%</span>
                              <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full rounded-full ${
                                    m.attendance_rate >= 80
                                      ? 'bg-emerald-500'
                                      : m.attendance_rate >= 65
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${m.attendance_rate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <span
                              className={`inline-flex items-center gap-1 text-3xs font-extrabold uppercase tracking-wider ${
                                m.status === 'Good'
                                  ? 'text-emerald-700'
                                  : m.status === 'Warning'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {m.status === 'Good' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                              {m.status === 'Warning' && <AlertCircle className="w-3 h-3 text-amber-600" />}
                              {m.status === 'At Risk' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                              <span>{m.status}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : isLoadingSummaries ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                <span className="text-xs font-bold">Calculating attendance metrics...</span>
              </div>
            ) : summaries.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8 space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="card-title">No Fellows in Cohort Yet</h4>
                <p className="text-xs text-slate-500">
                  Accepted fellows will appear here automatically once moved to "Approved for Live" stage.
                </p>
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table min-w-[700px]">
                  <thead>
                    <tr>
                      <th>Fellow</th>
                      {tracks.length > 0 && <th>Track</th>}
                      <th className="text-center">Sessions</th>
                      <th className="text-center">Present</th>
                      <th className="text-center">Late</th>
                      <th className="text-center">Pending</th>
                      <th className="text-center">Absent</th>
                      <th className="text-center">Excused</th>
                      <th className="text-center">Rate (%)</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((s) => (
                      <tr key={s.applicant_id} className="transition">
                        <td>
                          <div className="cell-primary">{s.full_name}</div>
                          <div className="cell-secondary">{s.email}</div>
                        </td>
                        {tracks.length > 0 && (
                          <td className="text-slate-600 font-medium">
                            {s.track_name || <span className="text-slate-400">&mdash;</span>}
                          </td>
                        )}
                        <td className="text-center font-bold text-slate-700">{s.total_sessions}</td>
                        <td className="text-center font-bold text-emerald-700">{s.present_count}</td>
                        <td className="text-center font-bold text-amber-600">{s.late_count}</td>
                        <td className="text-center font-bold text-amber-700">
                          {s.pending_count !== undefined && s.pending_count > 0 ? (
                            <span className="text-amber-700 font-extrabold">{s.pending_count}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="text-center font-bold text-rose-600">{s.absent_count}</td>
                        <td className="text-center font-bold text-slate-500">{s.excused_count}</td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-extrabold text-slate-900">{s.attendance_rate}%</span>
                            <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden hidden sm:block">
                              <div
                                className={`h-full rounded-full ${
                                  s.attendance_rate >= 80
                                    ? 'bg-emerald-500'
                                    : s.attendance_rate >= 65
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${s.attendance_rate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-3xs font-extrabold uppercase tracking-wider ${
                              s.status === 'Good'
                                ? 'text-emerald-700'
                                : s.status === 'Warning'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {s.status === 'Good' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {s.status === 'Warning' && <AlertCircle className="w-3 h-3 text-amber-600" />}
                            {s.status === 'At Risk' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                            <span>{s.status}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Schedule / Edit Session */}
      {isCreateModalOpen && (
        <div className="modal-backdrop animate-in fade-in duration-200">
          <div className="modal-panel max-w-xl">
            <div className="section-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="section-title">
                    {editingSession ? 'Edit Fellowship Session' : 'Schedule Fellowship Session'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="btn btn-icon-sm btn-ghost"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSessionMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="field-label">
                  Session Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems Architecture & Sync"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Target Audience Selector */}
              <div className="space-y-2.5">
                <label className="field-label">
                  Target Audience *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormAudience('all');
                      setSelectedFellowIds([]);
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer ${
                      formAudience === 'all'
                        ? 'border-kulkul-purple bg-purple-50/50 ring-2 ring-purple-100 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        formAudience === 'all'
                          ? 'bg-kulkul-purple text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="card-title">All Fellows</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {tracks.length > 0 ? 'Cohort or track-wide' : 'Cohort-wide'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormAudience('group');
                      if (formType === 'live_lecture') {
                        setFormType('group_sync');
                      }
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer ${
                      formAudience === 'group'
                        ? 'border-kulkul-purple bg-purple-50/50 ring-2 ring-purple-100 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        formAudience === 'group'
                          ? 'bg-kulkul-purple text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="card-title">Group Session</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {selectedFellowIds.length > 0
                          ? `${selectedFellowIds.length} fellow${selectedFellowIds.length > 1 ? 's' : ''} selected`
                          : 'Select specific fellows'}
                      </div>
                    </div>
                  </button>
                </div>

                {formAudience === 'group' && (
                  <FellowPicker
                    programId={programId}
                    fellows={allFellows}
                    showTracks={tracks.length > 0}
                    selectedIds={selectedFellowIds}
                    onChange={setSelectedFellowIds}
                  />
                )}
              </div>

              <div>
                <label className="field-label">
                  Session Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'live_lecture', label: 'Live Lecture' },
                      { id: 'workshop', label: 'Workshop' },
                      { id: 'mentorship_sync', label: 'Mentor Sync' },
                      { id: 'group_sync', label: 'Group Sync' },
                      { id: 'demo_day', label: 'Demo Day' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormType(t.id)}
                      className={`py-2 px-3 rounded-xl text-sm font-medium border transition cursor-pointer ${
                        formType === t.id
                          ? 'bg-kulkul-purple text-white border-kulkul-purple shadow-xs font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Indonesian Calendar Sync Switch for Admin / Mentor */}
              <div className="panel-muted flex items-center justify-between">
                <div className="card-title flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-kulkul-purple" />
                  <span>Sync with Indonesian Calendar</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncIndonesianCalendar}
                  onClick={() => handleToggleIndonesianSync(!syncIndonesianCalendar)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    syncIndonesianCalendar ? 'bg-kulkul-purple' : 'bg-slate-300'
                  }`}
                  title={
                    syncIndonesianCalendar
                      ? 'Click to disable Indonesian calendar holiday restriction'
                      : 'Click to enable Indonesian calendar holiday restriction'
                  }
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      syncIndonesianCalendar ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Start Date &amp; Time *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className={`form-input ${
                        syncIndonesianCalendar && startHolidayInfo.isHoliday
                          ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-200'
                          : ''
                      }`}
                    />
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">
                    End Date &amp; Time *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className={`form-input ${
                        syncIndonesianCalendar && endHolidayInfo.isHoliday
                          ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-200'
                          : ''
                      }`}
                    />
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Public Holiday Warning Alert */}
              {syncIndonesianCalendar && isHolidaySelected && (
                <div className="p-3.5 rounded-2xl border border-rose-300 bg-rose-50 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-rose-900">
                      Indonesian Public Holiday Detected
                    </div>
                    <div className="text-rose-700">
                      {startHolidayInfo.isHoliday && (
                        <span>Starts: <strong>{startHolidayInfo.name}</strong>. </span>
                      )}
                      {endHolidayInfo.isHoliday && endHolidayInfo.name !== startHolidayInfo.name && (
                        <span>Ends: <strong>{endHolidayInfo.name}</strong>. </span>
                      )}
                      Mentors cannot schedule cohort sessions on official Indonesian public holidays. You can disable Indonesian Calendar sync above if this cohort is international.
                    </div>
                  </div>
                </div>
              )}

              {/* Google Meet & Google Calendar Integration Card */}
              <div className="panel-muted space-y-3">
                <div className="flex items-center justify-between">
                  <div className="card-title flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-kulkul-purple" />
                    <span>Google Meet &amp; Calendar Integration</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300 transition">
                    <input
                      type="checkbox"
                      checked={formAutoGenerateMeet}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormAutoGenerateMeet(checked);
                        if (checked && (!formMeetingUrl || formMeetingUrl.includes('meet.google.com'))) {
                          setFormMeetingUrl(generateClientGoogleMeetLink());
                        }
                      }}
                      className="checkbox checkbox-sm checkbox-primary rounded"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Auto-Generate Meet</div>
                      <div className="meta-text">Create unique Google Meet room</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300 transition">
                    <input
                      type="checkbox"
                      checked={formSendCalendarInvites}
                      onChange={(e) => setFormSendCalendarInvites(e.target.checked)}
                      className="checkbox checkbox-sm checkbox-primary rounded"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Invite Attendees</div>
                      <div className="meta-text">Send Google Calendar &amp; email invites</div>
                    </div>
                  </label>
                </div>

                {formSendCalendarInvites && (
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-kulkul-purple" />
                      <span>
                        {formAudience === 'all'
                          ? `Will invite all fellows in this cohort${tracks.length > 0 && formTrackId ? ' (filtered track)' : ''} + assigned mentor`
                          : `Will invite ${selectedFellowIds.length} selected fellow${selectedFellowIds.length === 1 ? '' : 's'} + assigned mentor`}
                      </span>
                    </span>
                    <span className="font-bold text-kulkul-purple">
                      {formAudience === 'all'
                        ? `${allFellows.length + (formMentorId ? 1 : 0)} people`
                        : `${selectedFellowIds.length + (formMentorId ? 1 : 0)} people`}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="field-label mb-0">
                    Meeting URL (Google Meet) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newLink = generateClientGoogleMeetLink();
                      setFormMeetingUrl(newLink);
                      toast.success('Generated new Google Meet link');
                    }}
                    className="btn btn-sm btn-outline"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Generate Meet Link</span>
                  </button>
                </div>
                <div className="relative">
                  <Video className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    required
                    placeholder="https://meet.google.com/xyz-abcd-efg"
                    value={formMeetingUrl}
                    onChange={(e) => setFormMeetingUrl(e.target.value)}
                    className="form-input pl-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tracks.length > 0 && (
                  <div>
                    <label className="field-label">
                      Assigned Track (Optional)
                    </label>
                    <select
                      value={formTrackId}
                      onChange={(e) => setFormTrackId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">All Cohort Fellows</option>
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mentors.length > 0 && (
                  <div>
                    <label className="field-label">
                      Session Host / Mentor
                    </label>
                    <select
                      value={formMentorId}
                      onChange={(e) => setFormMentorId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">Select Mentor</option>
                      {mentors.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.user_name || m.user_email} ({m.role_title})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="field-label">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline topics covered, pre-read assignments, or prerequisites..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="form-textarea resize-y"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-sm btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSessionMutation.isPending || (syncIndonesianCalendar && isHolidaySelected)}
                  title={syncIndonesianCalendar && isHolidaySelected ? 'Cannot schedule on an Indonesian national holiday' : undefined}
                  className="btn btn-sm btn-primary"
                >
                  {saveSessionMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingSession ? 'Update Session' : 'Create Session'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Interactive Attendance Check Sheet */}
      {activeAttendanceSession && (
        <div className="modal-backdrop animate-in fade-in duration-200">
          <div className="modal-panel max-w-4xl flex flex-col justify-between">
            {/* Header */}
            <div className="section-header">
              <div>
                <h3 className="section-title">{activeAttendanceSession.title}</h3>
                <p className="section-subtitle">{formatDateTime(activeAttendanceSession.start_time)}</p>
              </div>

              <button
                onClick={() => setActiveAttendanceSession(null)}
                className="btn btn-icon-sm btn-ghost shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canTrackMentors && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCheckSheetTab('fellows')}
                  className={`tab-pill ${checkSheetTab === 'fellows' ? 'tab-pill-active' : ''}`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Fellows</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckSheetTab('mentors')}
                  className={`tab-pill ${checkSheetTab === 'mentors' ? 'tab-pill-active' : ''}`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Mentors</span>
                </button>
              </div>
            )}

            {checkSheetTab === 'fellows' ? (
            <>
            {/* Quick Actions Bar */}
            <div className="panel-muted flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="btn btn-sm btn-success"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Mark All Present</span>
                </button>
                <span className="meta-text hidden sm:inline">
                  Sets all fellows in this cohort to "Present" with 1-click.
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Users className="w-4 h-4 text-slate-500" />
                <span>
                  {attendanceSheet.filter((a) => a.status === 'present').length} / {attendanceSheet.length} Present
                </span>
              </div>
            </div>

            {/* Attendance Table */}
            <div className="data-table-wrap flex-1 overflow-y-auto">
              {isLoadingAttendance ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Loading fellow roster...</span>
                </div>
              ) : attendanceSheet.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-1">
                  <p className="text-xs font-bold">No accepted fellows found for this cohort.</p>
                </div>
              ) : (
                <table className="data-table min-w-[580px]">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Fellow</th>
                      {tracks.length > 0 && <th>Track</th>}
                      <th className="text-center">Attendance Status</th>
                      <th className="text-center">Proof Screenshot</th>
                      <th>Notes / Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceSheet.map((item) => (
                      <tr key={item.applicant_id} className="transition">
                        <td className="cell-primary">{item.fellow_name}</td>
                        {tracks.length > 0 && (
                          <td className="text-slate-500">{item.track_name || 'General'}</td>
                        )}
                        <td>
                          <div className="flex flex-col items-center justify-center gap-1">
                            {item.status === 'pending_validation' && (
                              <span className="text-2xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                Awaiting Validation
                              </span>
                            )}
                            <div className="flex items-center justify-center gap-1.5">
                              {(['present', 'late', 'absent', 'excused'] as const).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleToggleFellowStatus(item.applicant_id, st)}
                                  className={`px-2.5 py-1 rounded-xl text-3xs font-extrabold uppercase tracking-wider transition ${
                                    item.status === st
                                      ? st === 'present'
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : st === 'late'
                                        ? 'bg-amber-500 text-white shadow-2xs'
                                        : st === 'absent'
                                        ? 'bg-rose-600 text-white shadow-2xs'
                                        : 'bg-slate-700 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  }`}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          {item.proof_image_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewProof({
                                  applicant_id: item.applicant_id,
                                  fellow_name: item.fellow_name,
                                  proof_image_url: item.proof_image_url!,
                                  notes: item.notes,
                                  status: item.status,
                                })
                              }
                              className={`btn btn-sm mx-auto ${
                                item.status === 'pending_validation'
                                  ? 'btn-primary'
                                  : 'btn-outline'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{item.status === 'pending_validation' ? 'Review Proof' : 'View Proof'}</span>
                            </button>
                          ) : (
                            <span className="meta-text italic">No screenshot</span>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Add remark..."
                            value={item.notes}
                            onChange={(e) => handleUpdateFellowNote(item.applicant_id, e.target.value)}
                            className="form-input py-1.5 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>
            ) : (
            <>
            {/* Mentor Quick Actions Bar */}
            <div className="panel-muted flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMentorSheet((prev) => prev.map((m) => ({ ...m, status: 'present' })))}
                className="btn btn-sm btn-outline"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark All Present</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Users className="w-4 h-4 text-slate-500" />
                <span>
                  {mentorSheet.filter((m) => m.status === 'present' || m.status === 'late').length} / {mentorSheet.length} Attended
                </span>
              </div>
            </div>

            {/* Mentor Attendance Table */}
            <div className="data-table-wrap flex-1 overflow-y-auto">
              {isLoadingMentorAttendance ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Loading mentors...</span>
                </div>
              ) : mentorSheet.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-1">
                  <p className="text-xs font-bold">No mentors are assigned to this program yet.</p>
                </div>
              ) : (
                <table className="data-table min-w-[580px]">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Mentor</th>
                      <th className="text-center">Attendance Status</th>
                      <th>Notes / Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentorSheet.map((m) => (
                      <tr key={m.user_id} className="transition">
                        <td>
                          <div className="cell-primary">{m.mentor_name || m.mentor_email}</div>
                          <div className="cell-secondary">
                            {m.is_lead ? 'Session lead' : m.role_title || 'Mentor'}
                            {!m.recorded && ' · not recorded yet'}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1.5">
                            {(['present', 'late', 'absent', 'excused'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => updateMentorSheet(m.user_id, { status: st })}
                                className={`px-2.5 py-1 rounded-xl text-3xs font-extrabold uppercase tracking-wider transition ${
                                  m.status === st
                                    ? st === 'present'
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : st === 'late'
                                      ? 'bg-amber-500 text-white shadow-2xs'
                                      : st === 'absent'
                                      ? 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-700 text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Add remark..."
                            value={m.notes || ''}
                            onChange={(e) => updateMentorSheet(m.user_id, { notes: e.target.value })}
                            className="form-input py-1.5 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>
            )}

            {/* Footer Buttons */}
            <div className="modal-footer justify-between">
              <span className="meta-text">
                Changes are applied immediately after confirming save.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAttendanceSession(null)}
                  className="btn btn-sm btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveAttendanceMutation.isPending || saveMentorAttendanceMutation.isPending}
                  onClick={() =>
                    checkSheetTab === 'mentors' ? saveMentorAttendanceMutation.mutate() : saveAttendanceMutation.mutate()
                  }
                  className="btn btn-sm btn-primary"
                >
                  {saveAttendanceMutation.isPending || saveMentorAttendanceMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Attendance...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{checkSheetTab === 'mentors' ? 'Save Mentor Attendance' : 'Save Attendance'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mentor Proof Screenshot Lightbox Modal */}
      {previewProof && (
        <div className="modal-backdrop animate-in fade-in">
          <div className="modal-panel max-w-2xl space-y-4 animate-in zoom-in-95">
            <div className="section-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center border border-purple-200">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="section-title">{previewProof.fellow_name}</h3>
                  <p className="section-subtitle">
                    Attendance Status: <span className="font-bold text-slate-800 uppercase">{previewProof.status}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="btn btn-icon-sm btn-ghost"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-[65vh] flex items-center justify-center">
              <img
                src={previewProof.proof_image_url}
                alt={`Proof by ${previewProof.fellow_name}`}
                className="object-contain max-h-[60vh] w-full"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              {previewProof.notes ? (
                <p className="text-slate-600 italic">
                  <span className="font-semibold not-italic text-slate-800">Remark: </span>
                  {previewProof.notes}
                </p>
              ) : (
                <span className="text-slate-400">No remarks provided.</span>
              )}
              <a
                href={previewProof.proof_image_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-outline shrink-0 ml-3"
              >
                <span>Open Full Size</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Mentor Validation Action Panel */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="subsection-title">Mentor Validation:</span>
                {previewProof.status === 'pending_validation' ? (
                  <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    Awaiting Validation
                  </span>
                ) : (
                  <span className="text-xs font-bold text-slate-700 capitalize">
                    Current: {previewProof.status}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={validateAttendanceMutation.isPending}
                  onClick={() =>
                    validateAttendanceMutation.mutate({
                      applicantId: previewProof.applicant_id,
                      status: 'present',
                      notes: previewProof.notes,
                    })
                  }
                  className="btn btn-sm btn-success"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Validate as Present</span>
                </button>

                <button
                  type="button"
                  disabled={validateAttendanceMutation.isPending}
                  onClick={() =>
                    validateAttendanceMutation.mutate({
                      applicantId: previewProof.applicant_id,
                      status: 'late',
                      notes: previewProof.notes,
                    })
                  }
                  className="btn btn-sm btn-outline"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Validate as Late</span>
                </button>

                <button
                  type="button"
                  disabled={validateAttendanceMutation.isPending}
                  onClick={() =>
                    validateAttendanceMutation.mutate({
                      applicantId: previewProof.applicant_id,
                      status: 'absent',
                      notes: previewProof.notes ? `${previewProof.notes} (Proof rejected)` : 'Proof rejected by mentor',
                    })
                  }
                  className="btn btn-sm btn-danger"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject Proof (Absent)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
