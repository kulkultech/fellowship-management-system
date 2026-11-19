import { describe, it, expect } from 'vitest';
import { sessionStatus } from './sessionStatus';

describe('sessionStatus', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const session = (start: string, end: string, ended_at?: string) => ({ start_time: start, end_time: end, ended_at });

  it('is upcoming before it starts', () => {
    expect(sessionStatus(session('2026-11-19T13:00:00Z', '2026-11-19T15:00:00Z'), now)).toBe('upcoming');
  });

  it('is live while it runs', () => {
    expect(sessionStatus(session('2026-11-19T11:00:00Z', '2026-11-19T13:00:00Z'), now)).toBe('live');
  });

  it('has ended once its time is over', () => {
    expect(sessionStatus(session('2026-11-19T09:00:00Z', '2026-11-19T12:00:00Z'), now)).toBe('ended');
  });

  it('has ended as soon as the mentor ends it, even early', () => {
    expect(sessionStatus(session('2026-11-19T11:00:00Z', '2026-11-19T13:00:00Z', '2026-11-19T11:50:00Z'), now)).toBe('ended');
  });
});
