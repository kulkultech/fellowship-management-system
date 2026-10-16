// Repeat rules for sessions, in the RFC 5545 RRULE form Google Calendar uses
// (e.g. "FREQ=WEEKLY;BYDAY=MO"). The backend expands them into sessions.

export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom';
export type RepeatFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type DayCode = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export const DAY_CODES: DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
// Monday-first order for lists, like Google Calendar in Indonesia
const MONDAY_FIRST: DayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface CustomRepeat {
  freq: RepeatFreq;
  interval: number;
  byDay: DayCode[]; // weekly
  monthlyMode: 'day' | 'nth'; // monthly: on day 15, or on the third Thursday
  ends: 'never' | 'on' | 'after';
  until: string; // YYYY-MM-DD
  count: number;
}

/** Parses "YYYY-MM-DD" as a local date (not UTC). */
export const parseLocalDate = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const toLocalDateValue = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
};

/** Which occurrence of its weekday a date is in the month (1-4), or -1 for a fifth one ("last"), as Google Calendar does. */
export const nthOfMonth = (d: Date): number => {
  const n = Math.ceil(d.getDate() / 7);
  return n >= 5 ? -1 : n;
};

const dayCode = (d: Date): DayCode => DAY_CODES[d.getDay()];
const dayName = (code: DayCode) => DAY_NAMES[DAY_CODES.indexOf(code)];

export const presetRule = (preset: RepeatPreset, date: Date): string => {
  switch (preset) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${dayCode(date)}`;
    case 'monthly':
      return `FREQ=MONTHLY;BYDAY=${nthOfMonth(date)}${dayCode(date)}`;
    case 'yearly':
      return 'FREQ=YEARLY';
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    default:
      return '';
  }
};

export const presetLabel = (preset: RepeatPreset, date: Date): string => {
  switch (preset) {
    case 'none':
      return 'Does not repeat';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return `Weekly on ${DAY_NAMES[date.getDay()]}`;
    case 'monthly':
      return `Monthly on the ${ORDINALS[nthOfMonth(date)]} ${DAY_NAMES[date.getDay()]}`;
    case 'yearly':
      return `Annually on ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    case 'weekdays':
      return 'Every weekday (Monday to Friday)';
    default:
      return 'Custom…';
  }
};

export const PRESETS: RepeatPreset[] = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom'];

const parts = (rule: string): Record<string, string> => {
  const out: Record<string, string> = {};
  rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter(Boolean)
    .forEach((p) => {
      const [k, v] = p.split('=');
      if (k && v) out[k.toUpperCase()] = v.toUpperCase();
    });
  return out;
};

/** Puts a rule in the backend's canonical form so equal rules compare equal. */
export const normalizeRule = (rule: string): string => {
  if (!rule.trim()) return '';
  const p = parts(rule);
  const out = [`FREQ=${p.FREQ}`];
  if (p.INTERVAL && p.INTERVAL !== '1') out.push(`INTERVAL=${p.INTERVAL}`);
  if (p.BYDAY) {
    const days = p.BYDAY.split(',');
    const plain = days.every((d) => d.length === 2);
    out.push(
      `BYDAY=${plain ? [...days].sort((a, b) => MONDAY_FIRST.indexOf(a as DayCode) - MONDAY_FIRST.indexOf(b as DayCode)).join(',') : days.join(',')}`
    );
  }
  if (p.BYMONTHDAY) out.push(`BYMONTHDAY=${p.BYMONTHDAY}`);
  if (p.COUNT) out.push(`COUNT=${p.COUNT}`);
  if (p.UNTIL) out.push(`UNTIL=${p.UNTIL.slice(0, 8)}`);
  return out.join(';');
};

/** Which dropdown entry a rule matches for this start date. */
export const ruleToPreset = (rule: string, date: Date): RepeatPreset => {
  const norm = normalizeRule(rule);
  if (!norm) return 'none';
  for (const preset of ['daily', 'weekly', 'monthly', 'yearly', 'weekdays'] as RepeatPreset[]) {
    if (normalizeRule(presetRule(preset, date)) === norm) return preset;
  }
  return 'custom';
};

