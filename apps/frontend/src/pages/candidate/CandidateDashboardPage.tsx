import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import {
  FileText,
  Clock,
  Terminal,
  Compass,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Mail,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const emailParam = searchParams.get('email') || localStorage.getItem('candidate_email') || '';
  const [emailInput, setEmailInput] = useState(emailParam);
  const [activeEmail, setActiveEmail] = useState(emailParam);
  const [activeTab, setActiveTab] = useState<'applications' | 'assessments' | 'ai_interview' | 'explore'>('applications');

  useEffect(() => {
    if (activeEmail) {
      localStorage.setItem('candidate_email', activeEmail);
    }
  }, [activeEmail]);

  const { data, isLoading } = useQuery({
    queryKey: ['candidate-applications', activeEmail],
    queryFn: async () => {
      if (!activeEmail) return { applications: [] };
      const res = await axios.get(`/api/v1/candidate/applications?email=${encodeURIComponent(activeEmail)}`);
      return res.data;
    },
    enabled: Boolean(activeEmail),
  });

  const applications: CandidateApplicationItem[] = data?.applications || [];
  const candidateName = applications[0]?.full_name || activeEmail.split('@')[0];

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      toast.error('Please enter your email');
      return;
    }
    const cleanEmail = emailInput.trim().toLowerCase();
    setActiveEmail(cleanEmail);
    setSearchParams({ email: cleanEmail });
  };

  const handleSignOut = () => {
    localStorage.removeItem('candidate_email');
    setActiveEmail('');
    setEmailInput('');
    setSearchParams({});
    navigate('/');
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

  const navItems: NavItem[] = [
    {
      id: 'applications',
      label: 'My Applications',
      icon: FileText,
      badge: activeEmail ? applications.length : undefined,
    },
    {
      id: 'assessments',
      label: 'Logic MCQ Tests',
      icon: Clock,
      badge: activeEmail ? applications.filter((a) => a.test_token).length : undefined,
    },
    {
      id: 'ai_interview',
      label: 'AI Technical Screen',
      icon: Terminal,
      badge: activeEmail ? applications.filter((a) => a.interview_token).length : undefined,
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
      title={activeEmail ? `Welcome back, ${candidateName}!` : 'Candidate Portal'}
      subtitle={
        activeEmail
          ? 'Track your evaluation journey, launch timed assessments, and inspect AI screening feedback.'
          : 'Sign in with your application email to check test results and candidate scorecards.'
      }
      candidateEmail={activeEmail}
      onCandidateSignOut={handleSignOut}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
      headerActions={
        activeEmail ? (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {applications.filter((a) => a.test_passed).length} Passed Assessments
            </span>
          </div>
        ) : undefined
      }
    >
      {!activeEmail ? (
        /* Email Prompt Screen */
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-kulkul-purple-light text-kulkul-purple mx-auto flex items-center justify-center mb-5 shadow-2xs">
            <Mail className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Access Candidate Portal</h2>
          <p className="text-sm text-slate-600 mt-2 mb-6">
            Enter the email address you used when applying to view your test scorecards, AI interview invitations, and track progress.
          </p>

          <form onSubmit={handleLookup} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Application Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="candidate@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover transition shadow-md flex items-center justify-center gap-2"
            >
              <span>View My Applications</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
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
                    We didn't find any fellowship applications associated with <span className="font-semibold text-slate-700">{activeEmail}</span>. Apply to an active track below to get started!
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
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 mb-2">
                    Open for Admissions
                  </span>
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
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 mb-2">
                    Open for Admissions
                  </span>
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
      )}
    </DashboardLayout>
  );
};
