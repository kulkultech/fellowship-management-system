import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  Laptop,
  Mail,
  Lock,
  User,
  CheckCircle2,
  RefreshCw,
  Sparkles,
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
  candidate_flow?: string[];
  form_submitted?: boolean;
  next_step?: string;
  redirect_url?: string;
}

export const CandidateDashboardPage: React.FC = () => {
  const { user: authUser, logout: authLogout, login } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'applications' | 'assessments' | 'ai_interview'>('applications');

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
      case 'accepted':
        return <span className="whitespace-nowrap text-xs font-semibold text-emerald-700">Accepted 🎉</span>;
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
              <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6 animate-in fade-in">
                <div className="w-16 h-16 mx-auto rounded-full bg-purple-100 flex items-center justify-center text-kulkul-purple">
                  <Mail className="w-8 h-8" />
                </div>

                <div>
                  <h1 className="heading-page">Check Your Email</h1>
                  <p className="text-body-sm mt-2 text-slate-600">
                    We sent an account activation link to:
                  </p>
                  <p className="font-bold text-slate-900 mt-1 break-all">
                    {activationPendingEmail}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 text-left space-y-2">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                    <span>Click the activation link in your email to verify your account and start tracking your applications.</span>
                  </div>
                  <div className="text-2xs text-slate-400">
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
                    className="w-full btn btn-md btn-outline gap-2"
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
                    className="text-xs font-bold text-kulkul-purple hover:underline"
                  >
                    &larr; Return to Sign In
                  </button>
                </div>
              </div>
            ) : (
              /* Main Auth Card */
              <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
                <div>
                  <h1 className="heading-page">Candidate Portal</h1>
                  <p className="text-body-sm mt-2">
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
                          className="w-full btn btn-lg btn-outline gap-3 text-slate-800"
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
                    ) : (
                      <form onSubmit={handlePasswordSignIn} className="space-y-4 text-left pt-1">
                        <div>
                          <label className="form-label">Email Address</label>
                          <div className="relative">
                            <input
                              type="email"
                              required
                              placeholder="e.g. candidate@example.com"
                              value={formEmail}
                              onChange={(e) => setFormEmail(e.target.value)}
                              className="w-full pl-10 pr-4 input-md"
                            />
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="form-label mb-0">Password</label>
                            <Link
                              to="/forgot-password"
                              className="text-xs font-semibold text-primary hover:text-primary-dark hover:underline transition"
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
                              className="w-full pl-10 pr-4 input-md"
                            />
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
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
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl transition disabled:opacity-60"
                              >
                                <RefreshCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                                <span>{isResending ? 'Resending...' : 'Resend Activation Email'}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full btn btn-lg btn-primary"
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
                      className="w-full btn btn-lg btn-outline gap-3 text-slate-800"
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
                      <span>Fast Sign Up with Google</span>
                    </button>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-3 text-2xs font-bold text-slate-400 uppercase tracking-wider">
                        Or register with email
                      </span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <form onSubmit={handleRegisterCandidate} className="space-y-4 text-left">
                      <div>
                        <label className="form-label">Full Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Jane Doe"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="w-full pl-10 pr-4 input-md"
                          />
                          <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        </div>
                      </div>

                      <div>
                        <label className="form-label">Email Address</label>
                        <div className="relative">
                          <input
                            type="email"
                            required
                            placeholder="e.g. jane.doe@example.com"
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                            className="w-full pl-10 pr-4 input-md"
                          />
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        </div>
                      </div>

                      <div>
                        <label className="form-label">Create Password</label>
                        <div className="relative">
                          <input
                            type="password"
                            required
                            placeholder="At least 8 characters"
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                            className="w-full pl-10 pr-4 input-md"
                          />
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
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
                        className="w-full btn btn-lg btn-primary"
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
  ];

  return (
    <DashboardLayout
      portalType="candidate"
      title={`Welcome back, ${candidateName}!`}
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
                <h4 className="text-sm font-bold text-slate-900">
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
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    We didn't find any fellowship applications associated with <span className="font-semibold text-slate-700">{authUser?.email}</span>. Please use the application link shared by the company to apply.
                  </p>
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
                              <h3 className="text-xl font-bold text-slate-900">{app.program_name}</h3>
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
                              className="w-full lg:w-auto btn btn-md btn-primary"
                            >
                              <FileText className="w-4 h-4 text-kulkul-orange" />
                              <span>Complete Profile Form</span>
                              <ArrowRight className="w-4 h-4" />
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
                              className="w-full lg:w-auto btn btn-md btn-secondary"
                            >
                              <span>Take Timed Test</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}

                          {/* Case 3: Needs to take AI interview */}
                          {app.interview_token && (app.next_step === 'ai_interview' || app.current_stage === 'ai_interview_invited') && (
                            <div className="flex flex-col sm:items-end gap-1.5 w-full lg:w-auto">
                              <button
                                onClick={() => navigate(`/interview/${app.interview_token}`)}
                                className="w-full lg:w-auto btn btn-md btn-primary animate-pulse"
                              >
                                <Terminal className="w-4 h-4 text-kulkul-orange" />
                                <span>Join AI Interview Room</span>
                              </button>
                              <span className="text-3xs text-slate-500 font-medium flex items-center gap-1">
                                <Laptop className="w-3 h-3 text-kulkul-purple" />
                                <span>Laptop/Desktop &amp; Chrome/Edge required</span>
                              </span>
                            </div>
                          )}

                          {/* Case 4: View Scorecard (when test is completed and not pending form completion) */}
                          {app.test_token && (app.current_stage === 'test_completed' || app.current_stage === 'test_failed') && app.next_step !== 'fill_form' && (
                            <button
                              onClick={() => navigate(`/result/${app.test_token}`)}
                              className="w-full lg:w-auto btn btn-md btn-outline text-kulkul-purple border-kulkul-purple/20"
                            >
                              <span>View Scorecard</span>
                              <ExternalLink className="w-4 h-4" />
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
                      <span className="text-xs font-bold text-kulkul-purple">
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
                        onClick={() => navigate(app.test_status === 'completed' ? `/result/${app.test_token}` : `/test/${app.test_token}`)}
                        className="w-full btn btn-md btn-primary"
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
                      <span className="text-xs font-bold text-kulkul-purple">
                        {app.track_name || 'AI Screen'}
                      </span>
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
                      <div className="space-y-1.5">
                        <button
                          onClick={() => navigate(`/interview/${app.interview_token}`)}
                          className="w-full btn btn-md btn-primary"
                        >
                          <Terminal className="w-3.5 h-3.5 text-kulkul-orange" />
                          <span>{app.interview_status === 'completed' ? 'Review AI Transcript' : 'Enter AI Interview Room'}</span>
                        </button>
                        {app.interview_status !== 'completed' && (
                          <p className="text-3xs text-slate-500 text-center font-medium">
                            Laptop/Desktop &amp; Chrome/Edge recommended
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: EXPLORE PROGRAMS */}
          {/* ========================================================================= */}
        </div>
    </DashboardLayout>
  );
};
