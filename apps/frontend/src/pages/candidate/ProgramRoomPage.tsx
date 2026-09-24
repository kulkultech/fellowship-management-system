import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { sessionService } from '@/services/sessionService';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import toast from 'react-hot-toast';
import {
  Calendar,
  Clock,
  Video,
  Users,
  BookOpen,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Laptop,
  GraduationCap,
  MessageSquare,
  AlertCircle,
  Loader2,
  Award,
} from 'lucide-react';

interface FellowSession {
  id: string;
  title: string;
  type: 'live_lecture' | 'workshop' | 'mentorship_sync' | 'demo_day';
  date: string;
  time: string;
  status: 'upcoming' | 'check_in_available' | 'completed';
  attended?: boolean;
  meeting_url?: string;
}

export const ProgramRoomPage: React.FC = () => {
  const { orgSlug = '', programSlug = '' } = useParams<{ orgSlug: string; programSlug: string }>();
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'sessions' | 'curriculum' | 'resources'>('sessions');

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
    mutationFn: async (sessionId: string) => {
      if (!program?.id) return;
      return sessionService.fellowCheckIn(program.id, sessionId);
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Attendance check-in confirmed!');
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
    realSessions.forEach((s) => {
      if (s.fellow_attendance?.status === 'present' || s.fellow_attendance?.status === 'late') {
        attended++;
      }
    });
    const rate = Math.round((attended / total) * 100);
    const status = rate >= 80 ? 'Good' : rate >= 65 ? 'Warning' : 'At Risk';
    return { total, attended, rate, status };
  }, [realSessions]);

  const isLoading = isLoadingProg || isLoadingCand;

  // Sample structured fellowship sessions
  const sampleSessions: FellowSession[] = [
    {
      id: 'sess-1',
      title: 'Cohort Kickoff & Orientation',
      type: 'live_lecture',
      date: 'Week 1 &bull; Day 1',
      time: '19:00 - 20:30 WIB',
      status: 'check_in_available',
      meeting_url: 'https://meet.google.com/kulkul-fellowship-live',
    },
    {
      id: 'sess-2',
      title: 'Production Engineering Standards & Architecture',
      type: 'workshop',
      date: 'Week 1 &bull; Day 3',
      time: '19:00 - 21:00 WIB',
      status: 'upcoming',
      meeting_url: 'https://meet.google.com/kulkul-fellowship-live',
    },
    {
      id: 'sess-3',
      title: 'Weekly Mentor Sync & Code Review Session',
      type: 'mentorship_sync',
      date: 'Week 2 &bull; Day 2',
      time: '19:30 - 20:30 WIB',
      status: 'upcoming',
    },
    {
      id: 'sess-4',
      title: 'Mid-Cohort Capstone Milestone Demo',
      type: 'demo_day',
      date: 'Week 4 &bull; Day 5',
      time: '18:00 - 21:00 WIB',
      status: 'upcoming',
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
            <span className="text-sm font-bold">Opening Program Room...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to="/candidate/dashboard"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-kulkul-purple transition group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Candidate Dashboard</span>
          </Link>
        </div>

        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#250d43] via-[#33125d] to-[#1c0834] text-white p-6 sm:p-10 shadow-xl border border-purple-900/40">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-[#fe900d]/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-4 max-w-3xl">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              {program?.name || 'Fellowship Program Room'}
            </h1>

            <p className="text-sm sm:text-base text-purple-100/90 leading-relaxed">
              Welcome aboard, <strong>{currentApp?.full_name || authUser?.email || 'Fellow'}</strong>! You have officially entered the dedicated Program Room for this fellowship. Here you can track orientation dates, attend live sessions, collaborate with mentors, and access cohort repositories.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-purple-200/80 font-medium">
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#fe900d]" />
                <span>Track: {currentApp?.track_name || 'General Track'}</span>
              </div>
              <span>&bull;</span>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Hosted by {org?.name || 'KulKul Tech'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Access Check Notice if pending invite */}
        {!isInvited && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="font-bold">Pending Formal Invitation Email:</strong> Our admissions team has approved your application. You will receive an official room access invitation email shortly.
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'sessions'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Sessions &amp; Attendance</span>
          </button>

          <button
            onClick={() => setActiveTab('curriculum')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'curriculum'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Curriculum &amp; Milestones</span>
          </button>

          <button
            onClick={() => setActiveTab('resources')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'resources'
                ? 'bg-kulkul-purple text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Channels &amp; Resources</span>
          </button>
        </div>

        {/* Tab Content: Sessions & Attendance */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            {/* Fellow Attendance Health & Progress Card */}
            {fellowStats && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-extrabold uppercase text-slate-500 tracking-wider">
                      Your Attendance Record
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase tracking-wider ${
                        fellowStats.status === 'Good'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : fellowStats.status === 'Warning'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      <Award className="w-3 h-3" />
                      <span>{fellowStats.status} Status</span>
                    </span>
                  </div>
                  <h4 className="text-xl font-black text-slate-900">
                    {fellowStats.rate}% Attendance Rate
                  </h4>
                  <p className="text-xs text-slate-500">
                    Attended <strong>{fellowStats.attended}</strong> of <strong>{fellowStats.total}</strong> cohort sessions. Maintaining &ge;80% attendance is required for graduation.
                  </p>
                </div>

                <div className="sm:w-56 space-y-2">
                  <div className="flex items-center justify-between text-2xs font-bold text-slate-600">
                    <span>Graduation Threshold</span>
                    <span>{fellowStats.rate}% / 80%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
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
              </div>
            )}

            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Fellowship Live Sessions</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Attend scheduled cohort workshops, technical syncs, and orientation sessions.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Real-Time Check-In Active</span>
                </div>
              </div>

              {isLoadingSessions ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Loading fellowship sessions...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {realSessions.length > 0 ? (
                    realSessions.map((sess) => {
                      const isCheckedIn = Boolean(
                        sess.fellow_attendance?.status === 'present' ||
                        sess.fellow_attendance?.status === 'late'
                      );
                      const isExcused = sess.fellow_attendance?.status === 'excused';

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
                          className="p-5 rounded-2xl border border-slate-100 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                        >
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0 border border-purple-200">
                              <Video className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-extrabold text-slate-900">{sess.title}</h4>
                                <span className="text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                  {sess.session_type.replace('_', ' ')}
                                </span>
                                {sess.track_name && (
                                  <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-purple-50 text-kulkul-purple border border-purple-200">
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
                            {isCheckedIn ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shadow-2xs">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>
                                  Checked In ({sess.fellow_attendance?.status === 'late' ? 'Late' : 'Present'})
                                </span>
                              </span>
                            ) : isExcused ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
                                <span>Excused</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={checkInMutation.isPending}
                                onClick={() => checkInMutation.mutate(sess.id)}
                                className="btn btn-sm btn-outline text-emerald-800 border-emerald-400 hover:bg-emerald-50 font-bold flex items-center gap-1.5"
                              >
                                {checkInMutation.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                                <span>Check-in Attendance</span>
                              </button>
                            )}

                            {sess.meeting_url && (
                              <a
                                href={sess.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => {
                                  // Auto check-in if not yet checked in
                                  if (!isCheckedIn && !isExcused) {
                                    checkInMutation.mutate(sess.id);
                                  }
                                }}
                                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>Join Live Session</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Sample roadmap fallback if no live sessions scheduled yet
                    sampleSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="p-5 rounded-2xl border border-slate-100 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0 border border-purple-200">
                            <Video className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-extrabold text-slate-900">{sess.title}</h4>
                              <span className="text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                {sess.type.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span dangerouslySetInnerHTML={{ __html: sess.date }} />
                              <span>&bull;</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {sess.time}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
                          {sess.status === 'check_in_available' ? (
                            <>
                              <a
                                href={sess.meeting_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>Join Live Session</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => toast.success('Attendance recorded for orientation session!')}
                                className="btn btn-sm btn-outline text-emerald-800 border-emerald-300 font-bold"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Check-in Attendance</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                              Upcoming Session
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Curriculum */}
        {activeTab === 'curriculum' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-extrabold text-slate-900">Program Curriculum &amp; Milestones</h3>
            <p className="text-xs text-slate-500">
              Structured modules designed for industry-level engineering proficiency.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <span className="text-2xs font-extrabold uppercase text-kulkul-purple">Sprint 1</span>
                <h4 className="text-sm font-extrabold text-slate-900">Foundations &amp; System Architecture</h4>
                <p className="text-xs text-slate-600">
                  Deep-dive into concurrent systems, API design, database schemas, and clean hexagonal architecture.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <span className="text-2xs font-extrabold uppercase text-kulkul-purple">Sprint 2</span>
                <h4 className="text-sm font-extrabold text-slate-900">Production Reliability &amp; Cloud Infra</h4>
                <p className="text-xs text-slate-600">
                  Deploying resilient microservices, CI/CD pipelines, automated testing harnesses, and monitoring.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Resources */}
        {activeTab === 'resources' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-extrabold text-slate-900">Cohort Channels &amp; Links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Cohort Discord / Slack</h4>
                    <p className="text-2xs text-slate-500">Daily discussions &amp; peer troubleshooting</p>
                  </div>
                </div>
                <button className="btn btn-xs btn-outline">Join Channel</button>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">GitHub Organization</h4>
                    <p className="text-2xs text-slate-500">Starter repositories &amp; code assignments</p>
                  </div>
                </div>
                <button className="btn btn-xs btn-outline">Open GitHub</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
