import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardHome, rememberDashboard } from './dashboardHome';

describe('dashboard home', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });

  it('uses the role default when no dashboard was opened', () => {
    expect(dashboardHome('superadmin').path).toBe('/superadmin/dashboard');
    expect(dashboardHome('mentor')).toEqual({ path: '/mentor/dashboard', portal: 'mentor' });
    expect(dashboardHome('org_admin').path).toBe('/admin/dashboard');
    expect(dashboardHome(undefined).path).toBe('/candidate/dashboard');
  });

  it('returns a superadmin to the mentor dashboard they came from', () => {
    rememberDashboard('/mentor/dashboard');
    expect(dashboardHome('superadmin')).toEqual({ path: '/mentor/dashboard', portal: 'mentor' });
  });

  it('ignores a remembered dashboard the role cannot open, and non-dashboard pages', () => {
    rememberDashboard('/superadmin/dashboard');
    expect(dashboardHome('mentor').path).toBe('/mentor/dashboard');
    rememberDashboard('/sessions/1/room');
    expect(dashboardHome('mentor').path).toBe('/mentor/dashboard');
  });
});
