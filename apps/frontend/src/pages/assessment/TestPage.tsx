import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testService } from '@/services/testService';
import type { SubmitTestResponse } from '@/services/types';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  Mail,
  ArrowRight,
  Play,
  Award,
  FileText,
  ShieldCheck,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Footer } from '@/components/Footer';
import { AssessmentAccessGuard } from '@/components/AssessmentAccessGuard';
import { useAuthStore } from '@/hooks/useAuthStore';
import toast from 'react-hot-toast';

export const TestPage: React.FC = () => {
  const { testToken } = useParams<{ testToken: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [testStage, setTestStage] = useState<'bridge' | 'testing'>('bridge');
  const [isReadyConfirmed, setIsReadyConfirmed] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(() => {
    if (!testToken) return {};
    try {
      const saved = localStorage.getItem(`fms_test_answers_${testToken}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load saved answers', e);
    }
    return {};
  });
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitTestResponse | null>(null);
  const targetEndTimestampRef = useRef<number | null>(null);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setSelectedAnswers((prev) => {
      const next = { ...prev, [questionId]: optionId };
      try {
        localStorage.setItem(`fms_test_answers_${testToken}`, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save answers to localStorage', e);
      }
      return next;
    });
  };

  const { data: testSession, isLoading, isError } = useQuery({
    queryKey: ['test-session', testToken],
    queryFn: () => testService.getTestSession(testToken!),
    enabled: !!testToken,
    refetchOnWindowFocus: false,
  });

  const startMutation = useMutation({
    mutationFn: () => testService.startTest(testToken!),
    onSuccess: (data) => {
      // Sync cache with active session and returned questions
      queryClient.setQueryData(['test-session', testToken], data);

      const rem =
        data.remaining_seconds !== undefined && data.remaining_seconds !== null
          ? data.remaining_seconds
          : data.duration_minutes * 60;

      let target: number = Date.now() + rem * 1000;
      if (data.expires_at) {
        const parsed = new Date(data.expires_at).getTime();
        if (!isNaN(parsed)) {
          target = parsed;
        }
      }

      targetEndTimestampRef.current = target;
      try {
        localStorage.setItem(`fms_test_target_end_${testToken}`, target.toString());
      } catch (e) {
        // ignore
      }

      setSecondsRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
      setTestStage('testing');
      toast.success('Assessment started! Good luck.');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to start assessment';
      toast.error(msg);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (answers: { question_id: string; selected_option_id: string }[]) =>
      testService.submitTest(testToken!, answers),
    onSuccess: (data: SubmitTestResponse) => {
      try {
        localStorage.removeItem(`fms_test_answers_${testToken}`);
        localStorage.removeItem(`fms_test_target_end_${testToken}`);
      } catch (e) {
        // ignore
      }
      setSubmitResult(data);
      toast.success('Assessment submitted successfully!');
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to submit test';
      toast.error(msg);
    },
  });

  // Restore target timestamp from localStorage on mount if present
  useEffect(() => {
    if (!testToken) return;
    try {
      const stored = localStorage.getItem(`fms_test_target_end_${testToken}`);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > Date.now()) {
          targetEndTimestampRef.current = parsed;
          setSecondsRemaining(Math.max(0, Math.ceil((parsed - Date.now()) / 1000)));
        }
      }
    } catch (e) {
      // ignore
    }
  }, [testToken]);

  // If already done or expired, route to result immediately; if already in progress, resume testing
  useEffect(() => {
    if (!testSession) return;
    if (testSession.already_done || testSession.status === 'completed' || testSession.status === 'expired') {
      if (testSession.status === 'expired') {
        toast.error('Assessment time limit has expired.');
      } else {
        toast('You have already completed this test. Redirecting to your official scorecard.', {
          icon: 'ℹ️',
        });
      }
      navigate(`/result/${testToken}`);
      return;
    }

    // If test is already in progress, candidate closed and reopened the page -> resume testing immediately!
    if (testSession.status === 'in_progress') {
      setTestStage('testing');
      let target: number | null = null;
      if (testSession.expires_at) {
        const parsed = new Date(testSession.expires_at).getTime();
        if (!isNaN(parsed)) {
          target = parsed;
        }
      }
      if (!target && testSession.remaining_seconds !== undefined && testSession.remaining_seconds !== null) {
        target = Date.now() + testSession.remaining_seconds * 1000;
      }
      if (target) {
        targetEndTimestampRef.current = target;
        try {
          localStorage.setItem(`fms_test_target_end_${testToken}`, target.toString());
        } catch (e) {
          // ignore
        }
        setSecondsRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
      }
    }
  }, [testSession, testToken, navigate]);

  const handleSubmit = useCallback(() => {
    if (!testSession) return;
    const formattedAnswers = (testSession.questions || []).map((q) => ({
      question_id: q.id,
      selected_option_id: selectedAnswers[q.id] || '',
    }));
    submitMutation.mutate(formattedAnswers);
  }, [testSession, selectedAnswers, submitMutation]);

  // Real-time wall-clock countdown timer
  // Runs continuously when testStage === 'testing'
  useEffect(() => {
    if (testStage !== 'testing') return;

    const tick = () => {
      if (targetEndTimestampRef.current !== null) {
        const diffSec = Math.max(0, Math.ceil((targetEndTimestampRef.current - Date.now()) / 1000));
        setSecondsRemaining(diffSec);

        if (diffSec <= 0 && !isSubmitted && !submitMutation.isPending) {
          toast.error('Time limit reached! Submitting your assessment...');
          handleSubmit();
        }
      } else {
        setSecondsRemaining((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            if (!isSubmitted && !submitMutation.isPending) {
              toast.error('Time limit reached! Submitting your assessment...');
              handleSubmit();
            }
            return 0;
          }
          return prev - 1;
        });
      }
    };

    // Immediate tick upon entering stage
    tick();

    const interval = setInterval(tick, 1000);

    // When candidate switches back to tab or unminimizes browser, immediately resync clock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [testStage, isSubmitted, submitMutation.isPending, handleSubmit]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const answeredCount = useMemo(() => {
    return Object.values(selectedAnswers).filter(Boolean).length;
  }, [selectedAnswers]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-kulkul-purple">Loading Assessment Session...</p>
        </div>
      </div>
    );
  }

  if (isError || !testSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full stitch-card p-8 text-center bg-white">
          <AlertTriangle className="w-12 h-12 text-kulkul-orange mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Session Expired or Not Found</h2>
          <p className="text-slate-600 text-sm mb-6">
            The assessment token could not be verified or has already been evaluated.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="w-full py-3 px-4 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full shadow transition"
          >
            Return to Previous Page
          </button>
        </div>
      </div>
    );
  }

  const questions = testSession.questions || [];
  const currentQ = questions[currentIndex];
  const isUrgent = secondsRemaining !== null && secondsRemaining < 300;

  if (isSubmitted && testSession) {
    const isFormNext = submitResult?.next_step === 'fill_form' || !!submitResult?.redirect_url;
    const isAIInterviewNext = submitResult?.next_step === 'ai_interview' || !!submitResult?.ai_interview_invite_token;
    const isPassed = submitResult ? submitResult.passed : true;
    const candidateEmail = testSession.candidate_email || user?.email || 'your registered email';

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
        <header className="bg-white border-b border-slate-200">
          <div className="w-full px-4 sm:px-8 lg:px-12 h-20 flex items-center justify-between">
            <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 w-auto object-contain" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {testSession.track_name || testSession.program_name}
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl w-full">
            <div className="stitch-card bg-white p-8 sm:p-12 text-center border border-slate-200 shadow-xl rounded-3xl space-y-6 animate-in fade-in zoom-in duration-300">
              <div
                className={`w-14 h-14 rounded-2xl ${
                  isPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                } flex items-center justify-center mx-auto shadow-xs`}
              >
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
                  <span>Assessment Recorded</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Thank You for Submitting Your Assessment!
                </h1>
                <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-lg mx-auto leading-relaxed">
                  Your responses for <span className="font-bold text-slate-900">{testSession.track_name || testSession.program_name}</span> have been successfully recorded and evaluated.
                </p>
              </div>

              {!isPassed ? (
                <>
                  <div className="p-6 rounded-2xl bg-amber-50/80 border border-amber-200/90 text-left space-y-3">
                    <div className="flex items-center gap-2.5 text-amber-800 font-bold text-sm sm:text-base">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <span>Assessment Score Evaluated</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      We have dispatched your evaluation and official assessment score to{' '}
                      <span className="font-bold text-slate-900">{candidateEmail}</span>. You can review your detailed scorecard anytime on your{' '}
                      <span className="font-bold text-slate-900">Candidate Dashboard</span>.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => navigate('/candidate/dashboard')}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Go to Candidate Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate(`/result/${testToken}`)}
                      className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold border border-slate-200 transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>View Official Scorecard</span>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </>
              ) : isFormNext ? (
                <>
                  <div className="p-6 rounded-2xl bg-purple-50/80 border border-purple-200/90 text-left space-y-3">
                    <div className="flex items-center gap-2.5 text-kulkul-purple font-bold text-sm sm:text-base">
                      <FileText className="w-5 h-5 text-kulkul-purple shrink-0" />
                      <span>Next Step: Complete Application Profile</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Great job passing the logic assessment! The next step is to submit your application details. We have dispatched the form link to{' '}
                      <span className="font-bold text-slate-900">{candidateEmail}</span>. You can also start it directly from your{' '}
                      <span className="font-bold text-slate-900">Candidate Dashboard</span> whenever you are ready.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-left space-y-1.5">
                    <p className="font-bold text-slate-700">Next step instructions:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>You will provide your personal details, academic background, and upload your resume.</li>
                      <li>You can fill out the form now or return anytime via your Candidate Dashboard.</li>
                      <li>Check your Spam or Promotions folder if the confirmation email doesn't appear in your inbox.</li>
                    </ul>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => navigate('/candidate/dashboard')}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Go to Candidate Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {submitResult?.redirect_url && (
                      <button
                        onClick={() => navigate(submitResult.redirect_url!)}
                        className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold border border-slate-200 transition active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <span>Fill Application Form Now</span>
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                      </button>
                    )}
                  </div>
                </>
              ) : isAIInterviewNext ? (
                <>
                  <div className="p-6 rounded-2xl bg-purple-50/80 border border-purple-200/90 text-left space-y-3">
                    <div className="flex items-center gap-2.5 text-kulkul-purple font-bold text-sm sm:text-base">
                      <Sparkles className="w-5 h-5 text-kulkul-orange shrink-0" />
                      <span>Next Step: Interactive AI Technical Screening</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Congratulations on achieving the qualifying score! We have dispatched your unique AI interview link to{' '}
                      <span className="font-bold text-slate-900">{candidateEmail}</span>. You can also access and launch it directly from your{' '}
                      <span className="font-bold text-slate-900">Candidate Dashboard</span> whenever you are ready.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-left space-y-1.5">
                    <p className="font-bold text-slate-700">Before entering the AI screening chamber:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Use a laptop or desktop computer with a supported browser (Chrome or Edge).</li>
                      <li>Verify your webcam and microphone permissions before starting.</li>
                      <li>Find a quiet, well-lit room free from background noise and distractions.</li>
                      <li>Take the interview at your convenience &mdash; your session is saved in your Candidate Dashboard.</li>
                    </ul>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => navigate('/candidate/dashboard')}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs sm:text-sm font-bold shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Go to Candidate Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {submitResult?.ai_interview_invite_token && (
                      <button
                        onClick={() => navigate(`/interview/${submitResult.ai_interview_invite_token}`)}
                        className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold border border-slate-200 transition active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <span>Start AI Interview Now</span>
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="p-6 rounded-2xl bg-purple-50/70 border border-purple-200/80 text-left space-y-3">
                    <div className="flex items-center gap-2.5 text-kulkul-purple font-bold text-sm sm:text-base">
                      <Mail className="w-5 h-5 text-kulkul-purple shrink-0" />
                      <span>Submission Confirmation &amp; Results Emailed</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      We have dispatched a submission confirmation and your official assessment score to{' '}
                      <span className="font-bold text-slate-900">{candidateEmail}</span>.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-left space-y-1.5">
                    <p className="font-medium text-slate-700">What happens next:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      <li>Our admissions committee will review your submission and assessment performance.</li>
                      <li>Your application status is kept up to date in real time on your Candidate Dashboard.</li>
                    </ul>
                  </div>

                  <div className="pt-2 flex items-center justify-center">
                    <button
                      onClick={() => navigate('/candidate/dashboard')}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Go to Candidate Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <AssessmentAccessGuard
      requiredEmail={testSession.candidate_email}
      candidateName={testSession.candidate_name}
      assessmentType="logic_test"
      programName={testSession.program_name}
      trackName={testSession.track_name}
    >
      {testStage === 'bridge' ? (
        /* BRIDGE PAGE: Candidate Briefing & Information Before Starting */
        <div className="min-h-screen bg-slate-50/60 flex flex-col justify-between">
          <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20 shadow-2xs">
            <div className="w-full px-4 sm:px-8 lg:px-12 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 w-auto object-contain" />
                <div className="hidden sm:flex flex-col">
                  <span className="font-extrabold text-kulkul-purple text-sm leading-tight">{testSession.program_name}</span>
                  <span className="text-2xs text-slate-500 font-medium">Candidate Assessment Briefing</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {user?.email && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                    <div className="w-5 h-5 rounded-full bg-kulkul-purple text-white flex items-center justify-center text-2xs font-black">
                      {(user.name || user.email || 'C').charAt(0).toUpperCase()}
                    </div>
                    <span className="max-w-[130px] truncate">{user.name || user.email}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/candidate/dashboard')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-full hover:bg-slate-100 transition"
                >
                  Dashboard
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center">
            <div className="stitch-card bg-white p-6 sm:p-10 border border-slate-200/80 shadow-xl rounded-3xl space-y-8 animate-in fade-in duration-300">
              {/* Header Badge & Title */}
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 border border-purple-200/80 text-kulkul-purple text-xs font-bold tracking-wide mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-kulkul-orange" />
                  <span>Timed Assessment Briefing</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
                  {testSession.track_name ? `${testSession.track_name} Aptitude Assessment` : 'Technical & Logic Assessment'}
                </h1>
                <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
                  Welcome! Before you begin your timed screening assessment for <span className="font-bold text-slate-900">{testSession.program_name}</span>, please review the session structure, duration, and rules below.
                </p>
              </div>

              {/* 4 Metric Highlight Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Duration */}
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xs font-extrabold text-amber-800 uppercase tracking-wider">Duration</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-100/90 flex items-center justify-center text-amber-700">
                      <Clock className="w-4 h-4 text-kulkul-orange" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                      {testSession.duration_minutes} <span className="text-xs sm:text-sm font-bold text-slate-600">min</span>
                    </div>
                    <p className="text-2xs sm:text-xs text-amber-900/70 mt-1 font-medium">Non-stop timer</p>
                  </div>
                </div>

                {/* 2. Questions */}
                <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xs font-extrabold text-kulkul-purple uppercase tracking-wider">Questions</span>
                    <div className="w-8 h-8 rounded-xl bg-purple-100/90 flex items-center justify-center text-kulkul-purple">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                      {testSession.question_count || questions.length} <span className="text-xs sm:text-sm font-bold text-slate-600">items</span>
                    </div>
                    <p className="text-2xs sm:text-xs text-kulkul-purple/70 mt-1 font-medium">Multiple choice</p>
                  </div>
                </div>

                {/* 3. Passing Score */}
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xs font-extrabold text-emerald-800 uppercase tracking-wider">Passing Score</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-100/90 flex items-center justify-center text-emerald-700">
                      <Award className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                      {testSession.passing_score ?? 70}%
                    </div>
                    <p className="text-2xs sm:text-xs text-emerald-800/70 mt-1 font-medium">Required to qualify</p>
                  </div>
                </div>

                {/* 4. Attempts */}
                <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xs font-extrabold text-indigo-800 uppercase tracking-wider">Attempts</span>
                    <div className="w-8 h-8 rounded-xl bg-indigo-100/90 flex items-center justify-center text-indigo-700">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                      1 <span className="text-xs sm:text-sm font-bold text-slate-600">sitting</span>
                    </div>
                    <p className="text-2xs sm:text-xs text-indigo-800/70 mt-1 font-medium">Single attempt only</p>
                  </div>
                </div>
              </div>

              {/* Candidate Details Strip */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-kulkul-purple text-white font-black flex items-center justify-center text-sm shrink-0">
                    {(testSession.candidate_name || user?.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{testSession.candidate_name || user?.name || 'Candidate'}</div>
                    <div className="text-slate-500 text-xs">{testSession.candidate_email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 font-semibold self-start sm:self-center text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Verified Candidate Session</span>
                </div>
              </div>

              {/* Instructions & Guidelines */}
              <div className="space-y-4 pt-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-kulkul-purple" />
                  <span>Important Instructions &amp; Rules</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs sm:text-sm text-slate-700">
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-kulkul-purple flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-slate-900 block font-bold mb-0.5">Continuous Countdown</strong>
                      Once you click &quot;Begin Timed Assessment&quot;, your {testSession.duration_minutes}-minute timer starts immediately and cannot be paused.
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-kulkul-purple flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-slate-900 block font-bold mb-0.5">Free Question Navigation</strong>
                      You can navigate freely between questions using the question selector or Previous / Next buttons at any point.
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-kulkul-purple flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                    <div>
                      <strong className="text-slate-900 block font-bold mb-0.5">Automatic Submission</strong>
                      When the countdown timer reaches 00:00, all answered questions will be automatically submitted for scoring.
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-kulkul-purple flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</div>
                    <div>
                      <strong className="text-slate-900 block font-bold mb-0.5">No Negative Marking</strong>
                      Incorrect answers do not deduct points. Answer every single question to maximize your final score.
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation & Start Actions */}
              <div className="pt-4 border-t border-slate-100 space-y-5">
                <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70 hover:bg-amber-50 transition select-none">
                  <input
                    type="checkbox"
                    checked={isReadyConfirmed}
                    onChange={(e) => setIsReadyConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 text-kulkul-purple rounded border-slate-300 focus:ring-kulkul-purple shrink-0 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                    I have read the guidelines and confirm I am in a quiet environment with a stable connection, ready to complete the <strong>{testSession.duration_minutes}-minute</strong> assessment in one sitting.
                  </span>
                </label>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/candidate/dashboard')}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-sm transition text-center"
                  >
                    Take Assessment Later
                  </button>

                  <button
                    type="button"
                    disabled={!isReadyConfirmed || startMutation.isPending}
                    onClick={() => startMutation.mutate()}
                    className="w-full sm:w-auto px-8 py-4 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-extrabold text-sm sm:text-base shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-3"
                  >
                    {startMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Starting Assessment...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-kulkul-orange text-kulkul-orange" />
                        <span>Begin Timed Assessment</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </main>

          <Footer />
        </div>
      ) : (
        /* TIMED TESTING STAGE: Active Questions & Countdown Timer */
        <div className="min-h-screen bg-slate-50/60 flex flex-col">
          {/* Sticky Top Assessment Header */}
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
            <div className="w-full px-4 sm:px-8 lg:px-12">
              <div className="flex items-center justify-between h-20 sm:h-24">
                <div className="flex items-center gap-4">
                  <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 sm:h-12 w-auto object-contain" />
                  <div className="hidden sm:flex flex-col">
                    <span className="font-extrabold text-kulkul-purple text-base">{testSession.program_name}</span>
                    <div className="text-xs text-slate-500 font-medium">Timed Logic Assessment &middot; 1 Attempt Only</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-6">
                  {/* Candidate Info (if authenticated) */}
                  {user?.email && (
                    <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                      <div className="w-5 h-5 rounded-full bg-kulkul-purple text-white flex items-center justify-center text-2xs font-black">
                        {(user.name || user.email || 'C').charAt(0).toUpperCase()}
                      </div>
                      <span className="max-w-[130px] truncate">{user.name || user.email}</span>
                    </div>
                  )}

                  {/* Countdown Clock */}
                  <div
                    className={`flex items-center gap-2.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full border font-mono font-bold text-sm sm:text-base shadow-xs ${
                      isUrgent
                        ? 'bg-red-50 text-red-700 border-red-300 animate-pulse'
                        : 'bg-kulkul-orange-light text-kulkul-orange border-kulkul-orange/30'
                    }`}
                  >
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{secondsRemaining !== null ? formatTimer(secondsRemaining) : '--:--'}</span>
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    className="px-6 py-3 rounded-full text-sm sm:text-base font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm hover:shadow-md transition active:scale-[0.98] flex items-center gap-2.5"
                  >
                    <Send className="w-4 h-4 text-kulkul-orange" />
                    <span className="hidden sm:inline">Finish & Submit</span>
                    <span className="sm:hidden">Submit</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col gap-6">
            {/* Progress & Stepper */}
            <div className="stitch-card p-5 bg-white">
              <div className="flex items-center justify-between text-sm font-bold text-kulkul-purple mb-3">
                <span>
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="text-slate-500 text-xs font-normal">
                  {answeredCount} of {questions.length} answered
                </span>
              </div>

              {/* Stepper Pills */}
              <div className="flex flex-wrap gap-2">
                {questions.map((q, idx) => {
                  const isSelected = !!selectedAnswers[q.id];
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-9 h-9 rounded-xl font-bold text-sm transition flex items-center justify-center ${
                        isCurrent
                          ? 'bg-kulkul-purple text-white shadow-md ring-2 ring-kulkul-orange ring-offset-2'
                          : isSelected
                          ? 'bg-kulkul-orange-light text-kulkul-orange border border-kulkul-orange/40 font-bold'
                          : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Current Question Card */}
            {currentQ && (
              <div className="stitch-card p-6 sm:p-8 bg-white flex flex-col">
                {/* Category & Points */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-kulkul-purple-light text-kulkul-purple text-xs font-bold uppercase tracking-wider">
                    {currentQ.category}
                  </span>
                  <span className="text-xs font-bold text-slate-400">{currentQ.points} Points</span>
                </div>

                {/* Question Text */}
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed mb-6">
                  {currentQ.question_text}
                </h2>

                {/* Options List */}
                <div className="space-y-3 mb-8">
                  {currentQ.options.map((option) => {
                    const isSelected = selectedAnswers[currentQ.id] === option.id;
                    return (
                      <label
                        key={option.id}
                        onClick={() => handleSelectOption(currentQ.id, option.id)}
                        className={`flex items-center gap-4 p-4 sm:p-4.5 rounded-2xl border-2 cursor-pointer transition ${
                          isSelected
                            ? 'border-kulkul-orange bg-kulkul-orange-light text-slate-950 font-bold shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black uppercase shrink-0 transition ${
                            isSelected
                              ? 'bg-kulkul-orange text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 border border-slate-300'
                          }`}
                        >
                          {option.id}
                        </div>
                        <span className="text-sm sm:text-base leading-snug flex-1">{option.text}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Stepper Buttons */}
                <div className="flex items-center justify-between pt-5 border-t border-slate-100 mt-auto">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 rounded-full hover:bg-slate-200 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      className="stitch-pill stitch-pill-purple"
                    >
                      <span>Next Question</span>
                      <ChevronRight className="w-4 h-4 text-kulkul-orange" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitMutation.isPending}
                      className="stitch-pill stitch-pill-orange"
                    >
                      <span>Submit Assessment</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </main>
          <Footer />
        </div>
      )}
    </AssessmentAccessGuard>
  );
};
