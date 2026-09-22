import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { authService } from '@/services/authService';
import toast from 'react-hot-toast';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      await authService.forgotPassword(cleanEmail);
      setSubmittedEmail(cleanEmail);
      setSubmitted(true);
      toast.success('Password reset instructions sent!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar hideAdminButton />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
            {!submitted ? (
              <>
                <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-2 shadow-inner">
                  <Mail className="w-7 h-7 text-primary" />
                </div>

                <div>
                  <h1 className="heading-page">Forgot Password?</h1>
                  <p className="text-body-sm mt-2 text-slate-600">
                    Enter the email address associated with your account, and we'll send you a link to reset your password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-left pt-2">
                  <div>
                    <label className="form-label">Email Address</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 input-md"
                        autoFocus
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 group shadow-lg shadow-primary/20 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Instructions...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-semibold text-slate-500">
                  <Link
                    to="/admin/login"
                    className="flex items-center gap-1.5 hover:text-primary transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Company Sign In</span>
                  </Link>
                  <span className="hidden sm:inline text-slate-300">•</span>
                  <Link
                    to="/candidate/dashboard"
                    className="hover:text-primary transition"
                  >
                    <span>Candidate Portal</span>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-2 border border-emerald-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>

                <div className="space-y-2">
                  <h1 className="heading-page text-slate-900">Check Your Inbox</h1>
                  <p className="text-body-sm text-slate-600 leading-relaxed">
                    If an account exists for <strong className="text-slate-900">{submittedEmail}</strong>, you will receive an email with password reset instructions shortly.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left text-xs text-slate-600 space-y-1.5">
                  <div className="font-bold text-slate-800">What to do next:</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-500">
                    <li>Click the link in the email within <strong>1 hour</strong>.</li>
                    <li>If you don't see it, check your spam or promotional folder.</li>
                    <li>Need another link? You can request one below.</li>
                  </ul>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail('');
                    }}
                    className="w-full btn-outline py-2.5 text-xs font-semibold text-slate-700"
                  >
                    Try another email address
                  </button>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-4 text-xs font-semibold text-slate-500">
                    <Link
                      to="/admin/login"
                      className="flex items-center gap-1.5 hover:text-primary transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Sign In</span>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
