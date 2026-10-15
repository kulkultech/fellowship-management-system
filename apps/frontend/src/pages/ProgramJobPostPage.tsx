import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { resolveMediaUrl } from '@/services/apiClient';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { CountdownTimer } from '@/components/CountdownTimer';
import {
  ArrowRight,
  Clock,
  Award,
  AlertCircle,
  Layers,
  Bot,
  Building,
} from 'lucide-react';

export const ProgramJobPostPage: React.FC = () => {
  const { orgSlug = '', programSlug = '' } = useParams<{ orgSlug: string; programSlug: string }>();
  const navigate = useNavigate();

  const previewToken = useMemo(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const paramPreview = queryParams.get('preview') || '';
    const previewStorageKey = `kulkul_preview_${orgSlug}_${programSlug}`;
    if (paramPreview) {
      try {
        sessionStorage.setItem(previewStorageKey, paramPreview);
      } catch (_) {}
      return paramPreview;
    }
    try {
      return sessionStorage.getItem(previewStorageKey) || '';
    } catch (_) {
      return '';
    }
  }, [orgSlug, programSlug]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['program-post', orgSlug, programSlug, previewToken],
    queryFn: () => programService.getProgram(orgSlug, programSlug, previewToken),
  });

  const program = data?.program;
  const org = data?.organization;
  const tracks = program?.tracks || [];

  const openDate = useMemo(() => (program?.open_date ? new Date(program.open_date) : null), [program?.open_date]);
  const isPreviewMode = !!(
    (previewToken && program?.preview_token && previewToken === program.preview_token) ||
    (previewToken && previewToken.length >= 16)
  );

  const [isOpeningSoon, setIsOpeningSoon] = useState<boolean>(() => {
    if (!openDate || isPreviewMode) return false;
    return Date.now() < openDate.getTime();
  });

  useEffect(() => {
    if (!openDate || isPreviewMode) {
      setIsOpeningSoon(false);
      return;
    }
    setIsOpeningSoon(Date.now() < openDate.getTime());
  }, [openDate, isPreviewMode]);

  const isBeforeOpen = isOpeningSoon && !isPreviewMode;

  const handleApplyTrack = (trackSlug: string) => {
    const previewQuery = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : '';
    navigate(`/programs/${orgSlug}/${programSlug}/tracks/${trackSlug}/apply${previewQuery}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-kulkul-purple">Loading program listing...</p>
        </div>
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full content-card text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="heading-page mb-2">Program Not Found</h2>
            <p className="text-slate-600 text-sm mb-6">
              The requested program "{programSlug}" under "{orgSlug}" does not exist or has expired.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full btn btn-md btn-primary"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const programImage =
    resolveMediaUrl(program.image_url) ||
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80';

  const orgLogo = resolveMediaUrl(org?.logo_url);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Cover Banner */}
        <div className="content-card p-0 sm:p-0 overflow-hidden">
          {/* Banner Cover Image Showcase */}
          <div className="relative w-full bg-slate-950 overflow-hidden flex items-center justify-center">
            <img
              src={programImage}
              alt={program.name}
              loading="lazy"
              decoding="async"
              className="w-full h-auto max-h-[460px] sm:max-h-[500px] object-cover block"
            />

          </div>

          {/* Program Header (Cleanly positioned below banner, keeping banner artwork 100% visible) */}
          <div className="p-6 sm:p-8 bg-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Organization Branding */}
              <div className="inline-flex items-center gap-2 text-kulkul-purple">
                {orgLogo ? (
                  <img
                    src={orgLogo}
                    alt={org?.name || 'Organization'}
                    className="w-5 h-5 object-contain"
                  />
                ) : (
                  <Building className="w-4 h-4 text-kulkul-purple" />
                )}
                <span className="text-xs font-extrabold uppercase tracking-wider">
                  {org?.name || 'Organization'}
                </span>
              </div>

              {isBeforeOpen ? (
                <div className="inline-flex items-center gap-1.5 text-amber-700 text-xs font-bold whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>Opening Soon</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Applications Open</span>
                </div>
              )}
            </div>

            <div>
              <h1 className="heading-page">
                {program.name}
              </h1>
              {program.description && (
                <p className="text-sm text-slate-600 mt-2.5 max-w-3xl leading-relaxed whitespace-pre-line">
                  {program.description}
                </p>
              )}
            </div>
          </div>

          {/* Quick Benchmark Bar */}
          <div className="p-6 bg-white border-t border-slate-100 space-y-5">
            <div className={`grid grid-cols-2 ${tracks.length > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3.5`}>
              {tracks.length > 0 && (
                <div className="panel-muted flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0 shadow-xs">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="stat-label">Tracks</div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">
                      {tracks.length} Available
                    </div>
                  </div>
                </div>
              )}

              <div className="panel-muted flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="stat-label">Assessment</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate" title={program.question_set_name || 'Timed Logic'}>
                    {program.enable_mcq ? `${program.question_set_name || 'Timed Logic'} (${program.logic_test_duration_minutes}m)` : 'Not Required'}
                  </div>
                </div>
              </div>

              <div className="panel-muted flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-stitch-blue-light text-stitch-blue flex items-center justify-center shrink-0 shadow-xs">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="stat-label">Technical Screen</div>
                  <div className="text-sm font-extrabold text-slate-900 truncate">
                    {program.enable_ai_interview ? 'Conversational AI' : 'Not Required'}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA / Opening Soon Countdown Bar */}
            <div className="pt-4 border-t border-slate-100">
              {isBeforeOpen ? (
                <div className="flex items-center justify-center sm:justify-end">
                  {openDate && (
                    <CountdownTimer
                      targetDate={openDate}
                      variant="compact"
                      size="md"
                      onExpire={() => {
                        setIsOpeningSoon(false);
                        refetch();
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (tracks.length > 0) {
                        const el = document.getElementById('available-tracks');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        const previewQuery = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : '';
                        navigate(`/programs/${orgSlug}/${programSlug}/apply${previewQuery}`);
                      }
                    }}
                    className="w-full sm:w-auto btn btn-md btn-primary shrink-0"
                  >
                    <span>{tracks.length > 0 ? 'Select Track & Apply' : 'Apply Now'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Available Tracks Section (Only rendered if the program has tracks) */}
        {tracks.length > 0 && (
          <div id="available-tracks" className="space-y-4">
            <h2 className="section-title">
              Available Fellowship Tracks
            </h2>

            <div className="grid grid-cols-1 gap-5">
              {tracks.map((track, idx) => (
                <div
                  key={track.id || track.slug}
                  className="content-card hover:border-kulkul-purple/40 hover:shadow-md transition duration-200 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-kulkul-purple to-kulkul-purple-hover text-white flex items-center justify-center font-extrabold text-sm shadow-md">
                          0{idx + 1}
                        </div>
                        <h3 className="section-title group-hover:text-kulkul-purple transition">
                          {track.name}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed">
                      {track.description || 'Specialized fellowship track with tailored technical evaluations and candidate benchmark testing.'}
                    </p>

                    {/* Track Evaluation Specs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <Clock className="w-4 h-4 text-kulkul-orange shrink-0" />
                        <div className="text-xs">
                          <span className="block subsection-title">Logic Test</span>
                          <span className="font-bold text-slate-800">{track.logic_test_duration_minutes} Mins</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="text-xs">
                          <span className="block subsection-title">Pass Score</span>
                          <span className="font-bold text-slate-800">{track.logic_test_passing_score}% Score</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
                        <Bot className="w-4 h-4 text-kulkul-purple shrink-0" />
                        <div className="text-xs">
                          <span className="block subsection-title">AI Screen</span>
                          <span className="font-bold text-slate-800">
                            {track.enable_ai_interview ? 'Enabled' : 'Not Required'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button (hidden before opening; the header shows the countdown) */}
                  {!isBeforeOpen && (
                    <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-end gap-4">
                      <button
                        onClick={() => handleApplyTrack(track.slug)}
                        className="btn btn-md btn-primary"
                      >
                        <span>Apply to {track.name}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Application & Selection Stages (Dynamic) */}
        <div className="content-card space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Application & Assessment Stages</h2>
            <span className="meta-text">Step-by-step candidate journey</span>
          </div>

          <div className="space-y-4">
            {(program.application_stages && program.application_stages.length > 0
              ? program.application_stages
              : [
                  {
                    step_number: 1,
                    title: tracks.length > 0 ? 'Specialization Track & Intake Application' : 'Candidate Intake Application',
                    description: tracks.length > 0
                      ? 'Choose your target specialization track and submit your academic background, IT major, and contact details.'
                      : 'Submit your academic background, IT major, and contact details to get started.',
                  },
                  {
                    step_number: 2,
                    title: tracks.length > 0 ? 'Track-Specific Timed Logic Assessment' : 'Timed Logic Assessment',
                    description: tracks.length > 0
                      ? 'Solve timed logic and technical domain MCQs calibrated for your chosen specialization track.'
                      : 'Solve timed logic and technical domain MCQs calibrated for program evaluation.',
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
                  className="panel-muted flex items-start gap-4"
                >
                  <div
                    className={`w-8 h-8 rounded-full ${badgeClass} font-extrabold flex items-center justify-center text-sm shrink-0 shadow-sm`}
                  >
                    {stage.step_number || idx + 1}
                  </div>
                  <div>
                    <h3 className="card-title">{stage.title}</h3>
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
