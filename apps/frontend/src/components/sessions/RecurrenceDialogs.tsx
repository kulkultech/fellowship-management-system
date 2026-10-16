import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { RecurrenceScope } from '@/services/types';
import {
  CustomRepeat,
  DAY_CODES,
  DayCode,
  RepeatFreq,
  customToRule,
  describeRule,
  nthOfMonth,
  ruleToCustom,
} from './recurrence';

const DAY_LETTERS: Record<DayCode, string> = { SU: 'S', MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S' };
const DAY_FULL: Record<DayCode, string> = {
  SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday',
};
const ORDINALS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const UNITS: Record<RepeatFreq, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };

/** Google Calendar's "Custom recurrence" dialog. */
export const CustomRecurrenceDialog: React.FC<{
  date: Date;
  initialRule: string;
  onCancel: () => void;
  onDone: (rule: string) => void;
}> = ({ date, initialRule, onCancel, onDone }) => {
  const [c, setC] = useState<CustomRepeat>(() => ruleToCustom(initialRule, date));
  const set = (patch: Partial<CustomRepeat>) => setC((prev) => ({ ...prev, ...patch }));
  const toggleDay = (d: DayCode) =>
    set({ byDay: c.byDay.includes(d) ? c.byDay.filter((x) => x !== d) : [...c.byDay, d] });
  const weekday = DAY_FULL[DAY_CODES[date.getDay()]];
  const rule = customToRule(c, date);
  const invalid = (c.freq === 'WEEKLY' && c.byDay.length === 0) || (c.ends === 'on' && !c.until) || c.interval < 1;

  return (
    <div className="modal-backdrop z-[60]" onClick={onCancel}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div>
            <h2 className="section-title">Custom recurrence</h2>
            <p className="section-subtitle">{invalid ? 'Choose at least one day' : describeRule(rule, date)}</p>
          </div>
          <button type="button" onClick={onCancel} className="btn btn-icon-sm btn-ghost" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <span className="field-label">Repeat every</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={99}
                value={c.interval}
                onChange={(e) => set({ interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                className="form-input w-20"
                aria-label="Repeat interval"
              />
              <select
                value={c.freq}
                onChange={(e) => set({ freq: e.target.value as RepeatFreq })}
                className="form-input w-auto"
                aria-label="Repeat unit"
              >
                {(Object.keys(UNITS) as RepeatFreq[]).map((f) => (
                  <option key={f} value={f}>
                    {UNITS[f]}
                    {c.interval === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {c.freq === 'WEEKLY' && (
            <div>
              <span className="field-label">Repeat on</span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Repeat on">
                {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as DayCode[]).map((d) => {
                  const on = c.byDay.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      aria-label={DAY_FULL[d]}
                      title={DAY_FULL[d]}
                      className={`w-9 h-9 rounded-full text-xs font-bold transition ${
                        on ? 'bg-kulkul-purple text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {DAY_LETTERS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {c.freq === 'MONTHLY' && (
            <div>
              <span className="field-label">On</span>
              <select
                value={c.monthlyMode}
                onChange={(e) => set({ monthlyMode: e.target.value as CustomRepeat['monthlyMode'] })}
                className="form-input"
                aria-label="Monthly on"
              >
                <option value="day">Monthly on day {date.getDate()}</option>
                <option value="nth">
                  Monthly on the {ORDINALS[nthOfMonth(date)]} {weekday}
                </option>
              </select>
            </div>
          )}

          <div>
            <span className="field-label">Ends</span>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="repeat-ends" checked={c.ends === 'never'} onChange={() => set({ ends: 'never' })} />
                <span>Never</span>
                <span className="meta-text">(sessions are created for the next 12 months)</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="repeat-ends" checked={c.ends === 'on'} onChange={() => set({ ends: 'on' })} />
                <span className="w-12">On</span>
                <input
                  type="date"
                  value={c.until}
                  disabled={c.ends !== 'on'}
                  onChange={(e) => set({ until: e.target.value })}
                  className="form-input w-auto disabled:opacity-50"
                  aria-label="End date"
                />
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="repeat-ends" checked={c.ends === 'after'} onChange={() => set({ ends: 'after' })} />
                <span className="w-12">After</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={c.count}
                  disabled={c.ends !== 'after'}
                  onChange={(e) => set({ count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                  className="form-input w-20 disabled:opacity-50"
                  aria-label="Number of occurrences"
                />
                <span>occurrences</span>
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onCancel} className="btn btn-sm btn-outline">
            Cancel
          </button>
          <button type="button" disabled={invalid} onClick={() => onDone(rule)} className="btn btn-sm btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/** Google Calendar's "Edit / Delete recurring event" choice. */
export const RecurrenceScopeDialog: React.FC<{
  mode: 'edit' | 'delete';
  allowThis?: boolean; // hidden when the repeat itself changed, as in Google Calendar
  onCancel: () => void;
  onConfirm: (scope: RecurrenceScope) => void;
}> = ({ mode, allowThis = true, onCancel, onConfirm }) => {
  const [scope, setScope] = useState<RecurrenceScope>(allowThis ? 'this' : 'following');
  const options: { value: RecurrenceScope; label: string }[] = [
    ...(allowThis ? [{ value: 'this' as const, label: 'This session' }] : []),
    { value: 'following', label: 'This and following sessions' },
    { value: 'all', label: 'All sessions' },
  ];
  return (
    <div className="modal-backdrop z-[60]" onClick={onCancel}>
      <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <h2 className="section-title">{mode === 'edit' ? 'Edit recurring session' : 'Delete recurring session'}</h2>
          <button type="button" onClick={onCancel} className="btn btn-icon-sm btn-ghost" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3" role="radiogroup">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input type="radio" name="recurrence-scope" checked={scope === o.value} onChange={() => setScope(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
          {mode === 'delete' && scope !== 'this' && (
            <p className="meta-text">Attendance and feedback of the deleted sessions are removed too.</p>
          )}
          {mode === 'edit' && scope !== 'this' && (
            <p className="meta-text">Sessions that already happened keep their date and time.</p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onCancel} className="btn btn-sm btn-outline">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(scope)}
            className={`btn btn-sm ${mode === 'delete' ? 'btn-danger' : 'btn-primary'}`}
          >
            {mode === 'delete' ? 'Delete' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
