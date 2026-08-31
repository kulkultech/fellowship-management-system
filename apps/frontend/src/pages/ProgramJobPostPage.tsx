import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  ArrowRight,
  Clock,
  Award,
  Share2,
  Check,
  AlertCircle,
  Layers,
  Bot,
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
  const tracks = program?.tracks || [];

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    toast.success('Program link copied! Ready to share with candidates.');
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleApplyTrack = (trackSlug: string) => {
    navigate(`/programs/${orgSlug}/${programSlug}/tracks/${trackSlug}/apply`);
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
        <Navbar title="FellowHire" subtitle="Program Not Found" />
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
        title="FellowHire"
        subtitle={`${org?.name || 'Remote Skills Academy'} &middot; Opportunity`}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Cover Banner */}
        <div className="stitch-card bg-white overflow-hidden shadow-sm border border-slate-100">
          {/* Banner Cover Image */}
          <div className="relative h-64 sm:h-80 md:h-96 w-full bg-slate-900 overflow-hidden">
            <img
              src={coverImage}
              alt={program.name}
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

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
          <div className="p-6 bg-white border-t border-slate-100 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100/80">
                <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0 shadow-xs">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Tracks</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate">{tracks.length} Available</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100/80">
                <div className="w-10 h-10 rounded-xl bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Assessment</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate">Timed Logic MCQ</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100/80">
                <div className="w-10 h-10 rounded-xl bg-stitch-blue-light text-stitch-blue flex items-center justify-center shrink-0 shadow-xs">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Technical Screen</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate">Conversational AI</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100/80">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">Evaluation</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate">Instant Scorecard</div>
                </div>
              </div>
            </div>

            {/* CTA & Admissions Status Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 text-center sm:text-left">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span>Admissions open &middot; Select your specialization track below to start your application</span>
              </div>
              <a
                href="#available-tracks"
                className="w-full sm:w-auto stitch-pill stitch-pill-purple text-sm px-7 py-3 justify-center shadow-md hover:shadow-lg transition active:scale-95 shrink-0"
              >
                <span>Select Track & Apply</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Available Tracks Section */}
        <div id="available-tracks" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-kulkul-purple flex items-center gap-2">
                <Layers className="w-6 h-6 text-kulkul-orange" />
                Available Fellowship Tracks
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Select a specialization track below. Each track features dedicated logic assessments and AI technical screenings.
              </p>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 bg-kulkul-purple-light text-kulkul-purple text-xs font-extrabold rounded-full">
              {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'} Open
            </span>
          </div>

          {tracks.length === 0 ? (
            <div className="stitch-card p-8 bg-white text-center">
              <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700">No tracks currently configured</h3>
              <p className="text-xs text-slate-500 mt-1">
                Please check back soon or contact the program administrator.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {tracks.map((track, idx) => (
                <div
                  key={track.id || track.slug}
                  className="stitch-card p-6 sm:p-7 bg-white hover:border-kulkul-purple/40 hover:shadow-xl transition duration-200 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-kulkul-purple to-kulkul-purple-hover text-white flex items-center justify-center font-extrabold text-sm shadow-md">
                          0{idx + 1}
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 group-hover:text-kulkul-purple transition">
                            {track.name}
                          </h3>
                          <span className="text-xs font-semibold text-slate-400">
                            Track ID: {track.slug}
                          </span>
                        </div>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                        Open for Applications
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed">
                      {track.description || 'Specialized fellowship track with tailored technical evaluations and candidate benchmark testing.'}
                    </p>

                    {/* Track Evaluation Specs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <Clock className="w-4 h-4 text-kulkul-orange shrink-0" />
                        <div className="text-xs">
                          <span className="text-slate-400 block text-2xs uppercase font-bold">Logic Test</span>
                          <span className="font-bold text-slate-800">{track.logic_test_duration_minutes} Mins</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="text-xs">
                          <span className="text-slate-400 block text-2xs uppercase font-bold">Pass Score</span>
                          <span className="font-bold text-slate-800">{track.logic_test_passing_score}% Score</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
                        <Bot className="w-4 h-4 text-kulkul-purple shrink-0" />
                        <div className="text-xs">
                          <span className="text-slate-400 block text-2xs uppercase font-bold">AI Screen</span>
                          <span className="font-bold text-slate-800">
                            {track.enable_ai_interview ? 'Enabled' : 'Not Required'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500 font-medium">
                      Takes ~{track.logic_test_duration_minutes + 15} mins total
                    </span>
                    <button
                      onClick={() => handleApplyTrack(track.slug)}
                      className="stitch-pill stitch-pill-orange text-sm px-6 py-2.5 justify-center shadow hover:shadow-md transition active:scale-95"
                    >
                      <span>Apply to {track.name}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overview Card */}
        <div className="stitch-card p-6 sm:p-8 bg-white space-y-4 shadow-sm border border-slate-100">
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
              <p className="text-xs text-slate-600">FellowHire Multi-Track Assessment Engine</p>
            </div>
          </div>
        </div>

        {/* Application & Selection Stages (Dynamic) */}
        <div className="stitch-card p-6 sm:p-8 bg-white space-y-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-kulkul-purple">Application & Assessment Stages</h2>
            <span className="text-xs font-semibold text-slate-400">Step-by-step candidate journey</span>
          </div>

          <div className="space-y-4">
            {(program.application_stages && program.application_stages.length > 0
              ? program.application_stages
              : [
                  {
                    step_number: 1,
                    title: 'Specialization Track & Intake Application',
                    description:
                      'Choose your target specialization track and submit your academic background, IT major, and contact details.',
                  },
                  {
                    step_number: 2,
                    title: 'Track-Specific Timed Logic Assessment',
                    description:
                      'Solve timed logic and technical domain MCQs calibrated for your chosen specialization track.',
                  },
                  {
                    step_number: 3,
                    title: 'Conversational AI Technical Screen',
                    description:
                      'Engage in an interactive conversational AI screening session evaluating technical depth and problem-solving.',
                  },
                  {
                    step_number: 4,
                    title: 'Submission & Application Confirmation Email',
                    description:
                      'Candidate completes submission and receives an official application confirmation email.',
                  },
                  {
                    step_number: 5,
                    title: 'Admissions Committee Review & Scoring',
                    description:
                      'The reviewer committee evaluates combined MCQ scores, AI transcripts, and candidate qualifications.',
                  },
                  {
                    step_number: 6,
                    title: 'Approval & Final Interview Scheduling',
                    description:
                      'Approved candidates receive an official fellowship invitation and link to schedule their final interview with the host organization.',
                  },
                ]
            ).map((stage, idx) => {
              const badgeColors = [
                'bg-kulkul-purple text-white',
                'bg-kulkul-orange text-white',
                'bg-stitch-blue text-white',
                'bg-teal-600 text-white',
                'bg-indigo-600 text-white',
                'bg-emerald-600 text-white',
              ];
              const badgeClass = badgeColors[idx % badgeColors.length];

              return (
                <div
                  key={stage.step_number || idx}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition"
                >
                  <div
                    className={`w-8 h-8 rounded-full ${badgeClass} font-extrabold flex items-center justify-center text-sm shrink-0 shadow-sm`}
                  >
                    {stage.step_number || idx + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{stage.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{stage.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
