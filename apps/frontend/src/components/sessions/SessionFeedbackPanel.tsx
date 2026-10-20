import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionService, type FeedbackAnswers } from '@/services/sessionService';
import type {
  FeedbackForm,
  FeedbackSummary,
  SessionFeedback,
  SessionFeedbackFellowRow,
  SessionFeedbackItem,
} from '@/services/types';

const feedbackQueryKey = (sessionId: string) => ['session-feedback', sessionId];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const errorMessage = (err: any, fallback: string) => err?.response?.data?.error || err?.message || fallback;

/** 1-5 stars; read-only when onChange is not given. */
const StarRating: React.FC<{ value?: number; onChange?: (v: number) => void; label?: string }> = ({ value = 0, onChange, label }) => (
  <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={label || 'Rating'}>
    {[1, 2, 3, 4, 5].map((n) => {
      const icon = <Star className={`w-5 h-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />;
      return onChange ? (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${label ? `${label}: ` : ''}${n} of 5`}
          onClick={() => onChange(n)}
          className="p-0.5 rounded-md hover:bg-slate-100 transition"
        >
          {icon}
        </button>
      ) : (
        <span key={n}>{icon}</span>
      );
    })}
  </div>
);

/** Metric bars, e.g. "Activeness 5/5" (averages show one decimal). */
const ScoreBars: React.FC<{ form: FeedbackForm; scores: Record<string, number> }> = ({ form, scores }) => (
  <div className="space-y-2.5">
    {form.questions.map((q) => {
      const v = scores[q.key];
      return (
        <div key={q.key} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">{q.label}</span>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-kulkul-purple" style={{ width: `${v ? (v / 5) * 100 : 0}%` }} />
          </div>
          <span className="text-xs font-bold text-slate-900 text-right">{v ? `${Number.isInteger(v) ? v : v.toFixed(1)}/5` : '–'}</span>
        </div>
      );
    })}
  </div>
);

