import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import {
  ArrowRight,
  Clock,
  Award,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  Building2,
  Sparkles,
  Terminal,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ProgramJobPostPage: React.FC = () => {
  const { orgSlug = 'rsa', programSlug = 'lit2026' } = useParams<{ orgSlug: string; programSlug: string }>();
  const navigate = useNavigate();
  const [isCopied, setIsCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['program-post', orgSlug, programSlug],
    queryFn: () => programService.getProgram(orgSlug, programSlug),
  });

  const program = data?.program;
  const org = data?.organization;

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    toast.success('Program link copied! Ready to share with candidates.');
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleApply = () => {
    navigate(`/programs/${orgSlug}/${programSlug}/apply`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-kulkul-purple">Loading program listing...</p>
        </div>
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar title="The Sandbox" subtitle="Program Not Found" />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full stitch-card p-8 text-center bg-white">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Program Not Found</h2>
            <p className="text-slate-600 text-sm mb-6">
              The requested program "{programSlug}" under "{orgSlug}" does not exist or has expired.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full shadow transition"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const coverImage =
    program.image_url ||
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        title="The Sandbox"
        subtitle={`${org?.name || 'Remote Skills Academy'} &middot; Opportunity`}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Cover Banner & Quick Actions */}
        <div className="stitch-card bg-white overflow-hidden">
          {/* Banner Cover Image */}
          <div className="relative h-64 sm:h-80 md:h-96 w-full bg-slate-900 overflow-hidden">
            <img
              src={coverImage}
              alt={program.name}
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

            {/* Badges on Image */}
            <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white text-slate-900 shadow-md">
                <Building2 className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>{org?.name || 'Remote Skills Academy (RSA)'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-kulkul-orange text-white shadow-md uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Active Fellowship</span>
              </span>
            </div>

            {/* Share / Copy Link on Banner */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-lg transition active:scale-95"
                title="Share this program post"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-kulkul-purple" />
                    <span>Share Program Link</span>
                  </>
                )}
              </button>
            </div>

            {/* Bottom Title on Image */}
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                {program.name}
              </h1>
              <p className="text-white/80 text-sm sm:text-base mt-2 max-w-3xl line-clamp-2">
                {program.description}
              </p>
            </div>
          </div>

          {/* Quick Benchmark Bar */}
          <div className="p-6 bg-white border-t border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Duration</div>
                  <div className="text-sm font-extrabold text-slate-900">{program.logic_test_duration_minutes} Mins</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Pass Score</div>
                  <div className="text-sm font-extrabold text-slate-900">{program.logic_test_passing_score}% Benchmark</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Attempts</div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {program.allow_retake ? 'Retakes Allowed' : 'Strict 1-Time'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-stitch-blue-light text-stitch-blue flex items-center justify-center font-bold">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Next Stage</div>
                  <div className="text-sm font-extrabold text-slate-900">AI Screen</div>
                </div>
              </div>
            </div>

            {/* Apply Button Action */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleApply}
                className="w-full md:w-auto stitch-pill stitch-pill-orange text-base px-8 py-3.5 justify-center shadow-lg hover:shadow-xl"
              >
                <span>Apply for this Program</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Layout: Main Details & Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Card */}
            <div className="stitch-card p-6 sm:p-8 bg-white space-y-4">
              <h2 className="text-xl font-bold text-kulkul-purple">Program Overview</h2>
              <p className="text-slate-700 leading-relaxed text-sm sm:text-base whitespace-pre-line">
                {program.description}
              </p>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="font-bold text-slate-900 text-sm mb-1">Host Organization</div>
                  <p className="text-xs text-slate-600">{org?.name || 'Remote Skills Academy'}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="font-bold text-slate-900 text-sm mb-1">Assessment Technology</div>
                  <p className="text-xs text-slate-600">The Sandbox Assessment Engine by Kulkul Tech</p>
                </div>
              </div>
            </div>

            {/* Application & Selection Stages */}
            <div className="stitch-card p-6 sm:p-8 bg-white space-y-6">
              <h2 className="text-xl font-bold text-kulkul-purple">Application & Assessment Stages</h2>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-kulkul-purple text-white font-bold flex items-center justify-center text-sm shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Online Intake Profile</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Submit your background, contact information, resume, GitHub, and LinkedIn profile.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-kulkul-orange text-white font-bold flex items-center justify-center text-sm shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Timed Logic Assessment ({program.logic_test_duration_minutes} Mins)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Solve logic, algorithmic thinking, and system comprehension MCQs. Instant scorecard evaluation with a {program.logic_test_passing_score}% pass benchmark.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-stitch-blue text-white font-bold flex items-center justify-center text-sm shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Conversational AI Technical Screen</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Candidates meeting the passing grade enter an interactive AI screening room for technical depth and architecture evaluation.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
                    4
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Reviewer Panel Decision</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      RSA and Kulkul reviewers inspect your unified scorecard, transcripts, and profile for final fellowship cohort admission.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            {/* Sticky Application Card */}
            <div className="stitch-card p-6 bg-white space-y-6 sticky top-24 border border-slate-200">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-kulkul-orange bg-kulkul-orange-light px-2.5 py-1 rounded-full">
                  Fast-Track Application
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-2">Ready to Apply?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  The assessment starts immediately upon profile submission. Please ensure you have a stable connection.
                </p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Test Format:</span>
                  <span className="font-bold text-slate-900">Online Timed MCQ</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Time Limit:</span>
                  <span className="font-bold text-slate-900">{program.logic_test_duration_minutes} minutes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Pass Threshold:</span>
                  <span className="font-bold text-slate-900">{program.logic_test_passing_score}% score</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Retake Policy:</span>
                  <span className="font-bold text-slate-900">
                    {program.allow_retake ? 'Allowed' : '1-Time Only'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleApply}
                className="w-full stitch-pill stitch-pill-orange text-sm py-3.5 justify-center shadow-md hover:shadow-lg"
              >
                <span>Start Application</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Shareable Link</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/"
                  className="text-2xs font-semibold text-slate-400 hover:text-kulkul-purple transition"
                >
                  &larr; Explore all fellowship programs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