export const defaultCustom = (date: Date): CustomRepeat => {
  const until = new Date(date.getFullYear(), date.getMonth() + 3, date.getDate());
  return { freq: 'WEEKLY', interval: 1, byDay: [dayCode(date)], monthlyMode: 'day', ends: 'never', until: toLocalDateValue(until), count: 10 };
};

export const ruleToCustom = (rule: string, date: Date): CustomRepeat => {
  const base = defaultCustom(date);
  if (!rule.trim()) return base;
  const p = parts(rule);
  const byDay = (p.BYDAY || '').split(',').filter(Boolean);
  const nth = byDay.length === 1 && byDay[0].length > 2;
  return {
    ...base,
    freq: (p.FREQ as RepeatFreq) || 'WEEKLY',
    interval: Number(p.INTERVAL || 1),
    byDay: !nth && byDay.length > 0 ? (byDay as DayCode[]) : base.byDay,
    monthlyMode: nth ? 'nth' : 'day',
    ends: p.COUNT ? 'after' : p.UNTIL ? 'on' : 'never',
    until: p.UNTIL ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : base.until,
    count: p.COUNT ? Number(p.COUNT) : base.count,
  };
};

export const customToRule = (c: CustomRepeat, date: Date): string => {
  const out = [`FREQ=${c.freq}`];
  if (c.interval > 1) out.push(`INTERVAL=${c.interval}`);
  if (c.freq === 'WEEKLY') {
    const days = c.byDay.length > 0 ? c.byDay : [dayCode(date)];
    out.push(`BYDAY=${[...days].sort((a, b) => MONDAY_FIRST.indexOf(a) - MONDAY_FIRST.indexOf(b)).join(',')}`);
  }
  if (c.freq === 'MONTHLY') {
    out.push(c.monthlyMode === 'nth' ? `BYDAY=${nthOfMonth(date)}${dayCode(date)}` : `BYMONTHDAY=${date.getDate()}`);
  }
  if (c.ends === 'after') out.push(`COUNT=${Math.max(1, c.count)}`);
  if (c.ends === 'on' && c.until) out.push(`UNTIL=${c.until.replace(/-/g, '')}`);
  return out.join(';');
};

const plural = (n: number, unit: string) => (n === 1 ? unit : `${n} ${unit}s`);

/** Google Calendar style summary, e.g. "Weekly on Monday and Wednesday, 10 times". */
export const describeRule = (rule: string, date: Date): string => {
  const norm = normalizeRule(rule);
  if (!norm) return 'Does not repeat';
  const p = parts(norm);
  const interval = Number(p.INTERVAL || 1);
  const byDay = (p.BYDAY || '').split(',').filter(Boolean);
  let text = '';
  switch (p.FREQ) {
    case 'DAILY':
      text = interval === 1 ? 'Daily' : `Every ${plural(interval, 'day')}`;
      break;
    case 'WEEKLY': {
      const days = (byDay.length ? byDay : [dayCode(date)]) as DayCode[];
      const names = days.map(dayName);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      if (interval === 1 && days.join(',') === 'MO,TU,WE,TH,FR') text = 'Every weekday (Monday to Friday)';
      else text = interval === 1 ? `Weekly on ${list}` : `Every ${plural(interval, 'week')} on ${list}`;
      break;
    }
    case 'MONTHLY': {
      const prefix = interval === 1 ? 'Monthly' : `Every ${plural(interval, 'month')}`;
      if (byDay.length === 1 && byDay[0].length > 2) {
        const n = Number(byDay[0].slice(0, -2));
        text = `${prefix} on the ${ORDINALS[n]} ${dayName(byDay[0].slice(-2) as DayCode)}`;
      } else {
        text = `${prefix} on day ${p.BYMONTHDAY || date.getDate()}`;
      }
      break;
    }
    case 'YEARLY':
      text = `${interval === 1 ? 'Annually' : `Every ${plural(interval, 'year')}`} on ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
      break;
  }
  if (p.COUNT) text += Number(p.COUNT) === 1 ? ', once' : `, ${p.COUNT} times`;
  else if (p.UNTIL)
    text += `, until ${parseLocalDate(`${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return text;
};
