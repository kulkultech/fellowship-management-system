import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { mentorService } from '@/services/mentorService';
import { sessionService } from '@/services/sessionService';
import { assignmentService } from '@/services/assignmentService';
import { useAuthStore } from '@/hooks/useAuthStore';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import type { ApplicantListItem, MentorProgramSummary, ProgramAssignment, ProgramSession } from '@/services/types';
import {
  GraduationCap,
  Users,
  BookOpen,
  Search,
  ExternalLink,
  Github,
  Linkedin,
  FileText,
  Mail,
  Loader2,
  Video,
  X,
  Building2,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { ProgramSessionsView } from '@/components/sessions/ProgramSessionsView';
import { ProgramAssignmentsView } from '@/components/assignments/ProgramAssignmentsView';
import { ProgramGitHubActivityView } from '@/components/github/ProgramGitHubActivityView';

// Every menu uses the same card shape as the shared sessions, assignments, and GitHub views
const cardShell = 'bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8';

export const MentorDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeNavId, setActiveNavId] = useState<string>('overview');

  // Program selection for fellow listing
  const [selectedProgramId, setSelectedProgramId] = useState<string>('all');
  const [searchFellowQuery, setSearchFellowQuery] = useState<string>('');
  const [selectedFellow, setSelectedFellow] = useState<ApplicantListItem | null>(null);

  // 1. Fetch Mentor Overview
  const {
    data: overview,
    isLoading: isLoadingOverview,
  } = useQuery({
    queryKey: ['mentor-overview'],
    queryFn: () => mentorService.getOverview(),
  });

  const programs: MentorProgramSummary[] = overview?.assigned_programs || [];
  const totalFellows = overview?.total_fellows || 0;

  // 2. Fetch Fellows for the Selected Program or First Program
  const activeProgramId = useMemo(() => {
    if (selectedProgramId !== 'all') return selectedProgramId;
    if (programs.length > 0) return programs[0].program_id;
    return '';
  }, [selectedProgramId, programs]);

  const {
    data: fellowsData,
    isLoading: isLoadingFellows,
  } = useQuery({
    queryKey: ['mentor-fellows', activeProgramId],
    queryFn: () => mentorService.getProgramFellows(activeProgramId),
    enabled: Boolean(activeProgramId),
  });

  const fellowsList: ApplicantListItem[] = fellowsData?.fellows || [];

  // Filtered fellows
  const filteredFellows = useMemo(() => {
    return fellowsList.filter((f) => {
      const q = searchFellowQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        f.full_name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.university?.toLowerCase().includes(q) ||
        f.major?.toLowerCase().includes(q) ||
        f.track_name?.toLowerCase().includes(q)
      );
    });
  }, [fellowsList, searchFellowQuery]);

  // Check if any fellow in this program has a track assigned
  const hasTracks = useMemo(() => {
    return fellowsList.some((f) => Boolean(f.track_name && f.track_name.trim() !== ''));
  }, [fellowsList]);

  // What's next: upcoming sessions and assignment deadlines across assigned programs
  const now = new Date();
  const firstName = (user?.name || user?.email?.split('@')[0] || 'Mentor').split(' ')[0];
  const upcomingQueries = useQueries({
    queries: programs.flatMap((p) => [
      {
        queryKey: ['program-sessions', p.program_id],
        queryFn: () => sessionService.listSessions(p.program_id),
        enabled: activeNavId === 'overview',
      },
      {
        queryKey: ['program-assignments', p.program_id],
        queryFn: () => assignmentService.listAssignments(p.program_id),
        enabled: activeNavId === 'overview',
      },
    ]),
  });
  const isLoadingUpcoming = upcomingQueries.some((q) => q.isLoading);

  type UpcomingItem = {
    kind: 'session' | 'assignment';
    id: string;
    title: string;
    at: string;
    endAt?: string;
    programId: string;
    programName: string;
    subtitle?: string;
    meetingUrl?: string;
  };
  const upcomingItems: UpcomingItem[] = useMemo(() => {
    const nowMs = Date.now();
    const items: UpcomingItem[] = [];
    programs.forEach((p, idx) => {
      const sessions = (upcomingQueries[idx * 2]?.data as ProgramSession[] | undefined) || [];
      const assignments = (upcomingQueries[idx * 2 + 1]?.data as ProgramAssignment[] | undefined) || [];
      for (const s of sessions) {
        // Include sessions that have not ended yet (upcoming or happening now)
        if (new Date(s.end_time || s.start_time).getTime() < nowMs) continue;
        items.push({
          kind: 'session',
          id: s.id,
          title: s.title,
          at: s.start_time,
          endAt: s.end_time,
          programId: p.program_id,
          programName: p.program_name,
          subtitle: s.session_type ? s.session_type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined,
          meetingUrl: s.meeting_url,
        });
      }
      for (const a of assignments) {
        if (a.status !== 'published' || !a.due_date || new Date(a.due_date).getTime() < nowMs) continue;
        items.push({
          kind: 'assignment',
          id: a.id,
          title: a.title,
          at: a.due_date,
          programId: p.program_id,
          programName: p.program_name,
        });
      }
    });
    return items.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime()).slice(0, 8);
  }, [programs, upcomingQueries.map((q) => q.dataUpdatedAt).join(',')]);

  // Sidebar navigation items
  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: GraduationCap,
      onClick: () => setActiveNavId('overview'),
    },
    {
      id: 'programs',
      label: 'My Programs',
      icon: BookOpen,
      onClick: () => setActiveNavId('programs'),
    },
    {
      id: 'fellows',
      label: 'Cohort Fellows',
      icon: Users,
      badge: totalFellows > 0 ? totalFellows : undefined,
      onClick: () => setActiveNavId('fellows'),
    },
    {
      id: 'sessions',
      label: 'Sessions & Attendance',
      icon: Calendar,
      badge: overview?.active_sessions || undefined,
      onClick: () => setActiveNavId('sessions'),
    },
    {
      id: 'assignments',
      label: 'Assignments & Grading',
      icon: FileText,
      onClick: () => setActiveNavId('assignments'),
    },
    {
      id: 'github',
      label: 'GitHub Activity',
      icon: Github,
      onClick: () => setActiveNavId('github'),
    },
  ];

  return (
    <DashboardLayout
      portalType="mentor"
      navItems={navItems}
      activeNavId={activeNavId}
      onNavChange={setActiveNavId}
    >
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* 1. OVERVIEW: WELCOME + WHAT'S NEXT */}
        {/* ========================================================================= */}
        {activeNavId === 'overview' && (
          <div className="space-y-6">
            <div>
              <h1 className="heading-page">Welcome back, {firstName}</h1>
              <p className="text-body mt-1">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <div className={`${cardShell} space-y-5`}>
              <div className="section-header">
                <div>
                  <h3 className="section-title">What&apos;s next</h3>
                  <p className="section-subtitle">Upcoming sessions and assignment deadlines in your programs.</p>
                </div>
              </div>

              {isLoadingOverview || isLoadingUpcoming ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading your schedule…</span>
                </div>
              ) : upcomingItems.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500">
                    {programs.length === 0
                      ? 'You are not assigned to any program yet.'
                      : 'Nothing scheduled yet.'}
                  </p>
                  {programs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveNavId('sessions')}
                      className="btn btn-sm btn-outline"
                    >
                      Schedule a Session
                    </button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {upcomingItems.map((item) => {
                    const start = new Date(item.at);
                    const isLive = item.kind === 'session' && item.endAt && start <= now && new Date(item.endAt) >= now;
                    return (
                      <li key={`${item.kind}-${item.id}`} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                        <div className="sm:w-36 shrink-0">
                          <div className="text-xs font-bold text-slate-900">
                            {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-2xs text-slate-500">
                            {item.kind === 'assignment'
                              ? `Due ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                              : `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${
                                  item.endAt
                                    ? ` – ${new Date(item.endAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                                    : ''
                                }`}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.kind === 'session' ? (
                              <Video className="w-4 h-4 text-kulkul-purple shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                            )}
                            <span className="text-sm font-bold text-slate-900 truncate">{item.title}</span>
                            {isLive && <span className="text-2xs font-bold text-emerald-700 shrink-0">Live now</span>}
                          </div>
                          <div className="text-2xs text-slate-500 mt-0.5 truncate">
                            {item.programName}
                            {item.kind === 'assignment' ? ' · Assignment deadline' : item.subtitle ? ` · ${item.subtitle}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.kind === 'session' ? (
                            <>
                              {item.meetingUrl && (
                                <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Join Call</span>
                                </a>
                              )}
                              <Link to={`/sessions/${item.id}/room`} className="btn btn-sm btn-primary">
                                <span>Open Room</span>
                              </Link>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProgramId(item.programId);
                                setActiveNavId('assignments');
                              }}
                              className="btn btn-sm btn-outline"
                            >
                              View Assignment
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. ASSIGNED PROGRAMS GRID */}
        {/* ========================================================================= */}
        {activeNavId === 'programs' && (
          <div className="space-y-6">
            {isLoadingOverview ? (
              <div className={`${cardShell} py-16 text-center text-slate-400 space-y-3`}>
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-kulkul-purple" />
                <p className="text-xs font-semibold">Loading assigned programs...</p>
              </div>
            ) : programs.length === 0 ? (
              <div className={`${cardShell} text-center space-y-3`}>
                <GraduationCap className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Programs Assigned Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ask your organization administrator to add you as a mentor to a program.
                </p>
              </div>
            ) : (
              programs.map((prog) => (
                <div
                  key={prog.program_id}
                  className={`${cardShell} flex flex-col lg:flex-row lg:items-center justify-between gap-6`}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs font-extrabold">
                      <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-kulkul-purple">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{prog.org_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {prog.fellow_count} Fellow{prog.fellow_count !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="text-slate-500">{prog.role_title || 'Program Mentor'}</span>
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900">{prog.program_name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {prog.description || 'Fellowship program for ambitious software engineers.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Link
                      to={`/programs/${prog.org_slug}/${prog.program_slug}/room`}
                      className="btn btn-sm btn-primary"
                      title="Enter Program Room to collaborate with fellows"
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Room</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProgramId(prog.program_id);
                        setActiveNavId('fellows');
                      }}
                      className="btn btn-sm btn-outline"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>View Fellows</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProgramId(prog.program_id);
                        setActiveNavId('assignments');
                      }}
                      className="btn btn-sm btn-outline"
                      title="Manage Assignments & Grading"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Assignments</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. COHORT FELLOWS TABLE VIEW */}
        {/* ========================================================================= */}
        {activeNavId === 'fellows' && (
          <div className={`${cardShell} space-y-5`}>
            <div className="section-header">
              <h3 className="section-title">Cohort Fellows Directory</h3>
            </div>

            <div className="table-toolbar">
              <div className="search-field">
                <Search />
                <input
                  type="text"
                  value={searchFellowQuery}
                  onChange={(e) => setSearchFellowQuery(e.target.value)}
                  placeholder="Search fellow name or email..."
                  className="search-input"
                />
              </div>
              {programs.length > 1 && (
                <select
                  value={activeProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="filter-select"
                  aria-label="Program"
                >
                  {programs.map((p) => (
                    <option key={p.program_id} value={p.program_id}>
                      {p.program_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Fellows Table Content */}
            <div className="data-table-wrap">
              {isLoadingFellows ? (
                <div className="py-16 text-center text-slate-400 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-kulkul-purple" />
                  <p className="text-xs font-semibold">Loading fellows list...</p>
                </div>
              ) : filteredFellows.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
                  <p className="text-sm font-bold text-slate-600">No fellows found</p>
                  <p className="text-xs text-slate-400">
                    {searchFellowQuery
                      ? 'No fellows matched your search query.'
                      : 'No candidates have enrolled in this fellowship program yet.'}
                  </p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fellow Details</th>
                      {hasTracks && <th className="whitespace-nowrap">Track</th>}
                      <th className="whitespace-nowrap">Stage</th>
                      <th className="whitespace-nowrap">Assessment</th>
                      <th className="whitespace-nowrap">Profiles</th>
                      <th className="text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFellows.map((fellow) => (
                      <tr key={fellow.id} className="transition">
                        <td>
                          <div className="cell-primary">
                            {fellow.full_name}
                          </div>
                          <div className="cell-secondary mt-0.5 flex items-center gap-2">
                            <span>{fellow.email}</span>
                            {fellow.phone && (
                              <>
                                <span>•</span>
                                <span>{fellow.phone}</span>
                              </>
                            )}
                          </div>
                          {fellow.university && (
                            <div className="text-3xs text-slate-400 mt-0.5">
                              {fellow.university} {fellow.major ? `(${fellow.major})` : ''}
                            </div>
                          )}
                        </td>

                        {hasTracks && (
                          <td className="whitespace-nowrap">
                            {fellow.track_name ? (
                              <span className="text-2xs font-extrabold text-kulkul-purple">
                                {fellow.track_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">&mdash;</span>
                            )}
                          </td>
                        )}

                        <td className="whitespace-nowrap">
                          <span
                            className={`text-2xs font-bold capitalize ${
                              fellow.current_stage === 'accepted'
                                ? 'text-emerald-700'
                                : fellow.current_stage === 'rejected'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {fellow.current_stage?.replace(/_/g, ' ') || 'Submitted'}
                          </span>
                        </td>

                        <td className="whitespace-nowrap">
                          <div className="space-y-0.5">
                            {fellow.mcq_score !== undefined && (
                              <div className="text-2xs font-semibold text-slate-700">
                                MCQ: <span className="font-bold text-slate-900">{fellow.mcq_score}%</span>
                              </div>
                            )}
                            {fellow.ai_score !== undefined && (
                              <div className="text-2xs font-semibold text-purple-700">
                                AI Interview: <span className="font-bold text-purple-900">{fellow.ai_score}%</span>
                              </div>
                            )}
                            {fellow.mcq_score === undefined && fellow.ai_score === undefined && (
                              <span className="text-slate-400 text-3xs italic">No score data</span>
                            )}
                          </div>
                        </td>

                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {fellow.github_url && (
                              <a
                                href={fellow.github_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                                title="View GitHub"
                              >
                                <Github className="w-4 h-4" />
                              </a>
                            )}
                            {fellow.linkedin_url && (
                              <a
                                href={fellow.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                                title="View LinkedIn"
                              >
                                <Linkedin className="w-4 h-4" />
                              </a>
                            )}
                            {fellow.resume_url && (
                              <a
                                href={fellow.resume_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-slate-500 hover:text-kulkul-purple hover:bg-purple-50 rounded-lg transition"
                                title="View Resume / CV"
                              >
                                <FileText className="w-4 h-4" />
                              </a>
                            )}
                            {!fellow.github_url && !fellow.linkedin_url && !fellow.resume_url && (
                              <span className="text-slate-400 text-3xs italic">—</span>
                            )}
                          </div>
                        </td>

                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedFellow(fellow)}
                            className="btn btn-xs btn-outline text-slate-600 hover:text-kulkul-purple hover:border-kulkul-purple"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. FELLOW DETAILS DRAWER / MODAL */}
        {/* ========================================================================= */}
        {selectedFellow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="stitch-card bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-kulkul-purple flex items-center justify-center font-black text-lg">
                    {selectedFellow.full_name?.charAt(0) || 'F'}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {selectedFellow.full_name}
                    </h3>
                    <p className="text-xs text-slate-500">{selectedFellow.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFellow(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Info Grid */}
              <div className={`grid ${selectedFellow.track_name ? 'grid-cols-2' : 'grid-cols-1'} gap-3 text-xs`}>
                {selectedFellow.track_name && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-3xs font-extrabold uppercase text-slate-400">Track</span>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {selectedFellow.track_name}
                    </div>
                  </div>
                )}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-3xs font-extrabold uppercase text-slate-400">Stage</span>
                  <div className="font-bold text-emerald-700 capitalize mt-0.5">
                    {selectedFellow.current_stage?.replace(/_/g, ' ') || 'Active'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-3xs font-extrabold uppercase text-slate-400">University</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedFellow.university || 'Not specified'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-3xs font-extrabold uppercase text-slate-400">Phone</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedFellow.phone || 'Not specified'}
                  </div>
                </div>
              </div>

              {/* AI Interview Assessment Scores (if available) */}
              {(selectedFellow.ai_score !== undefined ||
                selectedFellow.mcq_score !== undefined) && (
                <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-100 space-y-3">
                  <div className="text-xs font-bold text-kulkul-purple flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>Candidate Evaluation Snapshot</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {selectedFellow.mcq_score !== undefined && (
                      <div>
                        <div className="text-3xs text-slate-500 uppercase font-bold">Logic Test</div>
                        <div className="text-base font-black text-slate-900">
                          {selectedFellow.mcq_score}%
                        </div>
                      </div>
                    )}
                    {selectedFellow.ai_score !== undefined && (
                      <div>
                        <div className="text-3xs text-slate-500 uppercase font-bold">AI Interview</div>
                        <div className="text-base font-black text-purple-900">
                          {selectedFellow.ai_score}%
                        </div>
                      </div>
                    )}
                  </div>
                  {selectedFellow.ai_recommendation && (
                    <div className="text-2xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-purple-100">
                      <strong>AI Summary:</strong> {selectedFellow.ai_recommendation}
                    </div>
                  )}
                </div>
              )}

              {/* Profiles & Links */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  External Profiles
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFellow.github_url && (
                    <a
                      href={selectedFellow.github_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline text-slate-700 flex items-center gap-2"
                    >
                      <Github className="w-4 h-4" />
                      <span>GitHub</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  )}
                  {selectedFellow.linkedin_url && (
                    <a
                      href={selectedFellow.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-2"
                    >
                      <Linkedin className="w-4 h-4" />
                      <span>LinkedIn</span>
                      <ExternalLink className="w-3 h-3 text-blue-400" />
                    </a>
                  )}
                  {selectedFellow.resume_url && (
                    <a
                      href={selectedFellow.resume_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline text-slate-700 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Resume / CV</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  )}
                  {!selectedFellow.github_url &&
                    !selectedFellow.linkedin_url &&
                    !selectedFellow.resume_url && (
                      <p className="text-xs text-slate-400 italic">No external links provided.</p>
                    )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedFellow(null)}
                  className="btn btn-sm btn-outline px-4 text-slate-600"
                >
                  Close
                </button>
                <a
                  href={`mailto:${selectedFellow.email}`}
                  className="btn btn-sm btn-primary px-4 flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. SESSIONS & ATTENDANCE TRACKER */}
        {/* ========================================================================= */}
        {activeNavId === 'sessions' && (
          <div className="space-y-6">
            {programs.length > 1 && (
              <div className="flex items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm px-6 sm:px-8 py-4">
                <span className="text-xs font-bold text-slate-700">Active Program:</span>
                <select
                  value={activeProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="px-3.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                >
                  {programs.map((p) => (
                    <option key={p.program_id} value={p.program_id}>
                      {p.program_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeProgramId ? (
              <ProgramSessionsView
                programId={activeProgramId}
                programName={programs.find((p) => p.program_id === activeProgramId)?.program_name}
                isMentor={true}
                showSummary={false}
              />
            ) : (
              <div className={`${cardShell} text-center space-y-3`}>
                <p className="text-xs text-slate-500 font-bold">No active program found to schedule sessions for.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. ASSIGNMENTS & COHORT GRADING */}
        {/* ========================================================================= */}
        {activeNavId === 'assignments' && (
          <div className="space-y-6">
            {programs.length > 1 && (
              <div className="flex items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm px-6 sm:px-8 py-4">
                <span className="text-xs font-bold text-slate-700">Active Program:</span>
                <select
                  value={activeProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="px-3.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                >
                  {programs.map((p) => (
                    <option key={p.program_id} value={p.program_id}>
                      {p.program_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeProgramId ? (
              <ProgramAssignmentsView
                programId={activeProgramId}
                isMentorOrAdmin={true}
              />
            ) : (
              <div className={`${cardShell} text-center space-y-3`}>
                <p className="text-xs text-slate-500 font-bold">No active program found to manage assignments for.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 7. GITHUB CONTRIBUTION ACTIVITY */}
        {/* ========================================================================= */}
        {activeNavId === 'github' && (
          <div className="space-y-6">
            {programs.length > 1 && (
              <div className="flex items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm px-6 sm:px-8 py-4">
                <span className="text-xs font-bold text-slate-700">Active Program:</span>
                <select
                  value={activeProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="px-3.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                >
                  {programs.map((p) => (
                    <option key={p.program_id} value={p.program_id}>
                      {p.program_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeProgramId ? (
              <ProgramGitHubActivityView programId={activeProgramId} showSummary={false} />
            ) : (
              <div className={`${cardShell} text-center space-y-3`}>
                <p className="text-xs text-slate-500 font-bold">No active program found to track GitHub activity for.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};
