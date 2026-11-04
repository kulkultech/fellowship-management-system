/** Links people can paste into chat to open a program room section, an item in it, or a live workspace. */

export type RoomSection = 'assignments' | 'sessions' | 'curriculum' | 'resources';

export const ROOM_SECTIONS: RoomSection[] = ['assignments', 'sessions', 'curriculum', 'resources'];

const absolute = (path: string) => `${window.location.origin}${path}`;

export function roomPath(orgSlug: string, programSlug: string, section?: RoomSection, itemId?: string): string {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (itemId) params.set('item', itemId);
  const query = params.toString();
  return `/programs/${orgSlug}/${programSlug}/room${query ? `?${query}` : ''}`;
}

export const roomLink = (orgSlug: string, programSlug: string, section?: RoomSection, itemId?: string) =>
  absolute(roomPath(orgSlug, programSlug, section, itemId));

export const workspaceLink = (sessionId: string) => absolute(`/sessions/${sessionId}/room`);

/** Where to send someone who opened a shared link while signed out, so they come back to it. */
export const loginPathFor = (location: { pathname: string; search: string }) =>
  `/login?return_to=${encodeURIComponent(location.pathname + location.search)}`;

/** A return_to value is followed only when it is a page on this site. */
export function safeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or a page without clipboard permission
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}
