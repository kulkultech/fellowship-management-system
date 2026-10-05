/**
 * Google Calendar & Google Meet Helper Utilities
 */

interface SessionCalendarData {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  meeting_url?: string;
  google_calendar_html_link?: string;
}

/**
 * Returns a 1-click Google Calendar Event Template URL.
 */
export function getGoogleCalendarUrl(session: SessionCalendarData): string {
  if (session.google_calendar_html_link && session.google_calendar_html_link.startsWith('http')) {
    return session.google_calendar_html_link;
  }

  const baseUrl = 'https://calendar.google.com/calendar/render';
  const start = new Date(session.start_time);
  const end = new Date(session.end_time);

  const startUTC = start.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const endUTC = end.toISOString().replace(/-|:|\.\d\d\d/g, '');

  let details = session.description || '';
  if (session.meeting_url) {
    details = details ? `${details}\n\nGoogle Meet: ${session.meeting_url}` : `Google Meet: ${session.meeting_url}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.title,
    dates: `${startUTC}/${endUTC}`,
    details: details,
    location: session.meeting_url || '',
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generates a randomized, valid Google Meet URL structure (xxx-yyyy-zzz).
 */
export function generateClientGoogleMeetLink(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const randPart = (n: number) => {
    let res = '';
    for (let i = 0; i < n; i++) {
      res += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return res;
  };
  return `https://meet.google.com/${randPart(3)}-${randPart(4)}-${randPart(3)}`;
}
