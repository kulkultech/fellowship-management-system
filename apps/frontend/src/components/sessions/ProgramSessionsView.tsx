import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionService } from '@/services/sessionService';
import { mentorService } from '@/services/mentorService';
import type {
  ProgramSession,
  CreateSessionPayload,
  AttendanceStatus,
  Track,
  ProgramMentor,
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
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ProgramSessionsViewProps {
  programId: string;
  programName?: string;
  isMentor?: boolean;
  tracks?: Track[];
  mentors?: ProgramMentor[];
}

export const ProgramSessionsView: React.FC<ProgramSessionsViewProps> = ({
  programId,
  programName = 'Fellowship Cohort',
  isMentor: _isMentor = false,
  tracks = [],
  mentors = [],
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'sessions' | 'summary'>('sessions');

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

  // Student targeting for sessions
  const { data: fellowsData } = useQuery({
    queryKey: ['program-fellows-for-sessions', programId],
    queryFn: () => mentorService.getProgramFellows(programId),
    enabled: Boolean(programId),
  });
  const allFellows = fellowsData?.fellows || [];

  const [formAudience, setFormAudience] = useState<'all' | 'group'>('all');
  const [selectedFellowIds, setSelectedFellowIds] = useState<string[]>([]);
  const [fellowSearch, setFellowSearch] = useState('');

  const filteredFellows = useMemo(() => {
    if (!fellowSearch.trim()) return allFellows;
    const q = fellowSearch.toLowerCase();
    return allFellows.filter(
      (f) =>
        f.full_name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.track_name?.toLowerCase().includes(q)
    );
  }, [allFellows, fellowSearch]);

  const openCreateModal = () => {
    setEditingSession(null);
    setFormTitle('');
    setFormDescription('');
    setFormType('live_lecture');
    setFormAudience('all');
    setSelectedFellowIds([]);
    setFellowSearch('');
    const today = new Date().toISOString().split('T')[0];
    setFormStartDate(today);
    setFormStartTime('19:00');
    setFormEndDate(today);
    setFormEndTime('20:30');
    setFormMeetingUrl('https://meet.google.com/');
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
    setFellowSearch('');

    const s = new Date(sess.start_time);
    const e = new Date(sess.end_time);

    setFormStartDate(s.toISOString().split('T')[0]);
    setFormStartTime(s.toTimeString().slice(0, 5));
    setFormEndDate(e.toISOString().split('T')[0]);
    setFormEndTime(e.toTimeString().slice(0, 5));

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

  // Helper: Mark All Present
  const handleMarkAllPresent = () => {
    setAttendanceSheet((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'present',
      }))
    );
    toast.success('All fellows marked Present. Click "Save Attendance" to confirm.', { icon: '✨' });
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-extrabold uppercase tracking-wider">Cohort Sessions</span>
            <Calendar className="w-4 h-4 text-kulkul-purple" />
          </div>
          <div className="text-2xl font-black text-slate-900">{cohortMetrics.totalSessions}</div>
          <p className="text-2xs text-slate-500">Scheduled workshops &amp; syncs</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-extrabold uppercase tracking-wider">Accepted Fellows</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{cohortMetrics.totalFellows}</div>
          <p className="text-2xs text-slate-500">Official cohort participants</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-extrabold uppercase tracking-wider">Cohort Attendance</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900">{cohortMetrics.avgAttendanceRate}%</div>
            <span className="text-2xs font-bold text-slate-500">Average Rate</span>
          </div>
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

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-2xs font-extrabold uppercase tracking-wider">Attendance Health</span>
            <Award className="w-4 h-4 text-[#fe900d]" />
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {cohortMetrics.goodCount} Good
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              {cohortMetrics.warningCount} Warn
            </span>
            {cohortMetrics.atRiskCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {cohortMetrics.atRiskCount} Risk
              </span>
            )}
          </div>
          <p className="text-2xs text-slate-500 pt-0.5">&ge;80% Good &bull; &lt;65% At Risk</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold pb-1">
          <span>Cohort Program: <strong className="text-slate-900">{programName}</strong></span>
        </div>

        {/* Tab & Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'sessions'
                  ? 'bg-kulkul-purple text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Cohort Sessions ({sessions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeTab === 'summary'
                  ? 'bg-kulkul-purple text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Attendance Tracker &amp; Risk Monitor</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="btn btn-sm bg-kulkul-purple hover:bg-[#250d43] text-white font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule New Session</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Cohort Sessions */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search sessions by title, mentor, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:border-kulkul-purple bg-slate-50/50"
                />
              </div>

              {tracks.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Track:</span>
                  <select
                    value={selectedTrackFilter}
                    onChange={(e) => setSelectedTrackFilter(e.target.value)}
                    className="select select-sm select-bordered rounded-xl text-xs bg-white"
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
                <h4 className="text-sm font-extrabold text-slate-800">No Fellowship Sessions Scheduled</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Get your cohort underway by scheduling live lectures, technical workshops, or weekly mentor syncs.
                </p>
                <button onClick={openCreateModal} className="btn btn-sm btn-outline text-kulkul-purple mt-2">
                  <Plus className="w-4 h-4 mr-1" />
                  Schedule First Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-5 rounded-2xl border border-slate-200/90 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0 border border-purple-100">
                        <Video className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-extrabold text-slate-900">{sess.title}</h4>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {sess.session_type.replace('_', ' ')}
                          </span>
                          {sess.target_applicant_ids && sess.target_applicant_ids.length > 0 ? (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Group ({sess.target_applicant_ids.length} {sess.target_applicant_ids.length === 1 ? 'fellow' : 'fellows'})
                            </span>
                          ) : null}
                          {sess.track_name && tracks.length > 0 && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-kulkul-purple border border-purple-200">
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
                          {sess.meeting_url && (
                            <a
                              href={sess.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-kulkul-purple hover:underline font-bold"
                            >
                              <span>Meeting Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Action & Attendance Stat */}
                    <div className="flex items-center gap-3 shrink-0 self-start lg:self-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 w-full lg:w-auto justify-between lg:justify-end">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {sess.present_count || 0} / {sess.total_fellows || cohortMetrics.totalFellows} Present
                          </span>
                          {sess.attendance_rate !== undefined && (
                            <span
                              className={`ml-1 px-1.5 py-0.2 rounded text-3xs font-black ${
                                sess.attendance_rate >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : sess.attendance_rate >= 65
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {sess.attendance_rate}%
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setActiveAttendanceSession(sess);
                          }}
                          className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-2xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Check Sheet</span>
                        </button>

                        <button
                          onClick={() => openEditModal(sess)}
                          className="btn btn-sm btn-ghost text-slate-600 hover:text-slate-900"
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
                          className="btn btn-sm btn-ghost text-rose-600 hover:text-rose-800 hover:bg-rose-50"
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

        {/* Tab 2: Attendance Summary & Risk Monitor */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Cohort Attendance Health</h4>
                <p className="text-xs text-slate-500">
                  Real-time attendance rates across all scheduled sessions with completion risk alerts.
                </p>
              </div>
            </div>

            {isLoadingSummaries ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                <span className="text-xs font-bold">Calculating attendance metrics...</span>
              </div>
            ) : summaries.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8 space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Fellows in Cohort Yet</h4>
                <p className="text-xs text-slate-500">
                  Accepted fellows will appear here automatically once moved to "Approved for Live" stage.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Fellow</th>
                      {tracks.length > 0 && <th className="px-4 py-3">Track</th>}
                      <th className="px-3 py-3 text-center">Sessions</th>
                      <th className="px-3 py-3 text-center">Present</th>
                      <th className="px-3 py-3 text-center">Late</th>
                      <th className="px-3 py-3 text-center">Absent</th>
                      <th className="px-3 py-3 text-center">Excused</th>
                      <th className="px-4 py-3 text-center">Rate (%)</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summaries.map((s) => (
                      <tr key={s.applicant_id} className="hover:bg-slate-50/60 transition">
                        <td className="px-5 py-3.5">
                          <div className="font-extrabold text-slate-900">{s.full_name}</div>
                          <div className="text-2xs text-slate-400">{s.email}</div>
                        </td>
                        {tracks.length > 0 && (
                          <td className="px-4 py-3.5 text-slate-600 font-medium">
                            {s.track_name || <span className="text-slate-400">&mdash;</span>}
                          </td>
                        )}
                        <td className="px-3 py-3.5 text-center font-bold text-slate-700">{s.total_sessions}</td>
                        <td className="px-3 py-3.5 text-center font-bold text-emerald-700">{s.present_count}</td>
                        <td className="px-3 py-3.5 text-center font-bold text-amber-600">{s.late_count}</td>
                        <td className="px-3 py-3.5 text-center font-bold text-rose-600">{s.absent_count}</td>
                        <td className="px-3 py-3.5 text-center font-bold text-slate-500">{s.excused_count}</td>
                        <td className="px-4 py-3.5 text-center">
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
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase tracking-wider ${
                              s.status === 'Good'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : s.status === 'Warning'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {editingSession ? 'Edit Fellowship Session' : 'Schedule Fellowship Session'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">Coordinate cohort live lectures, workshops, or syncs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Session Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems Architecture & Sync"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition placeholder:text-slate-400 bg-white"
                />
              </div>

              {/* Target Audience Selector */}
              <div className="space-y-2.5">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
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
                      <div className="text-sm font-bold text-slate-900">All Fellows</div>
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
                      <div className="text-sm font-bold text-slate-900">Group Session</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {selectedFellowIds.length > 0
                          ? `${selectedFellowIds.length} fellow${selectedFellowIds.length > 1 ? 's' : ''} selected`
                          : 'Select specific fellows'}
                      </div>
                    </div>
                  </button>
                </div>

                {formAudience === 'group' && (
                  <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 mt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder={tracks.length > 0 ? "Search fellows by name, email, or track..." : "Search fellows by name or email..."}
                          value={fellowSearch}
                          onChange={(e) => setFellowSearch(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedFellowIds(allFellows.map((f) => f.id))}
                          className="text-xs font-semibold text-kulkul-purple hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedFellowIds([])}
                          className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {filteredFellows.length === 0 ? (
                        <div className="text-center py-4 text-xs text-slate-400">
                          No fellows found matching "{fellowSearch}"
                        </div>
                      ) : (
                        filteredFellows.map((fellow) => {
                          const isChecked = selectedFellowIds.includes(fellow.id);
                          return (
                            <label
                              key={fellow.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-sm cursor-pointer transition ${
                                isChecked
                                  ? 'bg-purple-50/70 border-purple-200'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedFellowIds((prev) => [...prev, fellow.id]);
                                    } else {
                                      setSelectedFellowIds((prev) => prev.filter((id) => id !== fellow.id));
                                    }
                                  }}
                                  className="checkbox checkbox-sm checkbox-primary rounded"
                                />
                                <div className="truncate">
                                  <span className="font-semibold text-slate-900">{fellow.full_name}</span>
                                  <span className="text-slate-400 text-xs ml-1.5">({fellow.email})</span>
                                </div>
                              </div>
                              {fellow.track_name && tracks.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0 font-medium ml-2">
                                  {fellow.track_name}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="text-xs text-slate-500 font-medium flex items-center justify-between pt-1">
                      <span>
                        {selectedFellowIds.length === 0
                          ? 'No fellows selected (must select at least 1)'
                          : `${selectedFellowIds.length} fellow${selectedFellowIds.length > 1 ? 's' : ''} selected`}
                      </span>
                      {selectedFellowIds.length > 0 && (
                        <span className="text-kulkul-purple font-semibold">
                          {selectedFellowIds.length} / {allFellows.length}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Start Date &amp; Time *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    />
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    End Date &amp; Time *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    />
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Meeting URL (Google Meet / Zoom) *
                </label>
                <div className="relative">
                  <Video className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    required
                    placeholder="https://meet.google.com/xyz-abcd-efg"
                    value={formMeetingUrl}
                    onChange={(e) => setFormMeetingUrl(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition placeholder:text-slate-400 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tracks.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Assigned Track (Optional)
                    </label>
                    <select
                      value={formTrackId}
                      onChange={(e) => setFormTrackId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
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
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Session Host / Mentor
                    </label>
                    <select
                      value={formMentorId}
                      onChange={(e) => setFormMentorId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline topics covered, pre-read assignments, or prerequisites..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 border border-slate-300 focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition placeholder:text-slate-400 bg-white resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSessionMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-kulkul-purple hover:bg-[#250d43] text-white shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saveSessionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[92vh] flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Attendance Check Sheet
                  </span>
                  <span className="text-3xs font-bold text-slate-400">
                    {formatDateTime(activeAttendanceSession.start_time)}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{activeAttendanceSession.title}</h3>
                <p className="text-xs text-slate-500">
                  Track and verify cohort attendance. Fellows who entered the session in Program Room appear automatically.
                </p>
              </div>

              <button
                onClick={() => setActiveAttendanceSession(null)}
                className="btn btn-sm btn-ghost btn-circle text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Mark All Present</span>
                </button>
                <span className="text-2xs text-slate-500 hidden sm:inline">
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
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
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
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 text-slate-600 font-extrabold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Fellow</th>
                      {tracks.length > 0 && <th className="px-3 py-3">Track</th>}
                      <th className="px-4 py-3 text-center">Attendance Status</th>
                      <th className="px-4 py-3 text-center">Proof Screenshot</th>
                      <th className="px-4 py-3">Notes / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceSheet.map((item) => (
                      <tr key={item.applicant_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 font-bold text-slate-900">{item.fellow_name}</td>
                        {tracks.length > 0 && (
                          <td className="px-3 py-3 text-slate-500">{item.track_name || 'General'}</td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {(['present', 'late', 'absent', 'excused'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleToggleFellowStatus(item.applicant_id, st)}
                                className={`px-2.5 py-1 rounded-xl text-3xs font-black uppercase tracking-wider transition ${
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
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.proof_image_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewProof({
                                  fellow_name: item.fellow_name,
                                  proof_image_url: item.proof_image_url!,
                                  notes: item.notes,
                                  status: item.status,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-kulkul-purple border border-purple-200 text-3xs font-extrabold transition shadow-2xs group"
                            >
                              <div className="w-5 h-5 rounded-md overflow-hidden bg-slate-200 border border-slate-300 shrink-0">
                                <img
                                  src={item.proof_image_url}
                                  alt="Proof thumbnail"
                                  className="w-full h-full object-cover group-hover:scale-110 transition"
                                />
                              </div>
                              <Eye className="w-3 h-3 text-purple-600" />
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <span className="text-3xs text-slate-400 font-medium italic">No screenshot</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            placeholder="Add remark..."
                            value={item.notes}
                            onChange={(e) => handleUpdateFellowNote(item.applicant_id, e.target.value)}
                            className="input input-xs input-bordered w-full rounded-lg text-2xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-2xs text-slate-500">
                Changes are applied immediately after confirming save.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveAttendanceSession(null)}
                  className="btn btn-sm btn-ghost text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveAttendanceMutation.isPending}
                  onClick={() => saveAttendanceMutation.mutate()}
                  className="btn btn-sm bg-kulkul-purple hover:bg-[#250d43] text-white font-bold flex items-center gap-1.5 shadow-sm"
                >
                  {saveAttendanceMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Check Sheet...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Attendance</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center border border-purple-200">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{previewProof.fellow_name}</h3>
                  <p className="text-2xs text-slate-500">
                    Attendance Status: <span className="font-bold text-slate-800 uppercase">{previewProof.status}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
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
                className="btn btn-xs btn-outline font-bold flex items-center gap-1.5 shrink-0 ml-3"
              >
                <span>Open Full Size</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