/** The questions of a form with 1-5 stars each, plus a comment. */
const QuestionForm: React.FC<{
  form: FeedbackForm;
  initial?: SessionFeedbackItem;
  saving: boolean;
  onSave: (answers: FeedbackAnswers) => void;
  onCancel?: () => void;
}> = ({ form, initial, saving, onSave, onCancel }) => {
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores || {});
  const [comment, setComment] = useState(initial?.comment || '');
  useEffect(() => {
    setScores(initial?.scores || {});
    setComment(initial?.comment || '');
  }, [initial?.updated_at]);
  const complete = form.questions.every((q) => (scores[q.key] || 0) >= 1);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {form.questions.map((q) => (
          <div key={q.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900">{q.label}</div>
              <div className="meta-text">{q.question}</div>
            </div>
            <StarRating label={q.label} value={scores[q.key]} onChange={(v) => setScores((s) => ({ ...s, [q.key]: v }))} />
          </div>
        ))}
      </div>
      <div>
        <label className="field-label" htmlFor={`comment-${form.direction}`}>
          {form.comment_label} <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id={`comment-${form.direction}`}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="form-textarea"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="meta-text">
          {initial ? `Sent ${formatDate(initial.updated_at)}` : complete ? '' : 'Rate every question to send.'}
        </span>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn btn-sm btn-outline">
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!complete || saving}
            onClick={() => onSave({ scores, comment })}
            className="btn btn-sm btn-primary"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{initial ? 'Update' : 'Send'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** Averages plus each response, with who wrote it. */
const SummaryView: React.FC<{ form: FeedbackForm; summary?: FeedbackSummary; of?: number; empty: string }> = ({
  form,
  summary,
  of,
  empty,
}) => {
  if (!summary || summary.count === 0) return <p className="meta-text">{empty}</p>;
  return (
    <div className="space-y-4">
      <div className="panel-muted space-y-3">
        <div className="stat-label">
          {of
            ? `Average · ${summary.count} of ${of} responded`
            : `Average of ${summary.count} ${summary.count === 1 ? 'response' : 'responses'}`}
        </div>
        <ScoreBars form={form} scores={summary.averages} />
      </div>
      <div className="space-y-2">
        {summary.items.map((item, i) => (
          <div key={`${item.author_name}-${i}`} className="panel space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="card-title">{item.author_name || 'Anonymous'}</span>
              <span className="meta-text">{formatDate(item.updated_at)}</span>
            </div>
            <div className="text-xs text-slate-600">
              {form.questions.map((q) => `${q.label} ${item.scores[q.key] ?? '–'}/5`).join(' · ')}
            </div>
            {item.comment && <p className="text-sm text-slate-700 whitespace-pre-line">{item.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

const useSave = (sessionId: string, fn: (answers: FeedbackAnswers) => Promise<unknown>, done?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success('Feedback sent. Thank you!');
      queryClient.invalidateQueries({ queryKey: feedbackQueryKey(sessionId) });
      done?.();
    },
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to send feedback')),
  });
};

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="content-card space-y-4">
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

/** One fellow, with the mentor's feedback to them (write or edit). */
const FellowRow: React.FC<{ sessionId: string; form: FeedbackForm; row: SessionFeedbackFellowRow; open: boolean }> = ({
  sessionId,
  form,
  row,
  open,
}) => {
  const [editing, setEditing] = useState(false);
  const save = useSave(sessionId, (a) => sessionService.saveFeedbackToFellow(sessionId, row.applicant_id, a), () => setEditing(false));
  return (
    <div className="panel space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="card-title truncate">{row.fellow_name}</div>
          <div className="meta-text truncate">{row.fellow_email}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs font-semibold ${row.feedback ? 'text-emerald-700' : 'text-slate-500'}`}>
            {row.feedback ? 'Given' : 'Not yet'}
          </span>
          {open && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-sm btn-outline">
              {row.feedback ? 'Edit' : 'Rate'}
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="pt-3 border-t border-slate-100">
          <QuestionForm form={form} initial={row.feedback} saving={save.isPending} onSave={(a) => save.mutate(a)} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        row.feedback && (
          <div className="space-y-2">
            <ScoreBars form={form} scores={row.feedback.scores} />
            {row.feedback.comment && <p className="text-sm text-slate-700 whitespace-pre-line">{row.feedback.comment}</p>}
            <p className="meta-text">
              {row.feedback.author_name} · {formatDate(row.feedback.updated_at)}
            </p>
          </div>
        )
      )}
    </div>
  );
};

const FellowView: React.FC<{ sessionId: string; data: SessionFeedback }> = ({ sessionId, data }) => {
  const [tab, setTab] = useState<'give' | 'results'>('give');
  const saveMentor = useSave(sessionId, (a) => sessionService.saveFeedbackToMentor(sessionId, a));
  const saveOrganizer = useSave(sessionId, (a) => sessionService.saveFeedbackToOrganizer(sessionId, a));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setTab('give')} className={`tab-pill ${tab === 'give' ? 'tab-pill-active' : ''}`}>
          Give feedback
        </button>
        <button type="button" onClick={() => setTab('results')} className={`tab-pill ${tab === 'results' ? 'tab-pill-active' : ''}`}>
          Your results
        </button>
      </div>
      {tab === 'give' ? (
        <>
          <Card
            title={`Feedback for ${data.mentor_name || 'your mentor'}`}
            subtitle="Your mentor and the organizers see your answers and your name."
          >
            <QuestionForm form={data.forms.to_mentor} initial={data.mine.to_mentor} saving={saveMentor.isPending} onSave={(a) => saveMentor.mutate(a)} />
          </Card>
          <Card title="Feedback for the organizers" subtitle="Only the program organizers see this.">
            <QuestionForm
              form={data.forms.fellow_to_organizer}
              initial={data.mine.fellow_to_organizer}
              saving={saveOrganizer.isPending}
              onSave={(a) => saveOrganizer.mutate(a)}
            />
          </Card>
        </>
      ) : (
        <Card title="Your results" subtitle="How your mentor rated you in this session.">
          {data.my_results ? (
            <ScoreBars form={data.forms.to_fellow} scores={data.my_results.scores} />
          ) : (
            <p className="meta-text">Your mentor hasn't rated you for this session yet.</p>
          )}
        </Card>
      )}
    </div>
  );
};

const StaffView: React.FC<{ sessionId: string; data: SessionFeedback }> = ({ sessionId, data }) => {
  const isMentor = data.viewer === 'mentor';
  const [tab, setTab] = useState<'mentor' | 'fellows' | 'organizers'>('mentor');
  const saveOrganizer = useSave(sessionId, (a) => sessionService.saveFeedbackToOrganizer(sessionId, a));
  const fellows = data.fellows || [];
  const given = fellows.filter((f) => f.feedback).length;
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'mentor', label: isMentor ? 'About you' : 'About the mentor' },
    { key: 'fellows', label: 'Fellows' },
    { key: 'organizers', label: 'For the organizers' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`tab-pill ${tab === t.key ? 'tab-pill-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mentor' && (
        <Card
          title={isMentor ? 'What fellows said about you' : `What fellows said about ${data.mentor_name || 'the mentor'}`}
          subtitle="Answers from fellows of this session, with their names."
        >
          <SummaryView form={data.forms.to_mentor} summary={data.about_mentor} of={data.fellow_count} empty="No feedback from fellows yet." />
        </Card>
      )}

      {tab === 'fellows' && (
        <Card
          title="Feedback to fellows"
          subtitle={`${given} of ${fellows.length} rated. Fellows see only their scores, not your notes.`}
        >
          {fellows.length === 0 ? (
            <p className="meta-text">No fellows in this session.</p>
          ) : (
            <div className="space-y-2">
              {fellows.map((row) => (
                <FellowRow key={row.applicant_id} sessionId={sessionId} form={data.forms.to_fellow} row={row} open={data.feedback_open} />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'organizers' &&
        (isMentor ? (
          <Card title="Feedback for the organizers" subtitle="Only the program organizers see this.">
            <QuestionForm
              form={data.forms.mentor_to_organizer}
              initial={data.mine.mentor_to_organizer}
              saving={saveOrganizer.isPending}
              onSave={(a) => saveOrganizer.mutate(a)}
            />
          </Card>
        ) : (
          <>
            <Card title="From fellows" subtitle="How fellows rated the way this session was organized.">
              <SummaryView
                form={data.forms.fellow_to_organizer}
                summary={data.to_organizers_from_fellows}
                of={data.fellow_count}
                empty="No feedback from fellows yet."
              />
            </Card>
            <Card title="From mentors" subtitle="How mentors rated the organization and support.">
              <SummaryView form={data.forms.mentor_to_organizer} summary={data.to_organizers_from_mentors} empty="No feedback from mentors yet." />
            </Card>
          </>
        ))}
    </div>
  );
};

export const SessionFeedbackPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: feedbackQueryKey(sessionId),
    queryFn: () => sessionService.getFeedback(sessionId),
  });

  if (isLoading) {
    return (
      <div className="content-card p-12 flex items-center justify-center gap-2 meta-text">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading feedback…</span>
      </div>
    );
  }
  if (isError || !data) {
    return <div className="content-card meta-text">Feedback is not available for this session.</div>;
  }
  if (!data.feedback_open) {
    return <div className="content-card meta-text">Feedback opens when the mentor ends the session.</div>;
  }
  return data.viewer === 'fellow' ? <FellowView sessionId={sessionId} data={data} /> : <StaffView sessionId={sessionId} data={data} />;
};
