import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Lock,
  Clock,
  ChevronRight,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { authService } from '../services/authService';
import { uploadService } from '../services/uploadService';

export const CompanyRegisterPage: React.FC = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!companyName.trim() || !companySlug.trim()) {
      setError('Please provide company name and slug');
      return;
    }
    if (!adminEmail.trim() || !adminPassword || !adminName.trim()) {
      setError('Please provide full administrator account credentials');
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
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-wider">
                Registration Submitted &middot; Pending Approval
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4">
                Application Received for {companyName}!
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-md mx-auto leading-relaxed">
                Your company registration has been submitted to the FellowHire platform administrators. You will be able to log in and create assessment programs once your company application is approved.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2 text-slate-600">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Company Slug:</span>
                <span className="font-mono text-kulkul-purple">{companySlug}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Admin Login:</span>
                <span className="font-mono text-slate-900">{adminEmail}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Verification:</span>
                <span className="text-amber-700">Platform Admin Review in progress</span>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/"
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition text-center"
              >
                Back to Homepage
              </Link>
              <Link
                to="/admin/login"
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold transition flex items-center justify-center gap-2"
              >
                <span>Go to Login</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Headline */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Register Your Company on FellowHire
              </h1>
              <p className="text-slate-600 text-sm sm:text-base">
                Create your company workspace to host custom MCQ assessments, conversational AI technical interviews, and automated reviewer scorecards.
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
                  <span className="text-2xs text-slate-400 font-medium">PNG, JPG, SVG, or WebP (max. 2MB)</span>
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

              {/* Section 3: Admin User Account */}
              <div>
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-6">
                  <Lock className="w-5 h-5 text-kulkul-purple" />
                  <h3 className="text-base font-bold text-slate-900">3. Company Administrator Account</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2">
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
                      Work Email (Login Username) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="admin@yourcompany.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm"
                    />
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
                    <span>Submitting Application...</span>
                  ) : (
                    <>
                      <span>Register Company</span>
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
