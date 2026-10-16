import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionService } from '@/services/sessionService';
import type { SessionFeedback, SessionFeedbackFellowRow, SessionFeedbackItem } from '@/services/types';

const feedbackQueryKey = (sessionId: string) => ['session-feedback', sessionId];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const errorMessage = (err: any, fallback: string) => err?.response?.data?.error || err?.message || fallback;

/** 1-5 star rating. Read-only when onChange is not given. */
const StarRating: React.FC<{ value?: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }> = ({
  value = 0,
  onChange,
  size = 'md',
}) => {
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-6 h-6';
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = (
          <Star className={`${iconClass} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n === value ? 0 : n)}
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
};

const FeedbackEntry: React.FC<{ item: SessionFeedbackItem; who?: string }> = ({ item, who }) => (
  <div className="panel space-y-1.5">
    <div className="flex items-center justify-between gap-3">
      {item.rating ? <StarRating value={item.rating} size="sm" /> : <span />}
      <span className="meta-text">{formatDate(item.updated_at)}</span>
    </div>
    {item.comment && <p className="text-sm text-slate-700 whitespace-pre-line">{item.comment}</p>}
    {who && <p className="meta-text">{who}</p>}
  </div>
);

/** Fellow: rate the mentor, and read the mentor's feedback to you. */
const FellowFeedbackView: React.FC<{ sessionId: string; data: SessionFeedback }> = ({ sessionId, data }) => {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(data.my_feedback?.rating || 0);
  const [comment, setComment] = useState(data.my_feedback?.comment || '');

  useEffect(() => {
    setRating(data.my_feedback?.rating || 0);
    setComment(data.my_feedback?.comment || '');
  }, [data.my_feedback?.updated_at]);

  const saveMutation = useMutation({
    mutationFn: () => sessionService.saveFeedbackToMentor(sessionId, { rating, comment }),
    onSuccess: () => {
      toast.success('Feedback sent. Thank you!');
      queryClient.invalidateQueries({ queryKey: feedbackQueryKey(sessionId) });
    },
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to send feedback')),
  });

  const mentorLabel = data.mentor_name || 'your mentor';

  return (
    <div className="space-y-4">
      <div className="content-card space-y-4">
        <div className="section-header">
          <div>
            <h2 className="section-title">Feedback for {mentorLabel}</h2>
            <p className="section-subtitle">
              Your mentor sees your rating and comment without your name. The program team can see who wrote it.
            </p>
          </div>
        </div>

        {!data.feedback_open ? (
          <p className="meta-text">Feedback opens when your mentor ends the session.</p>
        ) : (
          <>
            <div>
              <span className="field-label">How was this session?</span>
              <StarRating value={rating} onChange={setRating} />
            </div>
            <div>
              <label className="field-label" htmlFor="feedback-to-mentor">
                Comment (optional)
              </label>
              <textarea
                id="feedback-to-mentor"
                rows={4}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What helped you most, and what could be better next time?"
                className="form-textarea"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="meta-text">
                {data.my_feedback ? `Sent ${formatDate(data.my_feedback.updated_at)}` : ''}
              </span>
              <button
                type="button"
                disabled={!rating || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="btn btn-sm btn-primary"
              >
                {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{data.my_feedback ? 'Update Feedback' : 'Send Feedback'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="content-card space-y-4">
        <div className="section-header">
          <div>
            <h2 className="section-title">Feedback from your mentor</h2>
            <p className="section-subtitle">Only you and the program team can see this.</p>
          </div>
        </div>
        {data.mentor_feedback ? (
          <FeedbackEntry item={data.mentor_feedback} who={data.mentor_feedback.author_name} />
        ) : (
          <p className="meta-text">No feedback from your mentor for this session yet.</p>
        )}
      </div>
    </div>
  );
};

/** One fellow row for staff: shows their feedback and lets the mentor write or edit it. */
const FellowFeedbackRow: React.FC<{ sessionId: string; row: SessionFeedbackFellowRow; open: boolean }> = ({
  sessionId,
  row,
  open,
}) => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState(row.feedback?.rating || 0);
  const [comment, setComment] = useState(row.feedback?.comment || '');

  const startEditing = () => {
    setRating(row.feedback?.rating || 0);
    setComment(row.feedback?.comment || '');
    setIsEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      sessionService.saveFeedbackToFellow(sessionId, row.applicant_id, {
        rating: rating || undefined,
        comment,
      }),
    onSuccess: () => {
      toast.success(`Feedback saved for ${row.fellow_name}`);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: feedbackQueryKey(sessionId) });
    },
    onError: (err: any) => toast.error(errorMessage(err, 'Failed to save feedback')),
  });

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
          {open && !isEditing && (
            <button type="button" onClick={startEditing} className="btn btn-sm btn-outline">
              {row.feedback ? 'Edit' : 'Write'}
            </button>
          )}
        </div>
      </div>

      {!isEditing && row.feedback && (
        <div className="space-y-1.5">
          {row.feedback.rating ? <StarRating value={row.feedback.rating} size="sm" /> : null}
          <p className="text-sm text-slate-700 whitespace-pre-line">{row.feedback.comment}</p>
          <p className="meta-text">
            {row.feedback.author_name} · {formatDate(row.feedback.updated_at)}
          </p>
        </div>
      )}

      {isEditing && (
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div>
            <span className="field-label">Rating (optional)</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <div>
            <label className="field-label" htmlFor={`feedback-${row.applicant_id}`}>
              Feedback for {row.fellow_name}
            </label>
            <textarea
              id={`feedback-${row.applicant_id}`}
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What they did well, and what to work on next"
              className="form-textarea"
            />
            <p className="meta-text mt-1">Only {row.fellow_name} and the program team can see this.</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="btn btn-sm btn-outline">
              Cancel
            </button>
            <button
              type="button"
              disabled={!comment.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="btn btn-sm btn-primary"
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Save Feedback</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Mentor/admin: see fellows' feedback to the mentor, and give feedback to each fellow. */
const StaffFeedbackView: React.FC<{ sessionId: string; data: SessionFeedback }> = ({ sessionId, data }) => {
  const summary = data.to_mentor;
  const fellows = data.fellows || [];
  const givenCount = fellows.filter((f) => f.feedback).length;

  return (
    <div className="space-y-4">
      <div className="content-card space-y-4">
        <div className="section-header">
          <div>
            <h2 className="section-title">Feedback for {data.mentor_name || 'the mentor'}</h2>
            <p className="section-subtitle">
              {summary?.anonymous ? 'From fellows of this session, shown without names.' : 'From fellows of this session.'}
            </p>
          </div>
        </div>

        {summary && summary.count > 0 ? (
          <>
            <div className="flex items-end gap-6">
              <div>
                <div className="stat-label">Average</div>
                <div className="flex items-center gap-2">
                  <span className="stat-value">{summary.average.toFixed(1)}</span>
                  <StarRating value={Math.round(summary.average)} size="sm" />
                </div>
              </div>
              <div>
                <div className="stat-label">Responses</div>
                <div className="stat-value">
                  {summary.count}
                  <span className="text-sm font-bold text-slate-400"> / {summary.fellow_count}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {summary.items.map((item, idx) => (
                <FeedbackEntry
                  key={`${item.applicant_id || 'anon'}-${idx}`}
                  item={item}
                  who={summary.anonymous ? undefined : item.fellow_name}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="meta-text">
            {data.feedback_open ? 'No feedback from fellows yet.' : 'Fellows can give feedback once you end the session.'}
          </p>
        )}
      </div>

      <div className="content-card space-y-4">
        <div className="section-header">
          <div>
            <h2 className="section-title">Feedback to fellows</h2>
            <p className="section-subtitle">
              {fellows.length > 0
                ? `${givenCount} of ${fellows.length} fellows have feedback. Each fellow sees only their own.`
                : 'Each fellow sees only their own feedback.'}
            </p>
          </div>
        </div>
        {!data.feedback_open && <p className="meta-text">You can write feedback once the session is ended.</p>}
        {fellows.length === 0 ? (
          <p className="meta-text">No fellows in this session.</p>
        ) : (
          <div className="space-y-2">
            {fellows.map((row) => (
              <FellowFeedbackRow key={row.applicant_id} sessionId={sessionId} row={row} open={data.feedback_open} />
            ))}
          </div>
        )}
      </div>
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
  return data.viewer === 'staff' ? (
    <StaffFeedbackView sessionId={sessionId} data={data} />
  ) : (
    <FellowFeedbackView sessionId={sessionId} data={data} />
  );
};
