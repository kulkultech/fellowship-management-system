import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInterviewService } from '@/services/aiInterviewService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  User,
  Send,
  CheckCircle2,
  AlertCircle,
  Award,
  Terminal,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const InterviewPage: React.FC = () => {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const queryClient = useQueryClient();

  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['ai-interview-session', inviteToken],
    queryFn: () => aiInterviewService.getSession(inviteToken!),
    enabled: !!inviteToken,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (msg: string) => aiInterviewService.sendMessage(inviteToken!, msg),
    onSuccess: (res) => {
      setInputMessage('');
      queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      if (res.is_completed) {
        toast.success('Interview session successfully completed!');
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to send response';
      toast.error(msg);
    },
  });

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.transcript]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(inputMessage.trim());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-kulkul-purple">Connecting to Technical Screening Room...</p>
        </div>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full stitch-card p-8 text-center bg-white">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Interview Session Invalid</h2>
          <p className="text-slate-600 text-sm mb-6">
            The interview invitation token has expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const isCompleted = session.status === 'completed';
  const summary = session.summary_evaluation;

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      <Navbar title="Technical Screening" subtitle="Conversational Engineering Assessment" />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
        {/* Candidate & Session Info Bar */}
        <div className="stitch-card bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-kulkul-purple text-white flex items-center justify-center font-black">
              <Terminal className="w-5 h-5 text-kulkul-orange" />
            </div>
            <div>
              <div className="text-base font-extrabold text-kulkul-purple">{session.program_name}</div>
              <div className="text-xs text-slate-500 font-medium">Candidate: {session.applicant_name} &middot; Stage 2 Screening</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isCompleted
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-kulkul-orange-light text-kulkul-orange border border-kulkul-orange/30'
              }`}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Evaluation Completed</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-kulkul-orange animate-spin" />
                  <span>Active Screen</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Chat / Transcript Container */}
        <div className="stitch-card bg-white flex-1 flex flex-col overflow-hidden min-h-[480px]">
          {/* Messages Scroll Area */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[600px]">
            {session.transcript && session.transcript.length > 0 ? (
              session.transcript.map((msg, idx) => {
                const isAI = msg.role === 'ai';
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3.5 ${isAI ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAI && (
                      <div className="w-9 h-9 rounded-2xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                        AI
                      </div>
                    )}

                    <div
                      className={`max-w-xl rounded-2xl px-5 py-4 text-base leading-relaxed shadow-sm ${
                        isAI
                          ? 'bg-slate-100 text-slate-900 border border-slate-200'
                          : 'bg-kulkul-purple text-white font-medium'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <div
                        className={`text-2xs mt-2 text-right ${
                          isAI ? 'text-slate-400' : 'text-white/60'
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {!isAI && (
                      <div className="w-9 h-9 rounded-2xl bg-kulkul-orange-light text-kulkul-orange border border-kulkul-orange/30 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-16 text-slate-400">
                <Terminal className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Session initialized. Send your first response to begin.</p>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Evaluation Scorecard (Shown when complete) */}
          {isCompleted && summary && (
            <div className="border-t border-slate-200 bg-slate-50/80 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-kulkul-purple" />
                <h3 className="text-base font-bold text-kulkul-purple">Technical Evaluation Summary</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                    Demonstrated Strengths
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-sm">
                    {(summary.key_strengths || []).map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5">
                    Growth Opportunities
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-sm">
                    {(summary.areas_for_growth || []).map((g: string, i: number) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Reviewer Recommendation
                  </div>
                  <div className="text-base font-bold text-kulkul-purple">{summary.recommendation}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Score
                  </div>
                  <div className="text-2xl font-black text-kulkul-purple">
                    {session.scorecard_score}/100
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Input Chat Bar */}
          {!isCompleted ? (
            <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white">
              <div className="flex gap-3">
                <textarea
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder="Type your technical response here (Press Enter to send)..."
                  className="flex-1 px-4 py-3 text-base border border-slate-300 rounded-2xl shadow-sm focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none resize-none transition"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                  className="px-6 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5 text-kulkul-orange" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 border-t border-slate-200 bg-slate-100 text-center text-sm font-medium text-slate-600">
              Technical screen completed. Your responses and scorecard have been submitted to the RSA review committee.
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};
