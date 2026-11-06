import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Users, X } from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import type { AttendanceStatus, ProgramSession } from '@/services/types';

const STATUS_TEXT: Record<AttendanceStatus, { label: string; className: string }> = {
  present: { label: 'Present', className: 'text-emerald-700' },
  late: { label: 'Late', className: 'text-amber-600' },
  pending_validation: { label: 'Awaiting review', className: 'text-amber-700' },
  absent: { label: 'Absent', className: 'text-rose-600' },
  excused: { label: 'Excused', className: 'text-slate-500' },
};

interface SessionParticipantsDialogProps {
  programId: string;
  session: ProgramSession;
  onClose: () => void;
}

/** Who a session is for, with each fellow's attendance so far (for mentors and admins). */
export const SessionParticipantsDialog: React.FC<SessionParticipantsDialogProps> = ({ programId, session, onClose }) => {
  const { data: participants = [], isLoading } = useQuery({
    queryKey: ['session-attendance', programId, session.id],
    queryFn: () => sessionService.getSessionAttendance(programId, session.id),
  });
  const isUpcoming = new Date(session.start_time).getTime() > Date.now();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div>
            <h3 className="section-title">Participants</h3>
            <p className="section-subtitle">
              {session.title}
              {session.mentor_name ? ` · Host: ${session.mentor_name}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon-sm btn-ghost" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-kulkul-purple" />
          </div>
        ) : participants.length === 0 ? (
          <div className="py-10 text-center text-slate-400 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">No fellows are invited to this session yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="meta-text pb-1">
              {participants.length} {participants.length === 1 ? 'fellow' : 'fellows'}
            </p>
            <ul className="divide-y divide-slate-100">
              {participants.map((p) => {
                const st = STATUS_TEXT[p.status];
                return (
                  <li key={p.applicant_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="cell-primary truncate">{p.fellow_name || 'Fellow'}</div>
                      <div className="cell-secondary truncate">{p.track_name || p.fellow_email}</div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${isUpcoming || !st ? 'text-slate-400' : st.className}`}>
                      {isUpcoming || !st ? 'Invited' : st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-sm btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
