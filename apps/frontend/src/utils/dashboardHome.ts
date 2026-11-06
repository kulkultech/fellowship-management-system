/**
 * Which dashboard "Back to Dashboard" returns to. Someone with several dashboards (a superadmin who
 * also mentors) goes back to the one they last used, not the one their role points to by default.
 */
export type Portal = 'mentor' | 'superadmin' | 'company_admin' | 'candidate';

const KEY = 'fellowhire:last-dashboard';

const DASHBOARDS: { path: string; portal: Portal; roles: string[] }[] = [
  { path: '/mentor/dashboard', portal: 'mentor', roles: ['mentor', 'org_admin', 'superadmin'] },
  { path: '/superadmin/dashboard', portal: 'superadmin', roles: ['superadmin'] },
  { path: '/admin/dashboard', portal: 'company_admin', roles: ['org_admin', 'reviewer', 'superadmin'] },
  { path: '/candidate/dashboard', portal: 'candidate', roles: ['candidate'] },
];

function defaultFor(role?: string) {
  if (role === 'mentor') return DASHBOARDS[0];
  if (role === 'superadmin') return DASHBOARDS[1];
  if (role === 'org_admin' || role === 'reviewer') return DASHBOARDS[2];
  return DASHBOARDS[3];
}

/** Notes the dashboard just opened, if the path is one. */
export function rememberDashboard(pathname: string): void {
  if (!DASHBOARDS.some((d) => d.path === pathname)) return;
  try {
    sessionStorage.setItem(KEY, pathname);
  } catch {
    // Storage blocked: fall back to the role's dashboard
  }
}

/** The dashboard to go back to, and the portal look that goes with it. */
export function dashboardHome(role?: string): { path: string; portal: Portal } {
  let last: string | null = null;
  try {
    last = sessionStorage.getItem(KEY);
  } catch {
    last = null;
  }
  const remembered = DASHBOARDS.find((d) => d.path === last && role && d.roles.includes(role));
  const home = remembered || defaultFor(role);
  return { path: home.path, portal: home.portal };
}
