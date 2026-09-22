import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { authService } from '@/services/authService';
import toast from 'react-hot-toast';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(Boolean(tokenParam));
  const [verifyError, setVerifyError] = useState('');
  const [accountEmail, setAccountEmail] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (!tokenParam) {
      setVerifyError('No password reset token was provided. Please request a new password reset link.');
      setVerifying(false);
      return;
    }

    let isMounted = true;
    const verifyToken = async () => {
      try {
        setVerifying(true);
        setVerifyError('');
        const res = await authService.verifyResetToken(tokenParam);
        if (isMounted) {
          if (res.email) {
            setAccountEmail(res.email);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setVerifyError(
            err?.response?.data?.error ||
              'This password reset link is invalid or has expired. Please request a new one.'
          );
        }
      } finally {
        if (isMounted) {
          setVerifying(false);
        }
      }
    };

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, [tokenParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setSubmitting(true);
      await authService.resetPassword(tokenParam, newPassword);
      setResetSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar hideAdminButton />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
            {verifying ? (
              <div className="py-12 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                <div className="text-body-sm text-slate-600 font-medium">
                  Validating reset link...
                </div>
              </div>
            ) : verifyError ? (
              <div className="space-y-6">
                <div className="mx-auto w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mb-2 border border-rose-100">
                  <AlertCircle className="w-8 h-8 text-rose-600" />
                </div>

                <div className="space-y-2">
                  <h1 className="heading-page text-slate-900">Reset Link Expired</h1>
                  <p className="text-body-sm text-slate-600 leading-relaxed">
                    {verifyError}
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Link
                    to="/forgot-password"
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2"
                  >
                    <span>Request New Reset Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    to="/admin/login"
                    className="w-full btn-outline py-2.5 text-xs font-semibold text-slate-700 block"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            ) : resetSuccess ? (
              <div className="space-y-6">
                <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-2 border border-emerald-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>

                <div className="space-y-2">
                  <h1 className="heading-page text-slate-900">Password Reset!</h1>
                  <p className="text-body-sm text-slate-600 leading-relaxed">
                    Your password has been successfully updated. You can now use your new password to sign in.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/admin/login')}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    <span>Proceed to Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <Link
                    to="/candidate/dashboard"
                    className="w-full btn-outline py-2.5 text-xs font-semibold text-slate-700 block"
                  >
                    Candidate Dashboard Sign In
                  </Link>
                </div>
              </div>
            ) : (
              /* Password Reset Form */
              <div className="space-y-6">
                <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-2 shadow-inner">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>

                <div>
                  <h1 className="heading-page">Set New Password</h1>
                  <p className="text-body-sm mt-2 text-slate-600">
                    {accountEmail ? (
                      <>
                        Resetting password for <strong className="text-slate-900">{accountEmail}</strong>.
                      </>
                    ) : (
                      'Choose a strong password with at least 8 characters.'
                    )}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-left pt-1">
                  <div>
                    <label className="form-label">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-10 pr-10 input-md"
                        autoFocus
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="Re-enter your new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-10 input-md"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {newPassword && (
                    <div className="text-xs space-y-1 text-left px-1">
                      <div
                        className={`flex items-center gap-1.5 font-medium ${
                          newPassword.length >= 8 ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        <span>Minimum 8 characters</span>
                      </div>
                      {confirmPassword && (
                        <div
                          className={`flex items-center gap-1.5 font-medium ${
                            newPassword === confirmPassword ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || newPassword.length < 8 || newPassword !== confirmPassword}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 group shadow-lg shadow-primary/20 disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500">
                  <Link
                    to="/admin/login"
                    className="flex items-center gap-1.5 hover:text-primary transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Sign In</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
