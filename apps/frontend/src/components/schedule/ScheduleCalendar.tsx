import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Video } from 'lucide-react';
import type { ScheduleEvent } from './scheduleTypes';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// One colour per program when the schedule spans several programs
const PROGRAM_COLORS = ['bg-kulkul-purple', 'bg-sky-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500'];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

interface ScheduleCalendarProps {
  events: ScheduleEvent[];
}

/** Month calendar of sessions and assignment deadlines, with the selected day's items below. */
export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({ events }) => {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => dayKey(today));

  const eventsByDay = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const e of events) {
      const d = new Date(e.start);
      if (isNaN(d.getTime())) continue;
      (map[dayKey(d)] ||= []).push(e);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - last.getDay()));
    const list: Date[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) list.push(new Date(d));
    return list;
  }, [month]);

  // Programs in a stable order, each with its own colour
  const programs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) if (!seen.has(e.programId)) seen.set(e.programId, e.programName);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);
  const multiProgram = programs.length > 1;
  const programColor = (programId: string) =>
    PROGRAM_COLORS[Math.max(0, programs.findIndex((p) => p.id === programId)) % PROGRAM_COLORS.length];

  // Single program: colour by kind. Several programs: colour by program, shape by kind.
  const markerClass = (e: ScheduleEvent, size = 'w-1.5 h-1.5') =>
    `${size} shrink-0 ${multiProgram ? programColor(e.programId) : e.kind === 'session' ? 'bg-kulkul-purple' : 'bg-amber-500'} ${
      e.kind === 'session' ? 'rounded-full' : 'rounded-[2px]'
    }`;

  const todayKey = dayKey(today);
  const selectedEvents = eventsByDay[selectedKey] || [];
  const selectedDate = new Date(`${selectedKey}T00:00:00`);

  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="content-card space-y-5">
      <div className="section-header">
        <div>
          <h2 className="section-title">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          {multiProgram ? (
            <div className="section-subtitle space-y-1">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {programs.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${programColor(p.id)}`} /> {p.name}
                  </span>
                ))}
              </p>
              <p className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" /> Session
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-[2px] bg-slate-400" /> Assignment deadline
                </span>
              </p>
            </div>
          ) : (
            <p className="section-subtitle flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-kulkul-purple" /> Session
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-amber-500" /> Assignment deadline
              </span>
            </p>
          )}
        </div>
        <div className="section-actions">
          <button
            type="button"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedKey(todayKey);
            }}
            className="btn btn-sm btn-outline"
          >
            Today
          </button>
          <button type="button" onClick={() => shiftMonth(-1)} className="btn btn-sm btn-outline" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className="btn btn-sm btn-outline" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-2xs font-extrabold uppercase tracking-wider text-slate-500 text-center sm:text-left">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const key = dayKey(d);
            const dayEvents = eventsByDay[key] || [];
            const inMonth = d.getMonth() === month.getMonth();
            const isSelected = key === selectedKey;
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`min-h-[64px] sm:min-h-[104px] p-1.5 sm:p-2 text-left align-top flex flex-col gap-1 transition border-slate-100 ${
                  i % 7 !== 6 ? 'border-r' : ''
                } ${i < days.length - 7 ? 'border-b' : ''} ${
                  isSelected ? 'bg-purple-50/70' : inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    isToday ? 'bg-kulkul-purple text-white' : inMonth ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {d.getDate()}
                </span>

                {/* Phones: dots only */}
                {dayEvents.length > 0 && (
                  <span className="flex gap-1 sm:hidden">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span key={`${e.kind}-${e.id}`} className={markerClass(e)} />
                    ))}
                  </span>
                )}

                <span className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={`${e.kind}-${e.id}`} className="flex items-center gap-1 min-w-0 text-2xs">
                      <span className={markerClass(e)} />
                      <span className={`truncate ${e.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        <span className="text-slate-400">{timeLabel(e.start)}</span> {e.title}
                      </span>
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-2xs font-semibold text-slate-400">+{dayEvents.length - 3} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      <div className="space-y-2">
        <h3 className="subsection-title">
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        {selectedEvents.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing scheduled on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {selectedEvents.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="sm:w-32 shrink-0 text-xs font-bold text-slate-900">
                  {e.kind === 'assignment'
                    ? `Due ${timeLabel(e.start)}`
                    : `${timeLabel(e.start)}${e.end ? ` – ${timeLabel(e.end)}` : ''}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {e.kind === 'session' ? (
                      <Video className="w-4 h-4 text-kulkul-purple shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span className="text-sm font-bold text-slate-900 truncate">{e.title}</span>
                    {e.done && <span className="text-2xs font-bold text-emerald-700 shrink-0">Submitted</span>}
                  </div>
                  <div className="text-2xs text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                    {multiProgram && <span className={`w-2 h-2 rounded-full shrink-0 ${programColor(e.programId)}`} />}
                    <span className="truncate">
                      {e.programName}
                      {e.kind === 'assignment' ? ' · Assignment deadline' : e.subtitle ? ` · ${e.subtitle}` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {e.kind === 'session' && e.meetingUrl && (
                    <a href={e.meetingUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Join Call</span>
                    </a>
                  )}
                  {e.href && (
                    <Link to={e.href} className="btn btn-sm btn-primary">
                      {e.kind === 'session' ? 'Open Workspace' : 'View Assignment'}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
