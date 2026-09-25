import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { mentorService } from '@/services/mentorService';
import { useAuthStore } from '@/hooks/useAuthStore';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import type { ApplicantListItem, MentorProgramSummary } from '@/services/types';
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
  RefreshCw,
  Loader2,
  Video,
  Award,
  X,
  Building2,
  UserCheck,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProgramSessionsView } from '@/components/sessions/ProgramSessionsView';
import { ProgramAssignmentsView } from '@/components/assignments/ProgramAssignmentsView';

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
    isRefetching: isRefetchingOverview,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['mentor-overview'],
    queryFn: () => mentorService.getOverview(),
  });

  const programs: MentorProgramSummary[] = overview?.assigned_programs || [];
  const totalPrograms = programs.length;
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
    refetch: refetchFellows,
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

  // Sidebar navigation items
  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview & Cohorts',
      icon: GraduationCap,
      onClick: () => setActiveNavId('overview'),
    },
    {
      id: 'programs',
      label: 'My Programs',
      icon: BookOpen,
      badge: totalPrograms > 0 ? totalPrograms : undefined,
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
  ];

  const handleRefresh = async () => {
    await Promise.all([refetchOverview(), refetchFellows()]);
    toast.success('Dashboard refreshed');
  };

  return (
    <DashboardLayout
      portalType="mentor"
      title="Mentor Dashboard"
      subtitle="Guide and empower fellowship cohorts with real-world technical expertise."
      navItems={navItems}
      activeNavId={activeNavId}
      onNavChange={setActiveNavId}
      headerActions={
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoadingOverview || isRefetchingOverview}
          className="btn btn-sm btn-outline text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
          title="Refresh dashboard data"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefetchingOverview ? 'animate-spin text-kulkul-purple' : ''}`}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <div className="space-y-8">
        {/* ========================================================================= */}
        {/* 1. MENTOR WELCOME BANNER */}
        {/* ========================================================================= */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-kulkul-purple via-[#4a1d7f] to-[#250d45] text-white p-6 sm:p-8 shadow-xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Welcome back, {user?.name || user?.email?.split('@')[0]}!
              </h2>
              <p className="text-sm text-purple-100/90 max-w-xl leading-relaxed">
                You are currently mentoring across{' '}
                <strong className="text-white font-bold">{totalPrograms} active program{totalPrograms !== 1 ? 's' : ''}</strong>{' '}
                with <strong className="text-white font-bold">{totalFellows} registered fellow{totalFellows !== 1 ? 's' : ''}</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveNavId('fellows')}
                className="btn btn-sm bg-kulkul-orange hover:bg-orange-500 text-white font-bold border-none shadow-md shadow-orange-950/20 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                <span>View Fellows</span>
              </button>
            </div>
          </div>

          {/* Decorative glow element */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-kulkul-orange/20 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* ========================================================================= */}
        {/* 2. QUICK STATS ROW */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Assigned Programs
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{totalPrograms}</div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Total Fellows
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{totalFellows}</div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Live Sessions
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">Room</span>
                <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-kulkul-purple uppercase">
                  Phase 2
                </span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Video className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Certifications
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">Badges</span>
                <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase">
                  Phase 5
                </span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. ASSIGNED PROGRAMS GRID */}
        {/* ========================================================================= */}
        {(activeNavId === 'overview' || activeNavId === 'programs') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Assigned Cohort Programs</h3>
                <p className="text-xs text-slate-500">
                  Programs where you serve as a designated technical mentor.
                </p>
              </div>
            </div>

            {isLoadingOverview ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-kulkul-purple" />
                <p className="text-xs font-semibold">Loading assigned programs...</p>
              </div>
            ) : programs.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-4">
                <div className="w-14 h-14 bg-purple-50 text-kulkul-purple rounded-2xl flex items-center justify-center mx-auto">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-800">No Programs Assigned Yet</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    You have not been assigned to any fellowship cohorts yet. Reach out to your organization administrator to add you as a mentor to active programs.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {programs.map((prog) => (
                  <div
                    key={prog.program_id}
                    className="bg-white rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="p-6 space-y-4">
                      {/* Top badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-black uppercase tracking-wider bg-purple-50 text-kulkul-purple border border-purple-100">
                          <Building2 className="w-3 h-3" />
                          <span>{prog.org_name}</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Users className="w-3 h-3" />
                          <span>{prog.fellow_count} Fellow{prog.fellow_count !== 1 ? 's' : ''}</span>
                        </span>
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1.5">
                        <h4 className="text-lg font-black text-slate-900 group-hover:text-kulkul-purple transition">
                          {prog.program_name}
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {prog.description || 'Fellowship program for ambitious software engineers.'}
                        </p>
                      </div>

                      {/* Mentor Role Info */}
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                        <div className="text-slate-500 text-3xs font-extrabold uppercase tracking-wider">
                          Role Title
                        </div>
                        <div className="font-bold text-slate-800">
                          {prog.role_title || 'Program Mentor'}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/programs/${prog.org_slug}/${prog.program_slug}/room`}
                        className="btn btn-sm bg-kulkul-purple hover:bg-[#431970] text-white font-bold flex items-center gap-1.5 shadow-2xs"
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
                        className="flex-1 btn btn-sm btn-primary shadow-xs flex items-center justify-center gap-1.5"
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
                        className="btn btn-sm btn-outline text-slate-700 hover:text-kulkul-purple hover:border-kulkul-purple flex items-center gap-1.5"
                        title="Manage Assignments & Grading"
                      >
                        <FileText className="w-3.5 h-3.5 text-kulkul-purple" />
                        <span>Tasks</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. COHORT FELLOWS TABLE VIEW */}
        {/* ========================================================================= */}
        {(activeNavId === 'overview' || activeNavId === 'fellows') && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Table Header / Filter Bar */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-kulkul-purple" />
                  <span>Cohort Fellows Directory</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Review applicant profiles{hasTracks ? ', tracks,' : ''} and contact details of candidates in your programs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Program Selector */}
                {programs.length > 1 && (
                  <select
                    value={activeProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  >
                    {programs.map((p) => (
                      <option key={p.program_id} value={p.program_id}>
                        {p.program_name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFellowQuery}
                    onChange={(e) => setSearchFellowQuery(e.target.value)}
                    placeholder="Search fellow name or email..."
                    className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                  />
                </div>
              </div>
            </div>

            {/* Fellows Table Content */}
            <div className="overflow-x-auto">
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
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/75 border-b border-slate-200 text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-3.5 px-6">Fellow Details</th>
                      {hasTracks && <th className="py-3.5 px-6 whitespace-nowrap">Track</th>}
                      <th className="py-3.5 px-6 whitespace-nowrap">Stage</th>
                      <th className="py-3.5 px-6 whitespace-nowrap">Assessment</th>
                      <th className="py-3.5 px-6 whitespace-nowrap">Profiles</th>
                      <th className="py-3.5 px-6 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFellows.map((fellow) => (
                      <tr key={fellow.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-6">
                          <div className="font-bold text-slate-900 text-sm">
                            {fellow.full_name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
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
                          <td className="py-3.5 px-6 whitespace-nowrap">
                            {fellow.track_name ? (
                              <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-purple-50 text-kulkul-purple border border-purple-100">
                                {fellow.track_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">&mdash;</span>
                            )}
                          </td>
                        )}

                        <td className="py-3.5 px-6 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-full text-2xs font-bold capitalize ${
                              fellow.current_stage === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : fellow.current_stage === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {fellow.current_stage?.replace(/_/g, ' ') || 'Submitted'}
                          </span>
                        </td>

                        <td className="py-3.5 px-6 whitespace-nowrap">
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

                        <td className="py-3.5 px-6 whitespace-nowrap">
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

                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
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
          <div className="space-y-4">
            {programs.length > 1 && (
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200">
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
              />
            ) : (
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
                <p className="text-xs text-slate-500 font-bold">No active program found to schedule sessions for.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. ASSIGNMENTS & COHORT GRADING */}
        {/* ========================================================================= */}
        {activeNavId === 'assignments' && (
          <div className="space-y-4">
            {programs.length > 1 && (
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200">
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
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
                <p className="text-xs text-slate-500 font-bold">No active program found to manage assignments for.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};
