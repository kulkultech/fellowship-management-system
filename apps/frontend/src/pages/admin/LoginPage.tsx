import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/authService';
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export const LoginPage: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, isLoggingIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authTab, setAuthTab] = useState<'google' | 'password'>('google');
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === 'superadmin') {
        navigate('/superadmin/dashboard', { replace: true });
      } else if (user.role === 'candidate') {
        navigate('/candidate/dashboard', { replace: true });
      } else if (user.role === 'org_admin' || user.role === 'reviewer') {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    window.location.href = `${apiBase}/auth/oauth/google?return_to=/admin/dashboard`;
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter your email and password');
      return;
    }
    setUnverifiedEmail(null);
    setResendSuccess(false);

    try {
      const res = await login({ email: email.trim().toLowerCase(), password });
      toast.success('Welcome back!');
      if (res.user?.role === 'superadmin') {
        navigate('/superadmin/dashboard', { replace: true });
      } else if (res.user?.role === 'candidate') {
        navigate('/candidate/dashboard', { replace: true });
      } else {
        navigate('/admin/dashboard', { replace: true });
      }
    } catch (err: any) {
      if (err?.response?.data?.requires_activation) {
        setUnverifiedEmail(err.response.data.email || email.trim().toLowerCase());
        toast.error('Account not activated yet. Please verify your email.');
      } else {
        toast.error(err?.response?.data?.error || 'Invalid email or password');
      }
    }
  };

  const handleResendActivation = async () => {
    if (!unverifiedEmail) return;
    setIsResending(true);
    try {
      await authService.resendActivation(unverifiedEmail);
      setResendSuccess(true);
      toast.success('Activation link sent! Check your inbox.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to resend activation link');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar hideAdminButton />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          {/* Main Card */}
          <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
            <div>
              <h1 className="heading-page">
                Company Portal
              </h1>
              <p className="text-body-sm mt-1.5">
                Sign in to manage your fellowship programs, question banks, and candidate scorecards.
              </p>
            </div>

            {/* Login Method Tabs */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setAuthTab('google')}
                className={`py-2 px-3 rounded-xl transition ${
                  authTab === 'google'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
              >
                Google OAuth
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('password')}
                className={`py-2 px-3 rounded-xl transition ${
                  authTab === 'password'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'hover:text-slate-900 text-slate-500'
                }`}
              >
                Email &amp; Password
              </button>
            </div>

            {authTab === 'google' ? (
              /* Google OAuth Action */
              <div className="space-y-4 pt-1">
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
                <p className="text-caption">
                  Instant corporate authentication for company administrators
                </p>
              </div>
            ) : (
              /* Email & Password Form */
              <form onSubmit={handlePasswordLogin} className="space-y-4 text-left pt-1">
                <div>
                  <label className="form-label">
                    Admin Work Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="e.g. admin@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 input-md"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="form-label">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="Your admin password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                        <span className="font-bold">Account activation required:</span> An activation link was sent to <strong className="text-amber-900">{unverifiedEmail}</strong>. Please check your inbox or spam folder.
                      </div>
                    </div>
                    {resendSuccess ? (
                      <div className="flex items-center gap-1.5 text-2xs text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Activation link has been resent!</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendActivation}
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
                  disabled={isLoggingIn}
                  className="w-full btn btn-lg btn-primary"
                >
                  {isLoggingIn ? (
                    <span>Signing in...</span>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Footer Links inside Card */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 text-center">
              <div>
                <span className="text-xs text-slate-500">Need an organization workspace? </span>
                <Link to="/register-company" className="text-xs font-bold text-kulkul-purple hover:underline">
                  Register Company
                </Link>
              </div>

              <div>
                <Link to="/candidate/dashboard" className="text-2xs text-slate-400 hover:text-slate-600">
                  Are you an applicant? Access Candidate Portal &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
