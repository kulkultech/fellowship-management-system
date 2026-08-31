import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  User,
  ArrowRight,
  Sparkles,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  LogOut,
  Mail,
  Building2,
  Terminal,
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between h-20 sm:h-24">
            <Link to="/" className="flex items-center gap-3.5 group">
              <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 sm:h-12 w-auto object-contain transition group-hover:opacity-90" />
              <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
                Candidate Portal
              </span>
            </Link>

            <div className="flex items-center gap-4">
              {activeEmail ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                    <User className="w-3.5 h-3.5 text-kulkul-purple" />
                    <span>{activeEmail}</span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-full transition shadow-xs"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/"
                  className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-xs transition"
                >
                  Back to Home
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 lg:px-12 py-10">
        {!activeEmail ? (
          /* Email Prompt Screen */
          <div className="max-w-md mx-auto my-12 stitch-card p-8 bg-white border border-slate-200 text-center shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-kulkul-purple-light text-kulkul-purple mx-auto flex items-center justify-center mb-5">
              <Mail className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Access Candidate Dashboard</h2>
            <p className="text-sm text-slate-600 mt-2 mb-6">
              Enter the email address you used when applying to view your test scorecards, AI interview invitations, and track status.
            </p>

            <form onSubmit={handleLookup} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Email Address
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
          /* Logged In Candidate Dashboard */
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="stitch-card p-8 bg-gradient-to-r from-kulkul-purple via-[#250b45] to-kulkul-purple text-white relative overflow-hidden">
              <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-kulkul-orange text-xs font-bold uppercase tracking-wider mb-3 border border-white/10">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Candidate Dashboard</span>
                  </div>
                  <h1 className="text-3xl font-extrabold text-white tracking-tight">
                    Welcome back, {candidateName}!
                  </h1>
                  <p className="text-white/80 text-sm mt-1">
                    Track your assessment progress, launch screening tests, and inspect evaluations across your applications.
                  </p>
                </div>

                <div className="flex gap-4">
                  <div className="px-5 py-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                    <div className="text-2xl font-extrabold text-white">{applications.length}</div>
                    <div className="text-2xs uppercase tracking-wider text-white/70 font-semibold mt-0.5">Applied Programs</div>
                  </div>
                  <div className="px-5 py-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                    <div className="text-2xl font-extrabold text-kulkul-orange">
                      {applications.filter((a) => a.test_passed).length}
                    </div>
                    <div className="text-2xs uppercase tracking-wider text-white/70 font-semibold mt-0.5">Tests Passed</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Applications List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Program Applications</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Real-time status updates and action links for your submissions</p>
                </div>
              </div>

              {isLoading ? (
                <div className="stitch-card p-12 bg-white border border-slate-200 text-center">
                  <div className="w-10 h-10 border-4 border-kulkul-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm text-slate-500 font-medium">Loading your applications...</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="stitch-card p-12 bg-white border border-slate-200 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">No applications found</h3>
                  <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
                    We didn't find any fellowship applications associated with <span className="font-semibold text-slate-700">{activeEmail}</span>. Apply to an active program below to get started!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {applications.map((app) => (
                    <div key={app.applicant_id} className="stitch-card p-6 sm:p-8 bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition">
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0 font-bold text-lg">
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

            {/* Explore More Fellowship Programs */}
            <div className="pt-8 border-t border-slate-200">
              <h2 className="text-xl font-extrabold text-slate-900 mb-4">Explore Available Fellowship Tracks</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="stitch-card p-6 bg-white border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 mb-2">Open</span>
                    <h3 className="text-base font-bold text-slate-900">Fullstack Software Engineering</h3>
                    <p className="text-xs text-slate-600 mt-1">Modern JavaScript DOM, HTML5/CSS, Java OOP, and REST API systems.</p>
                  </div>
                  <Link
                    to="/programs/rsa/lit2026/tracks/fullstack/apply"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-kulkul-purple hover:underline"
                  >
                    <span>Apply to Fullstack Track</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="stitch-card p-6 bg-white border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 mb-2">Open</span>
                    <h3 className="text-base font-bold text-slate-900">QA & Test Automation</h3>
                    <p className="text-xs text-slate-600 mt-1">Cypress, Postman, Systems, Regression testing, and problem solving.</p>
                  </div>
                  <Link
                    to="/programs/rsa/lit2026/tracks/qa-automation/apply"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-kulkul-purple hover:underline"
                  >
                    <span>Apply to QA Track</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
