import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Mail,
  ArrowRight,
  Loader2,
  Building2,
  User,
  Clock,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/hooks/useAuthStore';
import toast from 'react-hot-toast';

export const AccountActivationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  const [loading, setLoading] = useState(Boolean(tokenParam));
  const [error, setError] = useState('');
  const [activatedUser, setActivatedUser] = useState<any>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!tokenParam) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const activate = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await authService.activateAccount(tokenParam);
        if (isMounted) {
          if (res.user) {
            setUser(res.user);
            setActivatedUser(res.user);
            if (res.requires_approval || res.user?.organization?.status === 'pending_approval') {
              setIsPendingApproval(true);
            }
          }
          await queryClient.invalidateQueries({ queryKey: ['auth'] });
          if (res.requires_approval || res.user?.organization?.status === 'pending_approval') {
            toast.success('Email verified! Company application awaiting approval.');
          } else {
            toast.success('Account activated successfully!');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err?.response?.data?.error ||
              'This activation link is invalid or has expired. Please request a new activation email below.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    activate();
    return () => {
      isMounted = false;
    };
  }, [tokenParam, queryClient, setUser]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    try {
      setResendLoading(true);
      await authService.resendActivation(resendEmail.trim().toLowerCase());
      setResendSuccess(true);
      toast.success('Activation email sent! Please check your inbox.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to resend activation email.');
    } finally {
      setResendLoading(false);
    }
  };

  const getDashboardPath = (role?: string) => {
    if (role === 'superadmin') return '/superadmin/dashboard';
    if (role === 'org_admin' || role === 'reviewer') return '/admin/dashboard';
    return '/candidate/dashboard';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          {loading ? (
            /* Loading State */
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6 animate-pulse">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 text-kulkul-purple flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
              </div>
              <div>
                <h2 className="heading-card">Activating Your Account</h2>
                <p className="text-body-sm mt-2">
                  Verifying your security credentials and initializing your platform access...
                </p>
              </div>
            </div>
          ) : isPendingApproval && activatedUser ? (
            /* Pending Approval State */
            <div className="stitch-card bg-white p-8 sm:p-10 border border-amber-200 shadow-xl rounded-3xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
                <Clock className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Email Verified &middot; Awaiting Approval
                </span>
                <h1 className="text-2xl font-black text-slate-900 mt-3">
                  Email Confirmed!
                </h1>
                <p className="text-body-sm mt-2 text-slate-600">
                  Hello <strong className="text-slate-900">{activatedUser.name || activatedUser.email}</strong>, your email has been confirmed. Your company application for <strong>{activatedUser.organization?.name || 'your company'}</strong> is pending approval by the platform administrator.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Company Status:</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>Pending Superadmin Approval</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Verified Email:</span>
                  <span className="font-mono text-slate-700">{activatedUser.email}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                You will receive an email notification as soon as the administrator approves your company. Once approved, you can log in to your dashboard.
              </p>

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  className="w-full btn btn-lg btn-outline"
                >
                  Go to Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="w-full btn btn-md btn-ghost text-slate-600"
                >
                  Return to Homepage
                </button>
              </div>
            </div>
          ) : activatedUser ? (
            /* Success State */
            <div className="stitch-card bg-white p-8 sm:p-10 border border-emerald-200 shadow-xl rounded-3xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  Email Verified &middot; Account Active
                </span>
                <h1 className="text-2xl font-black text-slate-900 mt-3">
                  Welcome to FellowHire!
                </h1>
                <p className="text-body-sm mt-2 text-slate-600">
                  Hello <strong className="text-slate-900">{activatedUser.name || activatedUser.email}</strong>, your email has been confirmed. Your account is now fully active.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Account Role:</span>
                  <span className="font-bold text-slate-900 capitalize flex items-center gap-1.5">
                    {activatedUser.role === 'candidate' ? (
                      <User className="w-3.5 h-3.5 text-kulkul-orange" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5 text-kulkul-purple" />
                    )}
                    {activatedUser.role === 'candidate' ? 'Fellowship Candidate' : 'Company Administrator'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Verified Email:</span>
                  <span className="font-mono text-slate-700">{activatedUser.email}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(getDashboardPath(activatedUser.role))}
                className="w-full btn btn-lg btn-primary shadow-lg hover:shadow-xl gap-2"
              >
                <span>Go to {activatedUser.role === 'candidate' ? 'Candidate Portal' : 'Admin Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : error ? (
            /* Error / Expired State */
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>

              <div>
                <h1 className="heading-page text-xl text-rose-700">
                  Activation Link Expired
                </h1>
                <p className="text-body-sm mt-2 text-slate-600">
                  {error}
                </p>
              </div>

              {resendSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  A fresh activation link has been sent to <strong>{resendEmail}</strong>. Please check your inbox or spam folder.
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-4 text-left pt-1">
                  <div>
                    <label className="form-label">
                      Resend Activation Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="e.g. jane@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        className="w-full pl-10 pr-4 input-md"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full btn btn-md btn-secondary"
                  >
                    {resendLoading ? 'Sending Link...' : 'Send New Activation Link'}
                  </button>
                </form>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-center gap-4 text-xs font-semibold">
                <Link to="/admin/login" className="text-kulkul-purple hover:underline">
                  Company Sign In
                </Link>
                <span className="text-slate-300">&bull;</span>
                <Link to="/candidate/dashboard" className="text-kulkul-orange hover:underline">
                  Candidate Portal
                </Link>
              </div>
            </div>
          ) : (
            /* No Token Provided - Prompt for Email Resend */
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 text-kulkul-purple flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8" />
              </div>

              <div>
                <h1 className="heading-page">
                  Account Activation
                </h1>
                <p className="text-body-sm mt-2">
                  Enter your email address below to receive a new activation link for your FellowHire account.
                </p>
              </div>

              {resendSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  A fresh activation link has been sent to <strong>{resendEmail}</strong>. Please check your inbox.
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-4 text-left">
                  <div>
                    <label className="form-label">
                      Your Registered Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="e.g. user@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        className="w-full pl-10 pr-4 input-md"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full btn btn-lg btn-primary"
                  >
                    {resendLoading ? 'Sending...' : 'Send Activation Email'}
                  </button>
                </form>
              )}

              <div className="pt-2 border-t border-slate-100 text-center">
                <Link to="/candidate/dashboard" className="text-xs font-bold text-kulkul-purple hover:underline">
                  &larr; Back to Candidate Portal
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
