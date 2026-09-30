import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Video,
  Clock,
  ExternalLink,
  Users,
  CheckCircle2,
  FileText,
  FileCode,
  Loader2,
  X,
  PenTool,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { sessionService } from '@/services/sessionService';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LiveCodeEditor } from '@/components/sessions/LiveCodeEditor';
import { LiveWhiteboard } from '@/components/sessions/LiveWhiteboard';
import type { AttendanceStatus } from '@/services/types';

export const SessionWorkspacePage: React.FC = () => {
  const { orgSlug, programSlug, sessionId } = useParams<{
    orgSlug?: string;
    programSlug?: string;
    sessionId: string;
  }>();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const isMentorOrAdmin =
    user?.role === 'mentor' || user?.role === 'org_admin' || user?.role === 'superadmin';

  // Active top navigation tab
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'editor' | 'whiteboard' | 'scratchpad'>('whiteboard');
  // Live attendance drawer (for mentors)
  const [isAttendanceDrawerOpen, setIsAttendanceDrawerOpen] = useState<boolean>(false);
  // Scratchpad notes
  const [scratchpadNotes, setScratchpadNotes] = useState<string>(
    `# Session Scratchpad & Key Takeaways\n\n- Topic: Microservices Architecture & Live Demos\n- Agenda:\n  1. Review distributed transactions & idempotency\n  2. Live coding session (Java backend & HTML/CSS/JS frontend)\n  3. Q&A and assignment brief\n\n### Important Links:\n- Class repo: https://github.com/kulkultech/fellowship-cohort\n- API Documentation: https://docs.fellowhire.org/api`
  );

  // 1. Fetch Session Details
  const {
    data: session,
    isLoading: isLoadingSession,
    error: sessionError,
  } = useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => sessionService.getSessionDirect(sessionId!),
    enabled: Boolean(sessionId),
  });

  // 2. Fetch Attendance (for mentors/admins)
  const {
    data: attendanceRoster = [],
    isLoading: isLoadingRoster,
  } = useQuery({
    queryKey: ['session-roster', session?.program_id, sessionId],
    queryFn: () =>
      session
        ? sessionService.getSessionAttendance(session.program_id, sessionId!)
        : Promise.resolve([]),
    enabled: Boolean(session && isMentorOrAdmin && isAttendanceDrawerOpen),
  });

  // Quick Attendance toggle mutation
  const updateAttendanceMutation = useMutation({
    mutationFn: ({
      applicantId,
      status,
      notes,
    }: {
      applicantId: string;
      status: AttendanceStatus;
      notes?: string;
    }) =>
      sessionService.batchUpdateAttendance(session!.program_id, sessionId!, {
        attendances: [{ applicant_id: applicantId, status, notes }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-roster', session?.program_id, sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-detail', sessionId] });
      toast.success('Attendance updated');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update attendance');
    },
  });

  // Mark all present mutation
  const markAllPresentMutation = useMutation({
    mutationFn: () =>
      sessionService.batchUpdateAttendance(session!.program_id, sessionId!, {
        attendances: attendanceRoster.map((a) => ({
          applicant_id: a.applicant_id,
          status: 'present',
          notes: a.notes,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-roster', session?.program_id, sessionId] });
      toast.success('All fellows marked present');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update attendance');
    },
  });

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const backUrl = orgSlug && programSlug
    ? `/programs/${orgSlug}/${programSlug}/room`
    : user?.role === 'mentor'
    ? '/mentor/dashboard'
    : user?.role === 'superadmin'
    ? '/superadmin/dashboard'
    : user?.role === 'org_admin'
    ? '/admin/dashboard'
    : '/candidate/dashboard';

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
            <span className="text-sm font-bold">Loading Live Session Workspace...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <X className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Session Not Found</h2>
            <p className="text-xs text-slate-500">
              The requested fellowship session could not be retrieved or has expired.
            </p>
            <button
              onClick={() => navigate(backUrl)}
              className="btn btn-sm btn-outline border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
            >
              Return to Dashboard
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to={backUrl}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-kulkul-purple transition group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>
              {orgSlug && programSlug ? 'Back to Program Room' : 'Back to Dashboard'}
            </span>
          </Link>
        </div>

        {/* Standardized Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold text-kulkul-purple bg-purple-50 px-3 py-1 rounded-full border border-purple-100 uppercase tracking-wider">
                {session.session_type.replace('_', ' ')}
              </span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                {formatDateTime(session.start_time)}
              </span>
              {session.mentor_name && (
                <>
                  <span className="text-slate-300">&bull;</span>
                  <span className="text-xs font-medium text-slate-500">
                    Lead: <strong className="text-slate-900 font-bold">{session.mentor_name}</strong>
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {session.title}
            </h1>

            {session.description && (
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                {session.description}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {session.meeting_url && (
              <a
                href={session.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                title="Open live video call"
              >
                <Video className="w-4 h-4" />
                <span>Join Live Call</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {isMentorOrAdmin && (
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(true)}
                className="btn btn-sm btn-outline border-slate-300 text-slate-700 hover:bg-slate-50 font-bold flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Attendance Roster</span>
              </button>
            )}
          </div>
        </div>

        {/* Standard Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('whiteboard')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeWorkspaceTab === 'whiteboard'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Whiteboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('editor')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeWorkspaceTab === 'editor'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Code Studio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('scratchpad')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeWorkspaceTab === 'scratchpad'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Scratchpad &amp; Notes</span>
          </button>
        </div>

        {/* Main Content Area */}
        {activeWorkspaceTab === 'editor' && (
          <div className="space-y-4">
            <LiveCodeEditor
              initialLanguage="java"
              sessionTitle={session.title}
            />
          </div>
        )}

        {activeWorkspaceTab === 'whiteboard' && (
          <div className="space-y-4">
            <LiveWhiteboard
              sessionId={session.id}
              sessionTitle={session.title}
              isMentor={isMentorOrAdmin}
            />
          </div>
        )}

        {activeWorkspaceTab === 'scratchpad' && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Live Session Scratchpad &amp; Lecture Notes</h3>
                <p className="text-xs text-slate-500">
                  Shared collaborative notes for class instructions, architecture diagrams, and homework references.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(scratchpadNotes);
                  toast.success('Notes copied to clipboard');
                }}
                className="btn btn-sm btn-outline border-slate-200 text-slate-700 hover:bg-slate-100 font-bold"
              >
                Copy Notes
              </button>
            </div>

            <textarea
              value={scratchpadNotes}
              onChange={(e) => setScratchpadNotes(e.target.value)}
              rows={16}
              className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-kulkul-purple resize-none"
              placeholder="Type lecture notes, code snippets, or shared questions here..."
            />
          </div>
        )}
      </main>

      <Footer />

      {/* Mentor In-Session Attendance Drawer */}
      {isAttendanceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border-l border-slate-200 w-full max-w-xl h-full shadow-2xl flex flex-col justify-between p-6 space-y-4 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Live Attendance Check Sheet
                </span>
                <h3 className="text-lg font-black text-slate-900">{session.title}</h3>
                <p className="text-xs text-slate-500">
                  Track and verify cohort participants directly during the workshop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(false)}
                className="btn btn-sm btn-ghost btn-circle text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => markAllPresentMutation.mutate()}
                disabled={markAllPresentMutation.isPending}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark All Present</span>
              </button>
              <span className="text-xs font-bold text-slate-600">
                {attendanceRoster.filter((a) => a.status === 'present').length} / {attendanceRoster.length} Present
              </span>
            </div>

            {/* Roster Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-white">
              {isLoadingRoster ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                  <span className="text-xs">Loading cohort roster...</span>
                </div>
              ) : attendanceRoster.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  No accepted fellows found for this cohort.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                    <tr>
                      <th className="px-4 py-3">Fellow</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceRoster.map((fellow) => (
                      <tr key={fellow.applicant_id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{fellow.fellow_name}</div>
                          {fellow.track_name && (
                            <div className="text-2xs text-slate-500">{fellow.track_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {(['present', 'late', 'absent', 'excused'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  updateAttendanceMutation.mutate({
                                    applicantId: fellow.applicant_id,
                                    status: st,
                                    notes: fellow.notes,
                                  })
                                }
                                className={`btn btn-xs font-bold uppercase transition ${
                                  fellow.status === st
                                    ? st === 'present'
                                      ? 'bg-emerald-600 text-white'
                                      : st === 'late'
                                      ? 'bg-amber-500 text-white'
                                      : st === 'absent'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-700 text-white'
                                    : 'btn-ghost text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(false)}
                className="btn btn-sm btn-ghost text-slate-500 hover:text-slate-800"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
