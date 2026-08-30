import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  X,
  Building2,
  User,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Lock,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: 'company' | 'participant';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultRole = 'participant',
}) => {
  const [activeTab, setActiveTab] = useState<'participant' | 'company'>(defaultRole);
  const [companyEmail, setCompanyEmail] = useState('admin@rsa.org');
  const [companyPassword, setCompanyPassword] = useState('admin123');
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleCompanyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!companyEmail || !companyPassword) {
      toast.error('Please enter your company email and password');
      return;
    }

    try {
      setIsLoading(true);
      await login({ email: companyEmail, password: companyPassword });
      toast.success('Signed in as RSA Reviewer Admin');
      onClose();
      navigate('/admin/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Login failed';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleParticipantContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateEmail.trim()) {
      toast.error('Please enter your email to continue');
      return;
    }
    onClose();
    // Navigate to apply page with pre-filled params or start assessment
    navigate(`/lit2026/apply?email=${encodeURIComponent(candidateEmail)}&name=${encodeURIComponent(candidateName)}`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-kulkul-purple/60 backdrop-blur-md flex items-center justify-center p-4">
      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Gradient Header */}
        <div className="bg-gradient-to-r from-kulkul-purple via-[#4a1b85] to-kulkul-purple text-white p-6 sm:p-7 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 px-2 py-0.5 rounded-lg bg-white shadow-xs flex items-center justify-center">
              <img src="/kulkul-logo.svg" alt="Kulkul Tech" className="h-5 w-auto object-contain" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-kulkul-orange bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
              FellowHire
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white">
            Welcome to the Platform
          </h2>
          <p className="text-white/80 text-sm mt-1">
            Choose your portal role to sign in or get started.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-2 bg-slate-50 border-b border-slate-100">
          <button
            onClick={() => setActiveTab('participant')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-bold transition ${
              activeTab === 'participant'
                ? 'bg-white text-kulkul-purple shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Participant</span>
          </button>

          <button
            onClick={() => setActiveTab('company')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-bold transition ${
              activeTab === 'company'
                ? 'bg-white text-kulkul-purple shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Company / RSA</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 sm:p-7">
          {activeTab === 'company' ? (
            <form onSubmit={handleCompanyLogin} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  window.location.href = 'http://localhost:8080/api/v1/auth/oauth/google';
                }}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-xs font-bold text-slate-700 shadow-sm transition active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-2.5 text-2xs font-bold uppercase tracking-wider text-slate-400">
                  Or company password
                </span>
              </div>

              <div className="p-3.5 bg-kulkul-purple-light border border-kulkul-purple-subtle rounded-2xl text-xs text-kulkul-purple flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 text-kulkul-purple mt-0.5" />
                <div>
                  <span className="font-bold">RSA Organization Demo:</span> Credentials pre-loaded for Remote Skills Academy Reviewer Portal.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Company Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="admin@rsa.org"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-subtle outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={companyPassword}
                    onChange={(e) => setCompanyPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-subtle outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full text-sm font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>Enter Reviewer Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleParticipantContinue} className="space-y-4">
              <div className="p-3.5 bg-kulkul-orange-light border border-kulkul-orange/20 rounded-2xl text-xs text-slate-800 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 shrink-0 text-kulkul-orange mt-0.5" />
                <div>
                  <span className="font-bold">LIT 2026 Candidate Portal:</span> Enter your email to begin or resume your timed assessment & AI screening.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-kulkul-orange focus:ring-2 focus:ring-kulkul-orange/20 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="e.g. jane.doe@example.com"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:border-kulkul-orange focus:ring-2 focus:ring-kulkul-orange/20 outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full text-sm font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-md hover:shadow-lg transition active:scale-[0.98]"
                >
                  <span>Start Assessment / Intake</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
