import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Terminal,
  Sliders,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Header Navigation */}
      <Navbar showNavLinks={true} />

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

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/register-company')}
              className="w-full sm:w-auto px-8 py-4 rounded-full text-base sm:text-lg font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-lg hover:shadow-xl transition active:scale-[0.98] flex items-center justify-center"
            >
              <span>Create Fellowship Program</span>
            </button>
            <button
              onClick={() => navigate('/lit2026/interview/demo?reset=1')}
              className="w-full sm:w-auto px-8 py-4 rounded-full text-base sm:text-lg font-bold text-kulkul-purple bg-purple-50 hover:bg-purple-100 border border-purple-200 shadow-sm hover:shadow transition active:scale-[0.98] flex items-center justify-center gap-2.5"
            >
              <Sparkles className="w-5 h-5 text-kulkul-purple" />
              <span>Try AI Interview Demo</span>
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
              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs font-semibold text-kulkul-purple flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                  <span>Instant scorecard generator</span>
                </div>
                <button
                  onClick={() => navigate('/lit2026/interview/demo?reset=1')}
                  className="text-xs font-bold text-kulkul-purple hover:text-kulkul-purple-hover flex items-center gap-1 group transition"
                >
                  <span>Try Demo Chamber</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};
