import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ArrowRight,
  ShieldCheck,
  Upload,
  X,
  CheckCircle2,
  UserCheck,
  Mail,
  Lock,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../hooks/useAuthStore';
import { authService } from '../services/authService';
import { resolveMediaUrl } from '../services/apiClient';
import { uploadService } from '../services/uploadService';
import toast from 'react-hot-toast';

export const CompanyRegisterPage: React.FC = () => {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoURL, setLogoURL] = useState('');
  const [logoFileName, setLogoFileName] = useState('');

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isActivationSent, setIsActivationSent] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Resend activation state
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Prefill admin fields when Google auth is detected
  useEffect(() => {
    if (authUser?.email) {
      setAdminEmail(authUser.email);
      if (authUser.name && !adminName) {
        setAdminName(authUser.name);
      }
      if (!contactEmail) {
        setContactEmail(authUser.email);
      }
    }
  }, [authUser]);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setCompanyName(name);
    if (!companySlug || companySlug === companyName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      setCompanySlug(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Logo file size must be under 5MB');
      return;
    }

    setError('');
    setUploadingLogo(true);
    setLogoFileName(file.name);

    try {
      const res = await uploadService.uploadFile(file, 'logos');
      setLogoURL(res.url);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upload logo');
      setLogoURL('');
      setLogoFileName('');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoURL('');
    setLogoFileName('');
  };

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    window.location.href = `${apiBase}/auth/oauth/google?return_to=/register-company`;
  };

  const handleResendActivation = async () => {
    if (!adminEmail) return;
    try {
      setResending(true);
      await authService.resendActivation(adminEmail);
      setResendSuccess(true);
      toast.success('New activation email sent! Please check your inbox.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to resend activation email.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!companyName.trim() || !companySlug.trim()) {
      setError('Please provide company name and slug');
      return;
    }
    if (!adminEmail.trim() || !adminName.trim()) {
      setError('Please provide administrator account name and email');
      return;
    }

    if (!authUser?.email && (!adminPassword || adminPassword.length < 6)) {
      setError('Admin password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.registerCompany({
        company_name: companyName.trim(),
        company_slug: companySlug.trim().toLowerCase(),
        contact_email: contactEmail.trim().toLowerCase() || adminEmail.trim().toLowerCase(),
        logo_url: logoURL,
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
      });

      if (res?.requires_activation) {
        setIsActivationSent(true);
        toast.success('Registration submitted! Please verify your email.');
        return;
      }

      if (res?.user) {
        setUser(res.user);
      }
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Registration failed. Please check the inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Header Navigation */}
      <Navbar />

      {/* Main Registration Form Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {isActivationSent ? (
          /* ACTIVATION EMAIL SENT CONFIRMATION */
          <div className="stitch-card bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300 shadow-xl rounded-3xl border border-purple-200">
            <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 text-kulkul-purple flex items-center justify-center mx-auto shadow-2xs">
              <Mail className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-bold text-kulkul-purple uppercase tracking-wider">
                Activation Link Dispatched
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4">
                Verify Your Work Email
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-md mx-auto leading-relaxed">
                We've initialized the organization workspace for <strong>{companyName}</strong>. To protect platform integrity, an activation email has been sent to:
              </p>
              <div className="mt-3 font-mono font-bold text-slate-900">
                {adminEmail}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs sm:text-sm space-y-2.5 text-slate-600">
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Company Name:</span>
                <span className="font-bold text-slate-900">{companyName}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Public Slug:</span>
                <span className="font-mono text-kulkul-purple font-bold">{companySlug}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Administrator:</span>
                <span className="font-bold text-slate-900">{adminName}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Link Expiration:</span>
                <span className="text-amber-700 font-semibold">24 hours</span>
              </div>
            </div>

            {resendSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                ✓ A new activation link has been sent to your email.
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResendActivation}
                disabled={resending}
                className="w-full sm:w-auto btn btn-md btn-outline"
              >
                {resending ? 'Sending...' : 'Resend Activation Email'}
              </button>
              <Link
                to="/admin/login"
                className="w-full sm:w-auto btn btn-md btn-primary"
              >
                <span>Go to Admin Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : isSuccess ? (
          /* WORKSPACE READY CONFIRMATION (Pre-verified Google OAuth) */
          <div className="stitch-card bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300 shadow-xl rounded-3xl border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Workspace Active &middot; Ready to Launch
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4">
                Welcome to FellowHire, {companyName}!
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-md mx-auto leading-relaxed">
                Your company workspace is active. Your administrator account{' '}
                <span className="font-semibold text-slate-900">{adminEmail}</span> is authenticated and ready to launch fellowship programs.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs sm:text-sm space-y-2.5 text-slate-600">
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Company Name:</span>
                <span className="font-bold text-slate-900">{companyName}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Company Slug:</span>
                <span className="font-mono text-kulkul-purple font-bold">{companySlug}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Admin Account:</span>
                <span className="font-mono text-slate-900 font-bold">{adminEmail}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span className="text-slate-500">Role:</span>
                <span className="text-xs font-bold text-kulkul-purple">
                  Company Administrator (org_admin)
                </span>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/admin/dashboard"
                className="w-full sm:w-auto btn btn-lg btn-primary shadow-md hover:shadow-lg"
              >
                <span>Open Admin Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/"
                className="w-full sm:w-auto btn btn-lg btn-outline text-center"
              >
                Back to Homepage
              </Link>
            </div>
          </div>
        ) : (
          /* REGISTRATION FORM (Google OAuth or Email & Password) */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Headline */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              {authUser?.email ? (
                <div className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Google Verified: {authUser.email}</span>
                </div>
              ) : (
                <span className="text-xs font-bold text-kulkul-purple uppercase tracking-wider">
                  Organization Onboarding
                </span>
              )}

              <h1 className="heading-page">
                Register Your Company
              </h1>
              <p className="text-body">
                Set up your company workspace to host custom MCQ assessments, conversational AI technical interviews, and automated reviewer scorecards.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold text-center max-w-2xl mx-auto">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="stitch-card bg-white p-6 sm:p-10 space-y-8">
              {/* Section 1: Company Profile */}
              <div>
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-6">
                  <Building2 className="w-5 h-5 text-kulkul-purple" />
                  <h3 className="text-base font-bold text-slate-900">1. Company Profile</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Company / Organization Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acme AI Technologies"
                      value={companyName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Company Slug (URL Identifier) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. acme"
                        value={companySlug}
                        onChange={(e) => setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm font-mono"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1.5 block font-mono">
                      Public URL: /programs/{companySlug || 'your-company'}/:program_slug
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Contact / Support Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. talent@acme.ai"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Logo Upload */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
                  <div className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-kulkul-orange" />
                    <h3 className="text-base font-bold text-slate-900">2. Company Logo (Optional)</h3>
                  </div>
                  <span className="text-2xs text-slate-400 font-medium">PNG, JPG, SVG, or WebP (max. 5MB)</span>
                </div>

                <div>
                  {uploadingLogo ? (
                    <div className="p-8 rounded-2xl bg-purple-50/50 border border-purple-200 flex flex-col items-center justify-center gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-full border-2 border-kulkul-purple border-t-transparent animate-spin" />
                      <span className="text-xs font-bold text-kulkul-purple">Uploading logo...</span>
                    </div>
                  ) : logoURL ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={resolveMediaUrl(logoURL)}
                          alt="Logo preview"
                          className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 shadow-2xs p-1"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900">{logoFileName || 'Company Logo'}</div>
                          <span className="text-2xs font-semibold text-emerald-600">Uploaded</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-kulkul-purple rounded-2xl p-6 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition group">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-kulkul-purple group-hover:border-kulkul-purple/40 shadow-2xs mb-3 transition">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 group-hover:text-kulkul-purple transition">
                        Click to upload your company logo
                      </span>
                      <span className="text-xs text-slate-400 mt-1">SVG, PNG, JPG, or WebP up to 5MB</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/svg+xml, image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Section 3: Company Administrator Account */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-base font-bold text-slate-900">3. Company Administrator</h3>
                  </div>
                  {authUser?.email ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      Verified Google Account
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={authLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                    >
                      <Sparkles className="w-3 h-3 text-kulkul-orange" />
                      <span>Use Google SSO Instead</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Admin Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Mercer"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Admin Work Email <span className="text-red-500">*</span>
                    </label>
                    {authUser?.email ? (
                      <>
                        <input
                          type="email"
                          readOnly
                          value={adminEmail}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm cursor-not-allowed font-medium"
                        />
                        <span className="text-2xs text-emerald-600 font-semibold mt-1.5 block">
                          ✓ Authenticated via Google OAuth
                        </span>
                      </>
                    ) : (
                      <>
                        <input
                          type="email"
                          required
                          placeholder="e.g. alex@acme.ai"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                        />
                        <span className="text-2xs text-slate-400 mt-1.5 block">
                          An activation link will be sent to this email address.
                        </span>
                      </>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Password {authUser?.email ? '(Optional Fallback)' : '<span className="text-red-500">*</span>'}
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required={!authUser?.email}
                        placeholder={authUser?.email ? 'Optional — you can always log in with Google' : 'Create a secure password (min. 6 characters)'}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    </div>
                    <span className="text-2xs text-slate-400 mt-1 block">
                      {authUser?.email
                        ? 'Leave empty to continue using Google Single Sign-On exclusively.'
                        : 'Used to sign in directly to the Reviewer & Administrator portal.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {authUser?.email
                      ? 'Instant workspace activation with Google verified account'
                      : 'Email activation required upon registration'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto btn btn-lg btn-secondary shadow-lg hover:shadow-xl"
                >
                  {loading ? (
                    <span>Submitting Registration...</span>
                  ) : (
                    <>
                      <span>Submit Company Registration</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};
