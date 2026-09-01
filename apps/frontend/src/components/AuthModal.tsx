import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Building2,
  User,
  ArrowRight,
  Sparkles,
  Mail,
  ShieldCheck,
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
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');

  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    window.location.href = `${apiBase}/auth/oauth/google`;
  };

  const handleParticipantContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateEmail.trim()) {
      toast.error('Please enter your email to continue');
      return;
    }
    const cleanEmail = candidateEmail.trim().toLowerCase();
    localStorage.setItem('candidate_email', cleanEmail);
    onClose();
    navigate(`/candidate/dashboard?email=${encodeURIComponent(cleanEmail)}`);
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
              <img src="/kulkul-logo.svg" alt="Logo" className="h-5 w-auto object-contain" />
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
            <div className="space-y-5">
              <div className="text-center space-y-1.5 pb-1">
                <h3 className="text-lg font-bold text-slate-900">Company Reviewer Portal</h3>
                <p className="text-xs text-slate-500">
                  Authenticate securely with your organization's Google Workspace account to access fellowship cohorts and candidate pipelines.
                </p>
              </div>

              {/* Google OAuth Single Sign-On Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 rounded-full text-sm font-bold text-slate-700 shadow-sm hover:shadow-md transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                <span>Continue with Google Workspace</span>
              </button>

              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-2.5 text-2xs text-slate-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Single Sign-On (SSO) active. Only whitelisted company emails and verified administrators are granted workspace access.
                </span>
              </div>

              <div className="text-center pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">Need an organization workspace? </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/register-company');
                  }}
                  className="text-xs font-bold text-kulkul-purple hover:underline"
                >
                  Register Company
                </button>
              </div>
            </div>
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
