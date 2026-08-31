import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '@/components/AuthModal';
import {
  ArrowRight,
  CheckCircle2,
  Building2,
  Terminal,
  Sliders,
  ChevronDown,
  User,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<'participant' | 'company'>('participant');
  const [signInDropdownOpen, setSignInDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const openAuth = (role: 'participant' | 'company') => {
    setAuthModalRole(role);
    setAuthModalOpen(true);
    setSignInDropdownOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSignInDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Header Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between h-20 sm:h-24">
            {/* Brand Logo - Prominent Kulkul logo */}
            <div className="flex items-center">
              <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 sm:h-12 w-auto object-contain" />
            </div>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-10 text-base font-semibold text-slate-600">
              <a href="#features" className="hover:text-kulkul-purple transition">
                Platform Features
              </a>
              <button
                onClick={() => navigate('/register-company')}
                className="hover:text-kulkul-purple transition font-semibold text-slate-600"
              >
                Register Company
              </button>
            </nav>

            {/* Sign In Dropdown Action */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setSignInDropdownOpen((prev) => !prev)}
                className="px-6 py-3 rounded-full text-sm sm:text-base font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm hover:shadow-md transition active:scale-[0.98] flex items-center gap-2"
                aria-expanded={signInDropdownOpen}
              >
                <span>Sign In</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${signInDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {signInDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-100 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => openAuth('participant')}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 group-hover:text-kulkul-purple transition">
                      Candidate Entry
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    onClick={() => {
                      setSignInDropdownOpen(false);
                      navigate('/admin/login');
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 group-hover:text-kulkul-purple transition">
                      Company Sign In
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-24 sm:pt-20 sm:pb-32 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        {/* Background Decorative Blobs */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-r from-kulkul-purple/5 via-kulkul-orange/10 to-stitch-blue/5 blur-3xl -z-10 rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 text-center flex flex-col items-center">
          {/* Main Headline - Exactly 2 rows */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight max-w-5xl">
            <span className="block">Automated Logic Tests & AI Screening</span>
            <span className="block mt-2">
              for{' '}
              <span className="bg-gradient-to-r from-kulkul-purple via-[#6423b3] to-kulkul-orange bg-clip-text text-transparent">
                High-Velocity Fellowships
              </span>
            </span>
          </h1>

          {/* Subtitle - Exactly 2 rows */}
          <div className="mt-6 text-base sm:text-lg lg:text-xl text-slate-600 max-w-4xl leading-relaxed">
            <p className="block">Fast-track candidate selection with timed logic tests and conversational AI screening.</p>
            <p className="block mt-1">Deliver instant reviewer scorecards in one unified platform.</p>
          </div>

          {/* Single Focused CTA Button for Companies */}
          <div className="mt-10 flex items-center justify-center">
            <button
              onClick={() => navigate('/register-company')}
              className="px-8 py-4 rounded-full text-base sm:text-lg font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-lg hover:shadow-xl transition active:scale-[0.98] flex items-center gap-2.5"
            >
              <Building2 className="w-5 h-5 text-kulkul-orange" />
              <span>Create a Fellowship Program</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Value Pillars Section (2 Clean Features) */}
      <section id="features" className="py-20 bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Designed for High-Volume Selection & Rigorous Evaluation
            </h2>
            <p className="mt-3 text-base sm:text-lg text-slate-600">
              Everything hiring teams and fellowship programs need to conduct seamless talent assessments without manual grading overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Feature 1: Configurable Benchmarks */}
            <div className="stitch-card p-8 bg-white border border-slate-200/80 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center font-bold mb-6">
                  <Sliders className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Configurable Benchmarks</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Program admins can adjust passing grades (e.g. 70%, 80%) and time limits (15–60 mins) per cohort in real time to match candidate batch standards.
                </p>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100 text-xs font-semibold text-kulkul-purple flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                <span>Configurable per cohort</span>
              </div>
            </div>

            {/* Feature 2: AI Technical Interview */}
            <div className="stitch-card p-8 bg-white border border-slate-200/80 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-stitch-blue-light text-stitch-blue flex items-center justify-center font-bold mb-6">
                  <Terminal className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">AI Technical Interview</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Candidates who clear the MCQ benchmark enter a conversational AI screening room that evaluates technical depth, problem-solving, and architecture trade-offs.
                </p>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100 text-xs font-semibold text-kulkul-purple flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                <span>Instant scorecard generator</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-slate-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <img src="/kulkul-logo.svg" alt="Kulkul" className="h-7 w-auto object-contain" />
            <p className="text-xs text-slate-500">&copy; 2026 Kulkul Tech &middot; All rights reserved.</p>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#features" className="hover:text-kulkul-purple transition">
              Features
            </a>
            <button
              onClick={() => navigate('/register-company')}
              className="hover:text-kulkul-purple transition"
            >
              Register Company
            </button>
            <button
              onClick={() => navigate('/admin/login')}
              className="text-kulkul-purple hover:underline font-semibold"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>

      {/* Pop-up Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultRole={authModalRole}
      />
    </div>
  );
};
