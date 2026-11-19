import type { ProgramSession } from '@/services/types';

/** Where a session stands: ended once its mentor ends it or its time is over, live while it runs. */
export function sessionStatus(
  sess: Pick<ProgramSession, 'start_time' | 'end_time' | 'ended_at'>,
  now: number
): 'upcoming' | 'live' | 'ended' {
  if (sess.ended_at || new Date(sess.end_time).getTime() <= now) return 'ended';
  if (new Date(sess.start_time).getTime() <= now) return 'live';
  return 'upcoming';
}
