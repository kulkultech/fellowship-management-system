import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Lock,
  Image as ImageIcon,
  Clock,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { authService } from '../services/authService';

const LOGO_PRESETS = [
  {
    name: 'Tech & Cloud',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop',
    icon: '⚡',
  },
  {
    name: 'AI Labs',
    url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=128&h=128&fit=crop',
    icon: '🧠',
  },
  {
    name: 'FinTech Group',
    url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=128&h=128&fit=crop',
    icon: '💎',
  },
  {
    name: 'Remote Skills Academy',
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop',
    icon: '🎓',
  },
];

export const CompanyRegisterPage: React.FC = () => {

  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoURL, setLogoURL] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleNameChange = (val: string) => {
    setCompanyName(val);
    if (!companySlug || companySlug === companyName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      setCompanySlug(val.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authService.registerCompany({
        company_name: companyName.trim(),
        company_slug: companySlug.trim().toLowerCase(),
        contact_email: contactEmail.trim().toLowerCase(),
        logo_url: logoURL.trim() || undefined,
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
      {/* Top Simple Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 px-2.5 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center">
              <img src="/kulkul-logo.svg" alt="Logo" className="h-7 w-auto object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-kulkul-purple text-lg tracking-tight">FellowHire</span>
              <span className="text-2xs text-slate-500 font-medium">Company Registration Portal</span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 hidden sm:inline">Already have an approved account?</span>
            <Link
              to="/admin/login"
              className="px-4 py-2 rounded-full text-xs font-bold text-kulkul-purple bg-kulkul-purple-light hover:bg-kulkul-purple-subtle border border-kulkul-purple/20 transition"
            >
              Company Sign In
            </Link>
          </div>
        </div>
      </header>

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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20 text-xs font-bold uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5 text-kulkul-orange" />
                <span>Organization Onboarding</span>
              </div>
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
                    <span className="text-2xs text-slate-400 mt-1 block">
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

              {/* Section 2: Logo Branding (Optional) */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-kulkul-orange" />
                    <h3 className="text-base font-bold text-slate-900">2. Company Logo (Optional)</h3>
                  </div>
                  <span className="text-2xs text-slate-400 font-medium">Used across your dashboard & job posts</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Logo Image URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={logoURL}
                      onChange={(e) => setLogoURL(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple text-sm font-mono"
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-slate-600 block mb-2">Or choose a logo preset:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {LOGO_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setLogoURL(preset.url)}
                          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                            logoURL === preset.url
                              ? 'border-kulkul-purple bg-kulkul-purple-light/40 ring-1 ring-kulkul-purple'
                              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                          }`}
                        >
                          <img
                            src={preset.url}
                            alt={preset.name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                          />
                          <div className="truncate">
                            <div className="text-xs font-bold text-slate-900 truncate">{preset.name}</div>
                            <div className="text-2xs text-slate-400">Select</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Branding Preview */}
                  {logoURL && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                      <img
                        src={logoURL}
                        alt="Logo preview"
                        className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 shadow-2xs p-1"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div>
                        <span className="text-2xs font-bold uppercase text-slate-400 tracking-wider">Dashboard Navbar Preview</span>
                        <div className="text-sm font-extrabold text-kulkul-purple">{companyName || 'Company Name'}</div>
                        <div className="text-2xs text-slate-500">Logo configured & visible to applicants</div>
                      </div>
                    </div>
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-[96rem] mx-auto px-4 text-center text-xs text-slate-500">
          &copy; 2026 FellowHire &middot; Multi-Tenant Assessment & Screening Platform
        </div>
      </footer>
    </div>
  );
};
