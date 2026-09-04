import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import {
  FileText,
  Clock,
  Terminal,
  Compass,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Building2,
} from 'lucide-react';

interface CandidateApplicationItem {
  applicant_id: string;
  email: string;
  full_name: string;
  current_stage: string;
  program_id: string;
  program_slug: string;
  program_name: string;
  track_id?: string;
  track_slug?: string;
  track_name?: string;
  organization_id: string;
  org_slug: string;
  org_name: string;
  org_logo_url?: string;
  test_token?: string;
  test_score: number;
  test_passed: boolean;
  test_status?: string;
  time_spent_seconds: number;
  interview_token?: string;
  interview_status?: string;
  interview_score: number;
  created_at: string;
}

export const CandidateDashboardPage: React.FC = () => {
  const { user: authUser, logout: authLogout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'applications' | 'assessments' | 'ai_interview' | 'explore'>('applications');

  const { data, isLoading } = useQuery({
    queryKey: ['candidate-applications', authUser?.email],
    queryFn: async () => {
      const res = await apiClient.get('/candidate/applications');
      return res.data;
    },
    enabled: Boolean(authUser?.email),
  });

  const applications: CandidateApplicationItem[] = data?.applications || [];
  const candidateName = applications[0]?.full_name || (authUser?.email ? authUser.email.split('@')[0] : 'Candidate');

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    window.location.href = `${apiBase}/auth/oauth/google?return_to=/candidate/dashboard`;
  };

  const handleSignOut = async () => {
    try {
      await authLogout();
    } catch {
      // ignore
    }
    navigate('/candidate/dashboard');
  };

  const getStageBadge = (stage: string, passed: boolean) => {
    switch (stage) {
      case 'accepted':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Accepted 🎉</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">Not Selected</span>;
      case 'ai_interview_completed':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/30">AI Screening Completed</span>;
      case 'ai_interview_invited':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">AI Interview Invited</span>;
      case 'test_completed':
        return passed ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Assessment Passed</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Assessment Completed</span>
        );
      case 'test_failed':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Assessment Below Benchmark</span>;
      case 'test_in_progress':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Test In Progress</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">Application Submitted</span>;
    }
  };

  // If candidate is not authenticated, show dedicated Google Sign In screen
  if (!authUser?.email) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-md w-full">
            {/* Main Card */}
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Candidate Portal
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-2">
                  Sign in with your verified Google account to track your fellowship applications, view MCQ test scorecards, and inspect AI interview evaluations.
                </p>
              </div>

              {/* Google OAuth Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 rounded-full text-sm font-bold text-slate-800 shadow-sm hover:shadow-md transition duration-150"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Footer Links inside Card */}
              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2 text-center">
                <div>
                  <span className="text-xs text-slate-500">Are you a fellowship administrator? </span>
                  <Link to="/admin/login" className="text-xs font-bold text-kulkul-purple hover:underline">
                    Company Sign In
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      id: 'applications',
      label: 'My Applications',
      icon: FileText,
      badge: applications.length,
    },
    {
      id: 'assessments',
      label: 'Logic MCQ Tests',
      icon: Clock,
      badge: applications.filter((a) => a.test_token).length || undefined,
    },
    {
      id: 'ai_interview',
      label: 'AI Technical Screen',
      icon: Terminal,
      badge: applications.filter((a) => a.interview_token).length || undefined,
      badgeColor: 'bg-purple-100 text-kulkul-purple',
    },
    {
      id: 'explore',
      label: 'Explore Programs',
      icon: Compass,
    },
  ];

  return (
    <DashboardLayout
      portalType="candidate"
      title={`Welcome back, ${candidateName}!`}
      subtitle="Track your evaluation journey, launch timed assessments, and inspect AI screening feedback."
      candidateEmail={authUser?.email}
      onCandidateSignOut={handleSignOut}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
    >
      <div className="space-y-8">
          {/* ========================================================================= */}
          {/* TAB 1: MY APPLICATIONS */}
          {/* ========================================================================= */}
          {activeTab === 'applications' && (
            <div className="space-y-6">
              {isLoading ? (
                <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center">
                  <div className="w-10 h-10 border-4 border-kulkul-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm text-slate-500 font-medium">Loading your applications...</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">No applications found</h3>
                  <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
                    We didn't find any fellowship applications associated with <span className="font-semibold text-slate-700">{authUser?.email}</span>. Apply to an active track below to get started!
                  </p>
                  <button
                    onClick={() => setActiveTab('explore')}
                    className="px-5 py-2.5 rounded-full bg-kulkul-purple text-white text-xs font-bold shadow-xs"
                  >
                    Browse Open Tracks
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {applications.map((app) => (
                    <div
                      key={app.applicant_id}
                      className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-2xs hover:shadow-md transition"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0 font-bold text-lg shadow-2xs">
                            {app.org_logo_url ? (
                              <img src={app.org_logo_url} alt={app.org_name} className="w-8 h-8 rounded-xl object-cover" />
                            ) : (
                              <Building2 className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="text-xl font-bold text-slate-900">{app.program_name}</h3>
                              {app.track_name && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
                                  {app.track_name}
                                </span>
                              )}
                              {getStageBadge(app.current_stage, app.test_passed)}
                            </div>
                            <p className="text-xs text-slate-500">
                              Hosted by <span className="font-semibold text-slate-700">{app.org_name}</span> &middot; Applied on {new Date(app.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        {/* Primary Action Button */}
                        <div className="flex items-center gap-3 w-full lg:w-auto">
                          {app.test_token && (app.current_stage === 'applied' || app.current_stage === 'test_in_progress') && (
                            <button
                              onClick={() => navigate(`/lit2026/test/${app.test_token}`)}
                              className="w-full lg:w-auto px-6 py-3 rounded-full font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-sm transition flex items-center justify-center gap-2"
                            >
                              <span>Take Timed Test</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}

                          {app.test_token && (app.current_stage === 'test_completed' || app.current_stage === 'test_failed') && (
                            <button
                              onClick={() => navigate(`/lit2026/result/${app.test_token}`)}
                              className="w-full lg:w-auto px-6 py-3 rounded-full font-bold text-kulkul-purple bg-kulkul-purple-light hover:bg-kulkul-purple-subtle border border-kulkul-purple/20 transition flex items-center justify-center gap-2"
                            >
                              <span>View Scorecard</span>
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}

                          {app.interview_token && app.current_stage === 'ai_interview_invited' && (
                            <button
                              onClick={() => navigate(`/lit2026/interview/${app.interview_token}`)}
                              className="w-full lg:w-auto px-6 py-3 rounded-full font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm transition flex items-center justify-center gap-2 animate-pulse"
                            >
                              <Terminal className="w-4 h-4 text-kulkul-orange" />
                              <span>Join AI Interview Room</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detailed Metric Strips */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="text-2xs font-bold uppercase tracking-wider text-slate-500">Logic Assessment Score</div>
                          <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {app.test_status === 'completed' ? `${app.test_score}%` : 'Not Completed'}
                          </div>
                          <div className="text-2xs text-slate-500 mt-0.5">
                            {app.test_passed ? 'Cleared passing mark' : app.test_status === 'completed' ? 'Below passing mark' : 'Pending test start'}
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="text-2xs font-bold uppercase tracking-wider text-slate-500">AI Screening Evaluation</div>
                          <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {app.interview_status === 'completed' ? `${app.interview_score}/100` : app.interview_token ? 'Invited' : 'Pending'}
                          </div>
                          <div className="text-2xs text-slate-500 mt-0.5">
                            {app.interview_status === 'completed' ? 'Evaluated by AI Screener' : 'Technical conversation gate'}
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="text-2xs font-bold uppercase tracking-wider text-slate-500">Selection Status</div>
                          <div className="text-xl font-extrabold text-kulkul-purple mt-1 capitalize">
                            {app.current_stage.replace(/_/g, ' ')}
                          </div>
                          <div className="text-2xs text-slate-500 mt-0.5">Reviewed by program committee</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: ASSESSMENTS & TESTS */}
          {/* ========================================================================= */}
          {activeTab === 'assessments' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {applications.map((app) => (
                  <div key={app.applicant_id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                        {app.track_name || 'General'}
                      </span>
                      {getStageBadge(app.current_stage, app.test_passed)}
                    </div>

                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">{app.program_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">30-Minute Timed Logic & Technical Evaluation</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">Your Score:</span>
                      <span className={`text-base font-extrabold ${app.test_passed ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {app.test_status === 'completed' ? `${app.test_score}%` : 'Not Completed'}
                      </span>
                    </div>

                    {app.test_token && (
                      <button
                        onClick={() => navigate(app.test_status === 'completed' ? `/lit2026/result/${app.test_token}` : `/lit2026/test/${app.test_token}`)}
                        className="w-full py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold transition flex items-center justify-center gap-2"
                      >
                        <span>{app.test_status === 'completed' ? 'View Itemized Scorecard' : 'Start Logic Assessment'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: AI TECHNICAL SCREENING */}
          {/* ========================================================================= */}
          {activeTab === 'ai_interview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {applications.map((app) => (
                  <div key={app.applicant_id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                        {app.track_name || 'AI Screen'}
                      </span>
                      {app.interview_status === 'completed' ? (
                        <span className="px-2.5 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700">
                          Interview Completed
                        </span>
                      ) : app.interview_token ? (
                        <span className="px-2.5 py-1 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 animate-pulse">
                          Invite Ready
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-2xs font-bold bg-slate-100 text-slate-500">
                          Pending MCQ Clearance
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">{app.program_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Conversational AI Technical Evaluation Session</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">AI Evaluation Score:</span>
                      <span className="text-base font-extrabold text-kulkul-purple">
                        {app.interview_status === 'completed' ? `${app.interview_score}/100` : 'Pending'}
                      </span>
                    </div>

                    {app.interview_token && (
                      <button
                        onClick={() => navigate(`/lit2026/interview/${app.interview_token}`)}
                        className="w-full py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold transition flex items-center justify-center gap-2"
                      >
                        <Terminal className="w-3.5 h-3.5 text-kulkul-orange" />
                        <span>{app.interview_status === 'completed' ? 'Review AI Transcript' : 'Enter AI Interview Room'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: EXPLORE PROGRAMS */}
          {/* ========================================================================= */}
          {activeTab === 'explore' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Fullstack Software Engineering Track</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Master modern JavaScript DOM, HTML5/CSS, Java OOP, and scalable REST API architectures.
                  </p>
                </div>
                <Link
                  to="/programs/rsa/lit2026/tracks/fullstack/apply"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-kulkul-purple hover:underline"
                >
                  <span>Apply to Fullstack Track</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">QA & Test Automation Track</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Automated testing pipelines with Cypress, Postman API suites, and regression testing workflows.
                  </p>
                </div>
                <Link
                  to="/programs/rsa/lit2026/tracks/qa-automation/apply"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-kulkul-purple hover:underline"
                >
                  <span>Apply to QA Track</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
    </DashboardLayout>
  );
};
