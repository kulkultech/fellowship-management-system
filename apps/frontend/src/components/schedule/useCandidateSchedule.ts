import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { sessionService } from '@/services/sessionService';
import { assignmentService } from '@/services/assignmentService';
import type { ProgramAssignment, ProgramSession } from '@/services/types';
import type { ScheduleEvent } from './scheduleTypes';

export interface ScheduleProgram {
  programId: string;
  programName: string;
  orgSlug: string;
  programSlug: string;
}

const formatType = (type?: string) =>
  type ? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined;

/** Loads sessions and assignment deadlines for the programs a fellow has joined. */
export function useCandidateSchedule(programs: ScheduleProgram[], enabled: boolean) {
  const queries = useQueries({
    queries: programs.flatMap((p) => [
      {
        queryKey: ['candidate-program-sessions', p.programId],
        queryFn: () => sessionService.listSessions(p.programId),
        enabled,
      },
      {
        queryKey: ['program-assignments', p.programId],
        queryFn: () => assignmentService.listAssignments(p.programId),
        enabled,
      },
    ]),
  });

  const isLoading = queries.some((q) => q.isLoading && q.fetchStatus !== 'idle');
  const dataVersion = queries.map((q) => q.dataUpdatedAt).join(',');

  const events: ScheduleEvent[] = useMemo(() => {
    const items: ScheduleEvent[] = [];
    programs.forEach((p, idx) => {
      const roomUrl = `/programs/${p.orgSlug}/${p.programSlug}/room`;
      const sessions = (queries[idx * 2]?.data as ProgramSession[] | undefined) || [];
      const assignments = (queries[idx * 2 + 1]?.data as ProgramAssignment[] | undefined) || [];
      for (const s of sessions) {
        items.push({
          id: s.id,
          kind: 'session',
          title: s.title,
          start: s.start_time,
          end: s.end_time,
          programId: p.programId,
          programName: p.programName,
          subtitle: formatType(s.session_type),
          href: `/programs/${p.orgSlug}/${p.programSlug}/sessions/${s.id}/room`,
          meetingUrl: s.meeting_url,
        });
      }
      for (const a of assignments) {
        if (a.status !== 'published' || !a.due_date) continue;
        items.push({
          id: a.id,
          kind: 'assignment',
          title: a.title,
          start: a.due_date,
          programId: p.programId,
          programName: p.programName,
          href: roomUrl,
          done: Boolean(a.my_submission),
        });
      }
    });
    return items.sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, dataVersion]);

  return { events, isLoading };
}
