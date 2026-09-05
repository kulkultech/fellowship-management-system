import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Clock,
  ChevronRight,
  ShieldCheck,
  Upload,
  X,
  Mail,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import { uploadService } from '../services/uploadService';

export const CompanyRegisterPage: React.FC = () => {
  const { user: authUser, isLoading: authLoading } = useAuth();

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
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
      setError(err?.response?.data?.error || 'Failed to upload logo to Cloudflare R2');
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

    try {
      setLoading(true);
      await authService.registerCompany({
        company_name: companyName.trim(),
        company_slug: companySlug.trim().toLowerCase(),
        contact_email: contactEmail.trim().toLowerCase(),
        logo_url: logoURL,
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
      });

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
        {isSuccess ? (
          <div className="stitch-card bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8" />
            </div>

            <div>
              <span className="px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-wider">
                Registration Submitted &middot; Waiting for Approval
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4">
                Thank You for Registering, {companyName}!
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-md mx-auto leading-relaxed">
                Your company workspace registration has been received. We have sent a confirmation email to{' '}
                <span className="font-semibold text-slate-900">{adminEmail}</span> notifying you that your application is waiting for platform approval.
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
                <span className="text-slate-500">Status:</span>
                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Waiting for Platform Approval
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-blue-800 text-xs text-left flex items-start gap-3">
              <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p>
                Once our platform team approves your company, you will receive an approval email and will immediately be able to launch programs, manage question banks, and review candidate scorecards.
              </p>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/"
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition text-center"
              >
                Back to Homepage
              </Link>
              <Link
                to="/candidate/dashboard"
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold transition flex items-center justify-center gap-2"
              >
                <span>Candidate Portal</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : !authUser?.email ? (
          /* STEP 1: CONTINUE WITH GOOGLE FIRST GATE */
          <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <span className="px-3 py-1 rounded-full bg-purple-100 text-kulkul-purple text-xs font-bold uppercase tracking-wider">
                Step 1 of 2: Identity Verification
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Register Your Company
              </h1>
              <p className="text-slate-600 text-xs sm:text-sm">
                To guarantee company authenticity, please continue with your corporate Google account first. After sign in, you will complete your company profile.
              </p>
            </div>

            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-200 text-kulkul-purple flex items-center justify-center mx-auto shadow-2xs">
                <Building2 className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">Sign In with Google</h2>
                <p className="text-xs text-slate-500 mt-1">
                  We'll pre-fill your administrator contact and verify your work credentials instantly.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 rounded-full text-sm font-bold text-slate-800 shadow-sm hover:shadow-md transition duration-150"
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

              <div className="pt-2 border-t border-slate-100 text-center">
                <span className="text-xs text-slate-500">Already approved? </span>
                <Link to="/admin/login" className="text-xs font-bold text-kulkul-purple hover:underline">
                  Company Admin Sign In
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: FILL COMPANY REGISTRATION FORM */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Headline */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Google Verified: {authUser.email}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Complete Your Company Registration
              </h1>
              <p className="text-slate-600 text-sm sm:text-base">
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
                      <span className="text-xs font-bold text-kulkul-purple">Uploading to Cloudflare R2...</span>
                    </div>
                  ) : logoURL ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={logoURL}
                          alt="Logo preview"
                          className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 shadow-2xs p-1"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900">{logoFileName || 'Company Logo'}</div>
                          <span className="text-2xs font-semibold text-emerald-600">Saved to Cloudflare R2</span>
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

              {/* Section 3: Verified Google Admin Account */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-base font-bold text-slate-900">3. Verified Company Administrator</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Verified Google Account
                  </span>
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
                      Work Email (Google Account)
                    </label>
                    <input
                      type="email"
                      readOnly
                      value={adminEmail}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm cursor-not-allowed font-medium"
                    />
                    <span className="text-2xs text-emerald-600 font-semibold mt-1.5 block">
                      ✓ Authenticated via Google OAuth
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Fallback Password (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="Optional — you can always log in with Google"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
                    <span className="text-2xs text-slate-400 mt-1 block">
                      Leave empty to continue using Google Single Sign-On exclusively.
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Platform approval required before first program launch</span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-orange hover:bg-kulkul-orange-hover text-white text-sm font-bold shadow-lg hover:shadow-xl transition active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
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
