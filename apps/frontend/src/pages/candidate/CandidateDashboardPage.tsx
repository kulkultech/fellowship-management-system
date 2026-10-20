import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient, resolveMediaUrl } from '@/services/apiClient';
import { authService } from '@/services/authService';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import {
  FileText,
  Clock,
  Terminal,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Building2,
  Mail,
  Lock,
  User,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  GraduationCap,
  Award,
  Share2,
  ShieldCheck,
  Home,
  CalendarDays,
  Video,
  Loader2,
} from 'lucide-react';
import { credentialService } from '@/services/credentialService';
import { AddBadgeToWallet } from '@/components/credentials/AddBadgeToWallet';
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar';
import { useCandidateSchedule } from '@/components/schedule/useCandidateSchedule';

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
  candidate_flow?: string[];
  form_submitted?: boolean;
  next_step?: string;
  redirect_url?: string;
  program_room_invited_at?: string;
}

export const CandidateDashboardPage: React.FC = () => {
  const { user: authUser, logout: authLogout, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  type CandidateTab = 'home' | 'applications' | 'assessments' | 'ai_interview' | 'calendar' | 'credentials';
  const [activeTab, setActiveTab] = useState<CandidateTab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'applications' ||
      tab === 'assessments' ||
      tab === 'ai_interview' ||
      tab === 'calendar' ||
      tab === 'credentials'
      ? tab
      : 'home';
  });

  // Candidate Auth Form States (when unauthenticated)
  const [candidateAuthMode, setCandidateAuthMode] = useState<'signin' | 'register'>('signin');
  const [candidateAuthTab, setCandidateAuthTab] = useState<'google' | 'password'>('google');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activationPendingEmail, setActivationPendingEmail] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['candidate-applications', authUser?.email],
    queryFn: async ({ signal }) => {
      try {
        const res = await apiClient.get('/candidate/applications', { signal });
        return res.data;
      } catch (err: any) {
        if (axios.isCancel(err) || err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return { applications: [] };
        }
        throw err;
      }
    },
    enabled: Boolean(authUser?.email),
  });

  const { data: credentialsData } = useQuery({
    queryKey: ['candidate-credentials', authUser?.email],
    queryFn: async ({ signal }) => {
      try {
        return await credentialService.getMyCredentials(signal);
      } catch (e: any) {
        if (axios.isCancel(e) || e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') {
          return { badges: [], certificate: null };
        }
        return { badges: [], certificate: null };
      }
    },
    enabled: Boolean(authUser?.email),
  });

  const applications: CandidateApplicationItem[] = data?.applications || [];

  // Sessions and assignment deadlines from the programs this fellow has joined
  const schedulePrograms = useMemo(
    () =>
      applications
        .filter((a) => a.current_stage === 'approved_for_live' && Boolean(a.program_room_invited_at))
        .map((a) => ({
          programId: a.program_id,
          programName: a.program_name,
          orgSlug: a.org_slug,
          programSlug: a.program_slug,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applications.map((a) => `${a.program_id}:${a.current_stage}:${a.program_room_invited_at || ''}`).join('|')]
  );
  const { events: scheduleEvents, isLoading: isLoadingSchedule } = useCandidateSchedule(
    schedulePrograms,
    activeTab === 'home' || activeTab === 'calendar'
  );
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

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formPassword.trim()) {
      toast.error('Please enter your email and password');
      return;
    }
    setUnverifiedEmail(null);
    setResendSuccess(false);
    setIsSubmitting(true);
    try {
      await login({ email: formEmail.trim().toLowerCase(), password: formPassword });
      toast.success('Welcome back!');
    } catch (err: any) {
      if (err?.response?.data?.requires_activation) {
        setUnverifiedEmail(err.response.data.email || formEmail.trim().toLowerCase());
        toast.error('Please activate your account via email before signing in.');
      } else {
        toast.error(err?.response?.data?.error || 'Invalid email or password');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (formPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authService.registerCandidate({
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        password: formPassword,
      });

      if (res.requires_activation) {
        setActivationPendingEmail(res.email || formEmail.trim().toLowerCase());
        toast.success('Registration successful! Please check your email.');
      } else {
        toast.success('Registration successful! Welcome!');
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to register account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendActivation = async (targetEmail?: string) => {
    const emailToResend = targetEmail || unverifiedEmail || activationPendingEmail;
    if (!emailToResend) return;
    setIsResending(true);
    try {
      await authService.resendActivation(emailToResend);
      setResendSuccess(true);
      toast.success('Activation link sent! Please check your inbox.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to resend activation link');
    } finally {
      setIsResending(false);
    }
  };

  const getStageBadge = (stage: string, passed: boolean) => {
    switch (stage) {
      case 'approved_for_live':
      case 'accepted':
        return <span className="whitespace-nowrap text-xs font-semibold text-emerald-700">Accepted Fellow</span>;
      case 'rejected':
        return <span className="whitespace-nowrap text-xs font-semibold text-rose-700">Not Selected</span>;
      case 'ai_interview_completed':
        return <span className="whitespace-nowrap text-xs font-semibold text-purple-700">AI Screening Completed</span>;
      case 'ai_interview_invited':
        return <span className="whitespace-nowrap text-xs font-semibold text-purple-700">AI Interview Invited</span>;
      case 'test_completed':
        return passed ? (
          <span className="whitespace-nowrap text-xs font-semibold text-emerald-700">Assessment Passed</span>
        ) : (
          <span className="whitespace-nowrap text-xs font-semibold text-amber-700">Assessment Completed</span>
        );
      case 'test_failed':
        return <span className="whitespace-nowrap text-xs font-semibold text-rose-700">Assessment Below Benchmark</span>;
      case 'test_in_progress':
        return <span className="whitespace-nowrap text-xs font-semibold text-blue-700">Test In Progress</span>;
      default:
        return <span className="whitespace-nowrap text-xs font-semibold text-slate-700">Application Submitted</span>;
    }
  };

  // If candidate is not authenticated, show candidate portal sign-in/registration screen
  if (!authUser?.email) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-md w-full">
            {activationPendingEmail ? (
              /* Activation Confirmation Screen */
              <div className="content-card text-center space-y-6 animate-in fade-in">
                <div className="w-16 h-16 mx-auto rounded-full bg-purple-100 flex items-center justify-center text-kulkul-purple">
                  <Mail className="w-8 h-8" />
                </div>

                <div>
                  <h1 className="heading-page">Check Your Email</h1>
                  <p className="text-sm text-slate-600 mt-2">
                    We sent an account activation link to:
                  </p>
                  <p className="font-bold text-slate-900 mt-1 break-all">
                    {activationPendingEmail}
                  </p>
                </div>

                <div className="panel-muted text-xs text-slate-600 text-left space-y-2">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                    <span>Click the activation link in your email to verify your account and start tracking your applications.</span>
                  </div>
                  <div className="meta-text">
                    The link is valid for 24 hours. Don't see it? Check your spam or promotions folder.
                  </div>
                </div>

                {resendSuccess ? (
                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Activation email resent successfully!</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleResendActivation(activationPendingEmail)}
                    disabled={isResending}
                    className="w-full btn btn-md btn-outline"
                  >
                    <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
                    <span>{isResending ? 'Resending...' : 'Resend Activation Email'}</span>
                  </button>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setActivationPendingEmail(null);
                      setCandidateAuthMode('signin');
                      setCandidateAuthTab('password');
                    }}
                    className="btn btn-sm btn-ghost"
                  >
                    &larr; Return to Sign In
                  </button>
                </div>
              </div>
            ) : (
              /* Main Auth Card */
              <div className="content-card text-center space-y-6">
                <div>
                  <h1 className="heading-page">Candidate Portal</h1>
                  <p className="text-sm text-slate-600 mt-2">
                    Access your fellowship applications, logic assessments, and AI screening results.
                  </p>
                </div>

                {/* Switch between Sign In and Create Account */}
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateAuthMode('signin');
                      setUnverifiedEmail(null);
                    }}
                    className={`py-2 px-3 rounded-xl transition ${
                      candidateAuthMode === 'signin'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'hover:text-slate-900 text-slate-500'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateAuthMode('register');
                      setUnverifiedEmail(null);
                    }}
                    className={`py-2 px-3 rounded-xl transition ${
                      candidateAuthMode === 'register'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'hover:text-slate-900 text-slate-500'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {candidateAuthMode === 'signin' ? (
                  /* Sign In View */
                  <div className="space-y-4">
                    {/* Method Selector */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCandidateAuthTab('google')}
                        className={`py-1.5 px-3 rounded-xl border transition ${
                          candidateAuthTab === 'google'
                            ? 'bg-purple-50 border-purple-300 text-kulkul-purple font-bold'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        Google 1-Click
                      </button>
                      <button
                        type="button"
                        onClick={() => setCandidateAuthTab('password')}
                        className={`py-1.5 px-3 rounded-xl border transition ${
                          candidateAuthTab === 'password'
                            ? 'bg-purple-50 border-purple-300 text-kulkul-purple font-bold'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        Email &amp; Password
                      </button>
                    </div>

                    {candidateAuthTab === 'google' ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          className="w-full btn btn-md btn-outline"
                        >
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                    ) : (
                      <form onSubmit={handlePasswordSignIn} className="space-y-4 text-left pt-1">
                        <div>
                          <label className="field-label">Email Address</label>
                          <div className="relative">
                            <input
                              type="email"
                              required
                              placeholder="e.g. candidate@example.com"
                              value={formEmail}
                              onChange={(e) => setFormEmail(e.target.value)}
                              className="form-input pl-10 pr-4"
                            />
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="field-label mb-0">Password</label>
                            <Link
                              to="/forgot-password"
                              className="text-xs font-semibold text-kulkul-purple hover:underline transition"
                            >
                              Forgot password?
                            </Link>
                          </div>
                          <div className="relative">
                            <input
                              type="password"
                              required
                              placeholder="Your password"
                              value={formPassword}
                              onChange={(e) => setFormPassword(e.target.value)}
                              className="form-input pl-10 pr-4"
                            />
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          </div>
                        </div>

                        {unverifiedEmail && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-left">
                            <div className="flex items-start gap-2 text-amber-800 text-xs">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Account not activated:</span> Please check your email for the activation link.
                              </div>
                            </div>
                            {resendSuccess ? (
                              <div className="flex items-center gap-1.5 text-2xs text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Activation email resent!</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleResendActivation(unverifiedEmail)}
                                disabled={isResending}
                                className="w-full btn btn-sm btn-outline"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                                <span>{isResending ? 'Resending...' : 'Resend Activation Email'}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full btn btn-md btn-primary"
                        >
                          {isSubmitting ? (
                            <span>Signing in...</span>
                          ) : (
                            <>
                              <span>Sign In to Dashboard</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  /* Register View */
                  <div className="space-y-4">
                    {/* Google 1-Click Option */}
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full btn btn-md btn-outline"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                      <span>Fast Sign Up with Google</span>
                    </button>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-3 subsection-title">
                        Or register with email
                      </span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <form onSubmit={handleRegisterCandidate} className="space-y-4 text-left">
                      <div>
                        <label className="field-label">Full Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Jane Doe"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="form-input pl-10 pr-4"
                          />
                          <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      <div>
                        <label className="field-label">Email Address</label>
                        <div className="relative">
                          <input
                            type="email"
                            required
                            placeholder="e.g. jane.doe@example.com"
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                            className="form-input pl-10 pr-4"
                          />
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      <div>
                        <label className="field-label">Create Password</label>
                        <div className="relative">
                          <input
                            type="password"
                            required
                            placeholder="At least 8 characters"
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                            className="form-input pl-10 pr-4"
                          />
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      <div className="p-3 bg-purple-50 border border-purple-100 rounded-2xl text-2xs text-slate-600 flex items-start gap-2">
                        <Mail className="w-3.5 h-3.5 text-kulkul-purple shrink-0 mt-0.5" />
                        <span>
                          An email verification link will be sent to confirm your email before first sign in.
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full btn btn-md btn-primary"
                      >
                        {isSubmitting ? (
                          <span>Creating Account...</span>
                        ) : (
                          <>
                            <span>Register Candidate Account</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

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
            )}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const acceptedCohortApps = applications.filter(
    (a) => a.current_stage === 'approved_for_live' && Boolean(a.program_room_invited_at)
  );

  const roomUrl = (a: CandidateApplicationItem) =>
    a.redirect_url || `/programs/${a.org_slug}/${a.program_slug}/room`;

  const navItems: NavItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
    },
    {
      id: 'applications',
      label: 'My Applications',
      icon: FileText,
      badge: applications.length,
      // Application steps, in the order candidates take them
      children: [
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
        },
      ],
    },
    ...(acceptedCohortApps.length > 0
      ? [
          {
            id: 'program_room',
            label: 'Program Room',
            icon: GraduationCap,
            badge: acceptedCohortApps.length,
            badgeColor: 'bg-emerald-100 text-emerald-800',
            // Opens the (first) room; with several rooms the children list each one
            onClick: () => navigate(roomUrl(acceptedCohortApps[0])),
            children:
              acceptedCohortApps.length > 1
                ? acceptedCohortApps.map((a) => ({
                    id: `room-${a.program_id}`,
                    label: a.program_name,
                    onClick: () => navigate(roomUrl(a)),
                  }))
                : undefined,
          },
        ]
      : []),
    {
      id: 'calendar',
      label: 'Calendar',
      icon: CalendarDays,
    },
    {
      id: 'credentials',
      label: 'Badges & Certificates',
      icon: Award,
      badge: credentialsData?.badges?.length || (credentialsData?.certificate ? 1 : undefined),
      badgeColor: 'bg-amber-100 text-amber-800',
    },
  ];

  const tabTitles: Record<CandidateTab, string> = {
    home: 'Home',
    applications: 'My Applications',
    assessments: 'Logic MCQ Tests',
    ai_interview: 'AI Technical Screen',
    calendar: 'Calendar',
    credentials: 'Badges & Certificates',
  };

  // What's next: steps the candidate still has to do, then upcoming sessions and deadlines
  const actionLabels: Record<string, { title: string; button: string }> = {
    fill_form: { title: 'Complete your application form', button: 'Continue Application' },
    mcq_test: { title: 'Take the Logic MCQ test', button: 'Start Test' },
    ai_interview: { title: 'Take the AI technical interview', button: 'Start Interview' },
  };
  const actionItems = applications.filter((a) => a.next_step && actionLabels[a.next_step] && a.redirect_url);
  const waitingItems = applications.filter((a) => a.next_step === 'completed' || a.next_step === 'pending_room_invite');
  const nowMs = Date.now();
  const upcomingEvents = scheduleEvents
    .filter((e) =>
      e.kind === 'session'
        ? new Date(e.end || e.start).getTime() >= nowMs
        : !e.done && new Date(e.start).getTime() >= nowMs
    )
    .slice(0, 8);
  const firstName = candidateName.split(' ')[0];
  const showAppProgram = applications.length > 1;
  const showEventProgram = schedulePrograms.length > 1;
  const mcqApps = applications.filter((a) => a.test_token || a.test_status);
  const interviewApps = applications.filter((a) => a.interview_token || a.interview_status);

  return (
    <DashboardLayout
      portalType="candidate"
      title={activeTab === 'home' ? undefined : tabTitles[activeTab]}
      candidateName={candidateName}
      candidateEmail={authUser?.email}
      onCandidateSignOut={handleSignOut}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
    >
      <div className="space-y-8">
        {/* Admin Session Notice Banner */}
        {authUser?.role && authUser.role !== 'candidate' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-100 text-kulkul-purple shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="card-title">
                  Company Administrator Session Active ({authUser.role})
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  You are currently signed in as <strong>{authUser.email}</strong> with administrative privileges.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
              <Link
                to={authUser.role === 'superadmin' ? '/superadmin/dashboard' : '/admin/dashboard'}
                className="btn btn-sm btn-primary whitespace-nowrap"
              >
                <span>Go to Admin Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={handleSignOut}
                className="btn btn-sm btn-outline"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
          {/* ========================================================================= */}
          {/* HOME: WELCOME + WHAT'S NEXT */}
          {/* ========================================================================= */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              <div>
                <h1 className="heading-page">Welcome back, {firstName}</h1>
                <p className="text-body mt-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <div className="content-card space-y-5">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">What&apos;s next</h3>
                  </div>
                </div>

                {isLoading || isLoadingSchedule ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading your schedule…</span>
                  </div>
                ) : actionItems.length === 0 && upcomingEvents.length === 0 && waitingItems.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <CalendarDays className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500">
                      {applications.length === 0
                        ? 'You have no applications yet. Use the application link shared by the program to apply.'
                        : 'Nothing coming up right now.'}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {actionItems.map((app) => (
                      <li key={`action-${app.applicant_id}`} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                        <div className="sm:w-36 shrink-0">
                          <div className="text-xs font-bold text-kulkul-purple">To do now</div>
                          <div className="text-2xs text-slate-500">Application step</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ArrowRight className="w-4 h-4 text-kulkul-purple shrink-0" />
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {actionLabels[app.next_step!].title}
                            </span>
                          </div>
                          {showAppProgram && (
                            <div className="text-2xs text-slate-500 mt-0.5 truncate">{app.program_name}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link to={app.redirect_url!} className="btn btn-sm btn-primary">
                            {actionLabels[app.next_step!].button}
                          </Link>
                        </div>
                      </li>
                    ))}

                    {upcomingEvents.map((item) => {
                      const start = new Date(item.start);
                      const isLive =
                        item.kind === 'session' && item.end && start.getTime() <= nowMs && new Date(item.end).getTime() >= nowMs;
                      const metaLine = [
                        showEventProgram ? item.programName : '',
                        item.kind === 'assignment' ? 'Assignment deadline' : item.subtitle || '',
                      ]
                        .filter(Boolean)
                        .join(' · ');
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
                                    item.end
                                      ? ` – ${new Date(item.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
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
                            {metaLine && <div className="text-2xs text-slate-500 mt-0.5 truncate">{metaLine}</div>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.kind === 'session' && item.meetingUrl && (
                              <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Join Call</span>
                              </a>
                            )}
                            {item.href && (
                              <Link to={item.href} className="btn btn-sm btn-primary">
                                {item.kind === 'session' ? 'Open Workspace' : 'View Assignment'}
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}

                    {waitingItems.map((app) => (
                      <li key={`waiting-${app.applicant_id}`} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                        {/* The title already says the state; keep the column only for alignment */}
                        <div className="hidden sm:block sm:w-36 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {app.next_step === 'pending_room_invite'
                                ? 'Accepted: your Program Room invitation is on its way'
                                : 'Your application is being reviewed'}
                            </span>
                          </div>
                          {showAppProgram && (
                            <div className="text-2xs text-slate-500 mt-0.5 truncate">{app.program_name}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CALENDAR */}
          {/* ========================================================================= */}
          {activeTab === 'calendar' &&
            (schedulePrograms.length === 0 ? (
              <div className="content-card p-12 text-center space-y-2">
                <CalendarDays className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">
                  Your schedule appears here once you join a program&apos;s Program Room.
                </p>
              </div>
            ) : isLoadingSchedule ? (
              <div className="content-card p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading your schedule…</span>
              </div>
            ) : (
              <ScheduleCalendar events={scheduleEvents} />
            ))}

          {/* ========================================================================= */}
          {/* TAB 1: MY APPLICATIONS */}
          {/* ========================================================================= */}
          {activeTab === 'applications' && (
            <div className="space-y-6">
              {isLoading ? (
                <div className="content-card p-12 text-center">
                  <div className="w-10 h-10 border-4 border-kulkul-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm text-slate-500 font-medium">Loading your applications...</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="content-card p-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h3 className="section-title">No applications found</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    We didn't find any fellowship applications associated with <span className="font-semibold text-slate-700">{authUser?.email}</span>. Please use the application link shared by the company to apply.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {applications.map((app) => (
                    <div
                      key={app.applicant_id}
                      className="content-card hover:shadow-md transition"
                    >
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0 font-bold text-lg shadow-2xs">
                            {app.org_logo_url ? (
                              <img
                                src={resolveMediaUrl(app.org_logo_url)}
                                alt={app.org_name}
                                className="w-8 h-8 rounded-xl object-contain bg-white"
                              />
                            ) : (
                              <Building2 className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="section-title">{app.program_name}</h3>
                              {app.track_name && (
                                <span className="inline-flex items-center text-xs font-bold text-kulkul-purple">
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
                          {/* Case 1: Needs to complete profile form */}
                          {app.next_step === 'fill_form' && (
                            <button
                              onClick={() => {
                                if (app.redirect_url) {
                                  navigate(app.redirect_url);
                                } else {
                                  navigate(`/programs/${app.org_slug}/${app.program_slug}/apply`);
                                }
                              }}
                              className="w-full lg:w-auto btn btn-sm btn-primary"
                            >
                              <FileText className="w-3.5 h-3.5 text-kulkul-orange" />
                              <span>Complete Profile Form</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Case 2: Needs to take MCQ test */}
                          {(app.next_step === 'mcq_test' || (!app.next_step && app.test_token && (app.current_stage === 'applied' || app.current_stage === 'test_in_progress'))) && (
                            <button
                              onClick={() => {
                                if (app.test_token) {
                                  navigate(`/test/${app.test_token}`);
                                } else if (app.redirect_url) {
                                  navigate(app.redirect_url);
                                } else {
                                  navigate(`/programs/${app.org_slug}/${app.program_slug}/apply`);
                                }
                              }}
                              className="w-full lg:w-auto btn btn-sm btn-primary"
                            >
                              <span>Take Timed Test</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Case 3: Needs to take AI interview */}
                          {app.interview_token && (app.next_step === 'ai_interview' || app.current_stage === 'ai_interview_invited') && (
                            <button
                              onClick={() => navigate(`/interview/${app.interview_token}`)}
                              className="w-full lg:w-auto btn btn-sm btn-primary animate-pulse"
                            >
                              <Terminal className="w-3.5 h-3.5 text-kulkul-orange" />
                              <span>Join AI Interview Room</span>
                            </button>
                          )}

                          {/* Case 4: Approved for Live Cohort / Program Room */}
                          {app.current_stage === 'approved_for_live' && (
                            app.program_room_invited_at ? (
                              <button
                                onClick={() => {
                                  if (app.redirect_url) {
                                    navigate(app.redirect_url);
                                  } else {
                                    navigate(`/programs/${app.org_slug}/${app.program_slug}/room`);
                                  }
                                }}
                                className="w-full lg:w-auto btn btn-sm btn-primary"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Enter Program Room</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Accepted &bull; Program Room Access Pending</span>
                              </div>
                            )
                          )}
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
              {mcqApps.length === 0 ? (
                <div className="content-card p-12 text-center">
                  <p className="text-sm text-slate-500">No Logic MCQ tests yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {mcqApps.map((app) => (
                    <div key={app.applicant_id} className="content-card space-y-4">
                      <div className="flex items-center justify-between">
                        {app.track_name ? (
                          <span className="text-xs font-bold text-kulkul-purple">
                            {app.track_name}
                          </span>
                        ) : <span />}
                        {getStageBadge(app.current_stage, app.test_passed)}
                      </div>

                      <div>
                        <h3 className="section-title">{app.program_name}</h3>
                      </div>

                      <div className="panel-muted p-4 sm:p-4 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-semibold">Your Score:</span>
                        <span className={`text-base font-extrabold ${app.test_passed ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {app.test_status === 'completed' ? `${app.test_score}%` : 'Not Completed'}
                        </span>
                      </div>

                      {app.test_token && (
                        <button
                          onClick={() => navigate(app.test_status === 'completed' ? `/result/${app.test_token}` : `/test/${app.test_token}`)}
                          className="w-full btn btn-sm btn-primary"
                        >
                          <span>{app.test_status === 'completed' ? 'View Itemized Scorecard' : 'Start Logic Assessment'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: AI TECHNICAL SCREENING */}
          {/* ========================================================================= */}
          {activeTab === 'ai_interview' && (
            <div className="space-y-6">
              {interviewApps.length === 0 ? (
                <div className="content-card p-12 text-center">
                  <p className="text-sm text-slate-500">No AI interviews yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {interviewApps.map((app) => (
                    <div key={app.applicant_id} className="content-card space-y-4">
                      <div className="flex items-center justify-between">
                        {app.track_name ? (
                          <span className="text-xs font-bold text-kulkul-purple">
                            {app.track_name}
                          </span>
                        ) : <span />}
                        {app.interview_status === 'completed' ? (
                          <span className="text-2xs font-bold text-emerald-700">
                            Interview Completed
                          </span>
                        ) : app.interview_token ? (
                          <span className="text-2xs font-bold text-amber-700 animate-pulse">
                            Invite Ready
                          </span>
                        ) : (
                          <span className="text-2xs font-bold text-slate-500">
                            Pending MCQ Clearance
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="section-title">{app.program_name}</h3>
                        <p className="section-subtitle">Conversational AI Technical Evaluation Session</p>
                      </div>

                      <div className="panel-muted p-4 sm:p-4 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-semibold">AI Evaluation Score:</span>
                        <span className="text-base font-extrabold text-kulkul-purple">
                          {app.interview_status === 'completed' ? `${app.interview_score}/100` : 'Pending'}
                        </span>
                      </div>

                      {app.interview_token && (
                        <div className="space-y-1.5">
                          <button
                            onClick={() => navigate(`/interview/${app.interview_token}`)}
                            className="w-full btn btn-sm btn-primary"
                          >
                            <Terminal className="w-3.5 h-3.5 text-kulkul-orange" />
                            <span>{app.interview_status === 'completed' ? 'Review AI Transcript' : 'Enter AI Interview Room'}</span>
                          </button>
                          {app.interview_status !== 'completed' && (
                            <p className="meta-text text-center">
                              Laptop/Desktop &amp; Chrome/Edge recommended
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: CREDENTIALS & OPEN BADGES */}
          {/* ========================================================================= */}
          {activeTab === 'credentials' && (
            <div className="space-y-6">
              {/* Certificate Section */}
              <div className="space-y-4">
                <h3 className="section-title flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Official Certificate of Completion</span>
                </h3>

                {credentialsData?.certificate ? (
                  <div className="content-card hover:shadow-md transition">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
                          <Award className="w-8 h-8 text-amber-600" />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-mono">
                            ID: {credentialsData.certificate.certificate_number}
                          </div>
                          <h4 className="section-title mt-1">
                            {credentialsData.certificate.title || 'Certificate of Completion'}
                          </h4>
                          <p className="text-body mt-1">{credentialsData.certificate.program_name}</p>
                          <div className="meta-text mt-2">
                            Issued on {new Date(credentialsData.certificate.issue_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto shrink-0">
                        <Link
                          to={`/verify/certificate/${credentialsData.certificate.certificate_number}`}
                          className="btn btn-sm btn-primary flex-1 sm:flex-none"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>View Certificate</span>
                        </Link>
                        {credentialsData.certificate.linked_in_url && (
                          <a
                            href={credentialsData.certificate.linked_in_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline flex-1 sm:flex-none"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Add to LinkedIn</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="panel-muted border-dashed border-slate-300 p-8 sm:p-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-500 mx-auto flex items-center justify-center mb-3">
                      <Award className="w-6 h-6" />
                    </div>
                    <h4 className="card-title">Certificate In Progress</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      Your official Certificate of Completion will be generated automatically upon graduating and completing your fellowship program benchmarks.
                    </p>
                  </div>
                )}
              </div>

              {/* Open Badges Section */}
              <div className="space-y-4">
                <h3 className="section-title flex items-center gap-2">
                  <Award className="w-4 h-4 text-kulkul-purple" />
                  <span>Badges</span>
                </h3>

                {credentialsData?.badges && credentialsData.badges.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {credentialsData.badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="content-card hover:shadow-md transition flex flex-col justify-between"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-20 h-20 bg-purple-50/70 border border-purple-100 rounded-2xl p-2 flex items-center justify-center shrink-0 shadow-2xs">
                            <img src={badge.image_url} alt={badge.name} className="w-full h-full object-contain filter drop-shadow-sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`inline-block mb-1 text-2xs font-bold uppercase tracking-wider ${
                              badge.badge_type === 'member'
                                ? 'text-kulkul-purple'
                                : 'text-amber-700'
                            }`}>
                              {badge.badge_type === 'member' ? 'Cohort Member' : 'Program Graduate'}
                            </span>
                            <h4 className="card-title truncate">{badge.name}</h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                              {badge.description}
                            </p>
                            <div className="meta-text mt-2">
                              Awarded {new Date(badge.issued_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <Link
                            to={`/verify/badge/${badge.id}`}
                            className="btn btn-sm btn-ghost"
                          >
                            <span>Verify Badge</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          {badge.credential_url && !badge.revoked_at && (
                            <div className="flex flex-wrap items-center gap-2">
                              <AddBadgeToWallet credentialUrl={badge.credential_url} badgeName={badge.name} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="panel-muted border-dashed border-slate-300 p-8 sm:p-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 text-kulkul-purple mx-auto flex items-center justify-center mb-3">
                      <Award className="w-6 h-6" />
                    </div>
                    <h4 className="card-title">No Badges Awarded Yet</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      You will earn your <strong>Cohort Member Badge</strong> upon formal acceptance into a fellowship cohort, and your <strong>Program Graduate Badge</strong> upon completion!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
    </DashboardLayout>
  );
};
