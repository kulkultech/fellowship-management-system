import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '@/components/AuthModal';
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Building2,
  Award,
  Terminal,
  Zap,
  Sliders,
  ChevronRight,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<'participant' | 'company'>('participant');
  const navigate = useNavigate();

  const openAuth = (role: 'participant' | 'company') => {
    setAuthModalRole(role);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Header Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-18">
            {/* Brand Logo - Only Kulkul logo */}
            <div className="flex items-center">
              <img src="/kulkul-logo.svg" alt="Kulkul" className="h-8 sm:h-9 w-auto object-contain" />
            </div>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
              <a href="#features" className="hover:text-kulkul-purple transition">
                Platform Features
              </a>
              <a href="#programs" className="hover:text-kulkul-purple transition">
                Active Programs
              </a>
              <a href="#how-it-works" className="hover:text-kulkul-purple transition">
                How It Works
              </a>
            </nav>

            {/* Single Clean Header Action */}
            <div className="flex items-center">
              <button
                onClick={() => navigate('/admin/login')}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-xs transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 sm:pt-16 sm:pb-28 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        {/* Background Decorative Blobs */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-r from-kulkul-purple/5 via-kulkul-orange/10 to-stitch-blue/5 blur-3xl -z-10 rounded-full pointer-events-none" />

        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15] max-w-5xl">
            Automated Logic Tests & AI Screening for{' '}
            <span className="bg-gradient-to-r from-kulkul-purple via-[#6423b3] to-kulkul-orange bg-clip-text text-transparent">
              High-Velocity Fellowships
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl leading-relaxed">
            Fast-track candidate selection for organizations. Deliver timed logic MCQs, conversational AI technical screening, and configurable reviewer scorecards in one unified platform.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => openAuth('participant')}
              className="px-8 py-4 rounded-full text-base font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-lg hover:shadow-xl transition active:scale-[0.98] flex items-center gap-2"
            >
              <span>Take Assessment</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => openAuth('company')}
              className="px-8 py-4 rounded-full text-base font-bold text-kulkul-purple bg-kulkul-purple-light hover:bg-kulkul-purple-subtle border border-kulkul-purple/20 transition active:scale-[0.98] flex items-center gap-2"
            >
              <Building2 className="w-5 h-5 text-kulkul-purple" />
              <span>Reviewer Dashboard</span>
            </button>
          </div>

          {/* Featured Hero Card Preview (Featured Fellowship Program) */}
          <div className="mt-14 w-full max-w-5xl stitch-card p-6 sm:p-8 bg-white border border-slate-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-lg">
                  LIT
                </div>
                <div className="text-left">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-2xs font-bold uppercase tracking-wider mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Applications Open</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">LIT 2026 Fellowship & Assessment</h3>
                  <p className="text-xs text-slate-500">Run by Remote Skills Academy (RSA) &middot; Powered by FellowHire</p>
                </div>
              </div>

              <button
                onClick={() => navigate('/lit2026/apply')}
                className="px-5 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow transition flex items-center gap-2"
              >
                <span>Register & Begin</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-left">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                  <Clock className="w-4 h-4 text-kulkul-orange" />
                  <span>Configured Duration</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">30 Minutes</div>
                <div className="text-xs text-slate-500 mt-0.5">Strict single-session timer</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                  <Award className="w-4 h-4 text-stitch-green" />
                  <span>Passing Benchmark</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">70% Grade</div>
                <div className="text-xs text-slate-500 mt-0.5">Instant auto-graded pass mark</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                  <Terminal className="w-4 h-4 text-kulkul-purple" />
                  <span>Next Step Gate</span>
                </div>
                <div className="text-2xl font-black text-kulkul-purple mt-1">AI Screening</div>
                <div className="text-xs text-slate-500 mt-0.5">Conversational scorecard review</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars Section */}
      <section id="features" className="py-20 bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kulkul-purple-light text-kulkul-purple text-xs font-bold uppercase tracking-wider mb-3">
              Comprehensive Platform Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Designed for High-Volume Selection & Rigorous Evaluation
            </h2>
            <p className="mt-3 text-base sm:text-lg text-slate-600">
              Everything hiring teams and fellowship programs need to conduct seamless talent assessments without manual grading overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
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

            {/* Card 2 */}
            <div className="stitch-card p-8 bg-white border border-slate-200/80 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold mb-6">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">1-Attempt Strict Integrity</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Participants are strictly restricted to 1 test attempt. Re-applying automatically displays their existing official scorecard, preventing duplicate attempts.
                </p>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100 text-xs font-semibold text-kulkul-purple flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                <span>Server-enforced retake block</span>
              </div>
            </div>

            {/* Card 3 */}
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

      {/* Featured Fellowship Program Section */}
      <section id="programs" className="py-20 bg-white">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="stitch-card p-8 sm:p-12 bg-gradient-to-br from-kulkul-purple via-[#250b45] to-kulkul-purple text-white flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-kulkul-orange text-white text-xs font-bold uppercase tracking-wider mb-4">
                <Zap className="w-3.5 h-3.5" />
                <span>Featured Fellowship Program</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                LIT 2026 Fellowship & Assessment
              </h2>
              <p className="mt-3 text-white/80 text-base sm:text-lg leading-relaxed">
                Accelerate your software engineering career with Remote Skills Academy and Kulkul Tech. Take the timed assessment now to qualify for technical screening and live reviewer selection.
              </p>

              <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-white/90">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                  <span>30-min Logic Test</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                  <span>70% Passing Grade</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                  <span>Single Attempt Only</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto">
              <button
                onClick={() => navigate('/lit2026/apply')}
                className="px-8 py-4 rounded-full bg-kulkul-orange hover:bg-kulkul-orange-hover text-white text-base font-bold shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Apply as Candidate</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => openAuth('company')}
                className="px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-base font-bold transition flex items-center justify-center gap-2"
              >
                <Building2 className="w-5 h-5" />
                <span>Organization Sign In</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-slate-50 py-12">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <img src="/kulkul-logo.svg" alt="Kulkul" className="h-7 w-auto object-contain" />
            <p className="text-xs text-slate-500">&copy; 2026 Kulkul Tech &middot; All rights reserved.</p>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#features" className="hover:text-kulkul-purple transition">
              Features
            </a>
            <a href="#programs" className="hover:text-kulkul-purple transition">
              Programs
            </a>
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
