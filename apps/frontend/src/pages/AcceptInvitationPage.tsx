import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Lock,
  ArrowRight,
  Loader2,
  UserCheck,
  AlertCircle,
  LogOut,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { InvitationDetails } from '@/services/types';
import toast from 'react-hot-toast';

export const AcceptInvitationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser, setUser, logout: clearAuth } = useAuthStore();

  const [loading, setLoading] = useState(Boolean(tokenParam));
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('/admin/dashboard');

  useEffect(() => {
    if (!tokenParam) {
      setError('Missing invitation token. Please check the link in your invitation email.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchInvitation = async () => {
      try {
        setLoading(true);
        setError('');
        const details = await authService.getInvitation(tokenParam);
        if (isMounted) {
          setInvitation(details);
          if (details.role === 'superadmin') {
            setRedirectUrl('/superadmin/dashboard');
          } else {
            setRedirectUrl('/admin/dashboard');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err?.response?.data?.error ||
              'This invitation link is invalid, has already been accepted, or has expired.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInvitation();
    return () => {
      isMounted = false;
    };
  }, [tokenParam]);

  // Handle Google OAuth
  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const returnTo = `/invite/accept?token=${encodeURIComponent(tokenParam)}`;
    window.location.href = `${apiBase}/auth/oauth/google?return_to=${encodeURIComponent(returnTo)}`;
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    // Validation for new users
    if (!invitation.is_existing_user) {
      if (!fullName.trim()) {
        toast.error('Please enter your full name');
        return;
      }
      if (!password || password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const res = await authService.acceptInvitation(tokenParam, {
        name: fullName.trim() || undefined,
        password: password || undefined,
      });

      if (res.user) {
        setUser(res.user);
      }
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      setIsAccepted(true);
      if (res.redirect_url) {
        setRedirectUrl(res.redirect_url);
      }
      toast.success(res.message || 'Invitation accepted successfully!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to accept invitation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRoleName = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'Platform Superadmin';
      case 'org_admin':
        return 'Company Administrator';
      case 'reviewer':
        return 'Evaluator & Reviewer';
      default:
        return role;
    }
  };

  const isUserMatching =
    currentUser &&
    invitation &&
    currentUser.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar hideAdminButton />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-lg w-full">
          {/* Loading State */}
          {loading && (
            <div className="stitch-card bg-white p-12 border border-slate-200 shadow-xl rounded-3xl text-center space-y-4">
              <Loader2 className="w-12 h-12 text-kulkul-purple animate-spin mx-auto" />
              <h2 className="text-xl font-bold text-slate-800">Verifying Invitation...</h2>
              <p className="text-sm text-slate-500">Checking your invitation token securely.</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <XCircle className="w-9 h-9" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Invitation Unavailable
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  to="/admin/login"
                  className="w-full btn btn-primary py-3 rounded-xl font-bold shadow-md shadow-purple-900/10"
                >
                  Go to Login Page
                </Link>
                <Link
                  to="/"
                  className="w-full btn btn-outline py-2.5 rounded-xl font-medium text-slate-600"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          )}

          {/* Success State */}
          {!loading && !error && isAccepted && (
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Welcome Aboard!
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your invitation has been successfully accepted. You now have access as{' '}
                  <span className="font-bold text-slate-900">
                    {formatRoleName(invitation?.role || '')}
                  </span>
                  {invitation?.organization_name ? (
                    <>
                      {' '}
                      at <span className="font-bold text-slate-900">{invitation.organization_name}</span>
                    </>
                  ) : (
                    '.'
                  )}
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => navigate(redirectUrl, { replace: true })}
                  className="w-full btn btn-primary py-3.5 rounded-xl font-bold text-base shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"
                >
                  <span>Enter Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Active Invitation Acceptance Form */}
          {!loading && !error && !isAccepted && invitation && (
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl space-y-6">
              {/* Role Header */}
              <div className="text-center space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-kulkul-purple">
                  {formatRoleName(invitation.role)}
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {invitation.organization_name
                    ? `Join ${invitation.organization_name}`
                    : 'Join FellowHire Leadership'}
                </h1>

                <p className="text-sm text-slate-500">
                  {invitation.inviter_name || invitation.inviter_email
                    ? `${invitation.inviter_name || invitation.inviter_email} invited you to collaborate.`
                    : 'You have been invited to join the management team.'}
                </p>
              </div>

              {/* Invitation Summary Pill */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="text-slate-400 font-semibold uppercase text-3xs tracking-wider">
                    Invited Email Address
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{invitation.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold uppercase text-3xs tracking-wider">
                    Assigned Role
                  </div>
                  <div className="font-bold text-kulkul-purple mt-0.5 capitalize">
                    {formatRoleName(invitation.role)}
                  </div>
                </div>
              </div>

              {/* Already Logged In Check */}
              {currentUser && (
                <div>
                  {isUserMatching ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        Signed in as <span className="font-bold">{currentUser.email}</span>. Click
                        below to activate your new role immediately.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Different account detected</span>
                      </div>
                      <p>
                        You are currently logged in as <strong>{currentUser.email}</strong>, but
                        this invitation was sent to <strong>{invitation.email}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          await authService.logout();
                          clearAuth();
                          queryClient.clear();
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 underline hover:text-amber-700"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Log out to accept with {invitation.email}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Google OAuth Option */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full btn btn-outline py-3 rounded-xl border border-slate-300 hover:bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-3 shadow-xs transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Accept &amp; Continue with Google</span>
                </button>

                <div className="relative flex items-center justify-center">
                  <div className="border-t border-slate-200 w-full"></div>
                  <span className="bg-white px-3 text-2xs font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
                    {invitation.is_existing_user ? 'or use password' : 'or set password'}
                  </span>
                  <div className="border-t border-slate-200 w-full"></div>
                </div>
              </div>

              {/* Password Acceptance Form */}
              <form onSubmit={handleAccept} className="space-y-4">
                {!invitation.is_existing_user && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Alex Johnson"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                      required
                    />
                  </div>
                )}

                {invitation.is_existing_user && isUserMatching ? (
                  <p className="text-xs text-slate-500 italic">
                    No password required since you are currently authenticated with this account.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                        {invitation.is_existing_user ? 'Current Password' : 'Create Password'}
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                          required={!invitation.is_existing_user}
                        />
                      </div>
                      {!invitation.is_existing_user && (
                        <p className="text-3xs text-slate-400 mt-1">Minimum 6 characters.</p>
                      )}
                    </div>

                    {!invitation.is_existing_user && (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                            required
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn btn-primary py-3 rounded-xl font-bold text-sm shadow-md shadow-purple-900/10 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Accepting Invitation...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {invitation.is_existing_user ? 'Accept Invitation' : 'Create Account & Join'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
