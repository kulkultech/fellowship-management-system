import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { testService } from '@/services/testService';
import { Navbar } from '@/components/Navbar';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  AlertCircle,
  FileCheck,
  Sparkles,
} from 'lucide-react';

export const ResultPage: React.FC = () => {
  const { testToken } = useParams<{ testToken: string }>();
  const navigate = useNavigate();

  const { data: result, isLoading, isError } = useQuery({
    queryKey: ['test-result', testToken],
    queryFn: () => testService.getResult(testToken!),
    enabled: !!testToken,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-kulkul-purple">Calculating official scorecard...</p>
        </div>
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full stitch-card p-8 text-center bg-white">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Scorecard Unavailable</h2>
          <p className="text-slate-600 text-sm mb-6">
            Unable to load test results for this session token.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full shadow transition"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const isPassed = result.passed;

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      <Navbar title="LIT 2026 Assessment" subtitle="Automated Scorecard Evaluation" />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8">
        {/* Result Header Card */}
        <div className="stitch-card bg-white overflow-hidden mb-8">
          <div
            className={`p-8 text-center border-b ${
              isPassed
                ? 'bg-emerald-50/80 border-emerald-100 text-emerald-950'
                : 'bg-kulkul-orange-light/80 border-kulkul-orange/20 text-slate-900'
            }`}
          >
            <div className="inline-flex p-3 rounded-2xl bg-white shadow-sm mb-4">
              {isPassed ? (
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              ) : (
                <XCircle className="w-12 h-12 text-kulkul-orange" />
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {isPassed ? 'Benchmark Achieved!' : 'Assessment Completed'}
            </h1>
            <p className="mt-2 text-base text-slate-600 max-w-lg mx-auto">
              Candidate: <span className="font-bold text-kulkul-purple">{result.applicant_name}</span> &middot;{' '}
              {result.program_name}
            </p>
          </div>

          {/* Metric Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white">
            <div className="p-6 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Your Score</div>
              <div className="text-4xl font-black text-kulkul-purple">{result.total_score}%</div>
              <div className="text-xs text-slate-400 mt-1">Logic & MCQ Grade</div>
            </div>

            <div className="p-6 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pass Benchmark</div>
              <div className="text-4xl font-black text-slate-700">{result.passing_score}%</div>
              <div className="text-xs text-slate-400 mt-1">Required threshold</div>
            </div>

            <div className="p-6 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Result Status</div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black mt-2 uppercase tracking-wider bg-slate-100 text-slate-800">
                {isPassed ? 'Qualified' : 'Evaluated'}
              </div>
            </div>
          </div>
        </div>

        {/* Next Stage Action Card */}
        {isPassed && result.ai_interview_invite_token ? (
          <div className="stitch-card bg-white p-6 sm:p-8 border-2 border-kulkul-purple">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-kulkul-purple text-white rounded-2xl shrink-0 shadow-md">
                <Sparkles className="w-7 h-7 text-kulkul-orange" />
              </div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20 uppercase tracking-wider mb-2">
                  Stage 2: Technical Screening
                </div>
                <h2 className="text-xl font-bold text-kulkul-purple">
                  Enter Interactive AI Technical Screening
                </h2>
                <p className="text-slate-600 text-sm sm:text-base mt-2 leading-relaxed">
                  Congratulations on clearing the logic benchmark! You are now eligible to complete the conversational technical screening.
                </p>

                {result.ai_interview_expires_at && (
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-600">
                    <span className="font-bold text-slate-800">Invitation Window:</span> Valid until{' '}
                    <span className="font-bold text-kulkul-purple">
                      {new Date(result.ai_interview_expires_at).toLocaleString()}
                    </span>.
                  </div>
                )}

                <div className="mt-6">
                  <button
                    onClick={() => navigate(`/lit2026/interview/${result.ai_interview_invite_token}`)}
                    className="w-full sm:w-auto stitch-pill stitch-pill-orange text-base px-8 py-3.5"
                  >
                    <span>Enter Technical Screen Room</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="stitch-card bg-white p-6 sm:p-8 text-center">
            <FileCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Submission Recorded</h2>
            <p className="text-slate-600 text-sm mt-1 max-w-md mx-auto">
              Your assessment responses have been officially saved. The RSA review committee will evaluate all candidate submissions.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
