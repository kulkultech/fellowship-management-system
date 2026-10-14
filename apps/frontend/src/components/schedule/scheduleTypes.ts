/** One item on a person's schedule: a live session or an assignment deadline. */
export interface ScheduleEvent {
  id: string;
  kind: 'session' | 'assignment';
  title: string;
  /** Session start, or assignment due date (ISO string) */
  start: string;
  /** Session end (ISO string) */
  end?: string;
  programId: string;
  programName: string;
  subtitle?: string;
  /** In-app link (session workspace or program room) */
  href?: string;
  /** External meeting link for sessions */
  meetingUrl?: string;
  /** Assignment already submitted */
  done?: boolean;
}
