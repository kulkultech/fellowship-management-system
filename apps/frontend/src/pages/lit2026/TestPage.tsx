import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { testService } from '@/services/testService';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  Mail,
  ArrowRight,
} from 'lucide-react';
import { Footer } from '@/components/Footer';
import { useAuthStore } from '@/hooks/useAuthStore';
import toast from 'react-hot-toast';

export const TestPage: React.FC = () => {
  const { testToken } = useParams<{ testToken: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: testSession, isLoading, isError } = useQuery({
    queryKey: ['test-session', testToken],
    queryFn: () => testService.getTestSession(testToken!),
    enabled: !!testToken,
    refetchOnWindowFocus: false,
  });

  const submitMutation = useMutation({
    mutationFn: (answers: { question_id: string; selected_option_id: string }[]) =>
      testService.submitTest(testToken!, answers),
    onSuccess: () => {
      toast.success('Assessment submitted successfully!');
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to submit test';
      toast.error(msg);
    },
  });

  // If already done, route to result immediately
  useEffect(() => {
    if (testSession && (testSession.already_done || testSession.status === 'completed')) {
      toast('You have already completed this test. Redirecting to your official scorecard.', {
        icon: 'ℹ️',
      });
      navigate(`/lit2026/result/${testToken}`);
    }
  }, [testSession, testToken, navigate]);

  // Calculate and initialize timer countdown
  useEffect(() => {
    if (testSession && secondsRemaining === null && testSession.status === 'in_progress') {
      const durationSeconds = testSession.duration_minutes * 60;
      const startTime = new Date(testSession.started_at).getTime();
      const now = new Date().getTime();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, durationSeconds - elapsedSeconds);
      setSecondsRemaining(remaining);
    }
  }, [testSession, secondsRemaining]);

  const handleSubmit = useCallback(() => {
    if (!testSession) return;
    const formattedAnswers = (testSession.questions || []).map((q) => ({
      question_id: q.id,
      selected_option_id: selectedAnswers[q.id] || '',
    }));
    submitMutation.mutate(formattedAnswers);
  }, [testSession, selectedAnswers, submitMutation]);

  // Real-time timer countdown
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          toast.error('Time limit reached! Submitting your assessment...');
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining, handleSubmit]);

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
            onClick={() => navigate('/lit2026/apply')}
            className="w-full py-3 px-4 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full shadow transition"
          >
            Return to Application
          </button>
        </div>
      </div>
    );
  }

  const questions = testSession.questions || [];
  const currentQ = questions[currentIndex];
  const isUrgent = secondsRemaining !== null && secondsRemaining < 300;

  if (isSubmitted && testSession) {
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
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  Logic Test Submitted &middot; Graded
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-4 tracking-tight">
                  Thank You for Submitting Your Assessment!
                </h1>
                <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-lg mx-auto leading-relaxed">
                  Your responses for <span className="font-bold text-slate-900">{testSession.track_name || testSession.program_name}</span> have been successfully recorded and evaluated.
                </p>
              </div>

              {/* Email dispatch info banner */}
              <div className="p-6 rounded-2xl bg-purple-50/70 border border-purple-200/80 text-left space-y-3">
                <div className="flex items-center gap-2.5 text-kulkul-purple font-bold text-sm sm:text-base">
                  <Mail className="w-5 h-5 text-kulkul-purple shrink-0" />
                  <span>Submission Confirmation &amp; Results Emailed</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  We have dispatched a submission confirmation and your official assessment score to your registered email address.
                </p>
                <div className="pt-2 border-t border-purple-100 flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-kulkul-purple" />
                    <span>Questions Answered: {answeredCount} / {questions.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Status: Evaluated &amp; Stored</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-left space-y-1">
                <p className="font-medium text-slate-700">What happens next:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                  <li>If you achieve the qualifying score, you will receive an invitation email to proceed with the conversational AI Technical Interview.</li>
                  <li>You can review your detailed answers and question breakdown on your official scorecard.</li>
                  <li>Your application status is kept up to date in real time on your Candidate Dashboard.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate(`/lit2026/result/${testToken}`)}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow-sm hover:shadow transition active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span>View Official Scorecard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/candidate/dashboard')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition text-center"
                >
                  Go to Candidate Dashboard
                </button>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
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
                    onClick={() =>
                      setSelectedAnswers({
                        ...selectedAnswers,
                        [currentQ.id]: option.id,
                      })
                    }
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
  );
};
