import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
  Calendar as CalendarIcon,
} from 'lucide-react';
import type { ProgramSession } from '@/services/types';
import {
  getIndonesianHoliday,
  isSunday,
  normalizeDateString,
} from '@/utils/indonesianHolidays';

interface IndonesianCalendarViewProps {
  sessions: ProgramSession[];
  onSelectDateToSchedule: (dateStr: string) => void;
  onSelectSession: (session: ProgramSession) => void;
  isMentorOrAdmin: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = [
  { short: 'Sun', full: 'Sunday', isHolidayCol: true },
  { short: 'Mon', full: 'Monday', isHolidayCol: false },
  { short: 'Tue', full: 'Tuesday', isHolidayCol: false },
  { short: 'Wed', full: 'Wednesday', isHolidayCol: false },
  { short: 'Thu', full: 'Thursday', isHolidayCol: false },
  { short: 'Fri', full: 'Friday', isHolidayCol: false },
  { short: 'Sat', full: 'Saturday', isHolidayCol: false },
];

export const IndonesianCalendarView: React.FC<IndonesianCalendarViewProps> = ({
  sessions,
  onSelectDateToSchedule,
  onSelectSession,
  isMentorOrAdmin,
}) => {
  // If there are sessions, center calendar around first session's month or current month
  const initialDate = useMemo(() => {
    if (sessions.length > 0) {
      const first = new Date(sessions[0].start_time);
      if (!isNaN(first.getTime())) return first;
    }
    return new Date();
  }, [sessions]);

  const [currentYear, setCurrentYear] = useState<number>(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialDate.getMonth()); // 0-indexed

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Reset to today's month
  const handleToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  // Map sessions by YYYY-MM-DD
  const sessionsByDate = useMemo(() => {
    const map: Record<string, ProgramSession[]> = {};
    sessions.forEach((s) => {
      try {
        const dateKey = normalizeDateString(s.start_time);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(s);
      } catch {
        // ignore invalid dates
      }
    });
    return map;
  }, [sessions]);

  // Compute days matrix for the month
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
    const startDayOfWeek = firstDayOfMonth.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
    const daysInPrevMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

    const days: Array<{
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSunday: boolean;
      holiday: { isHoliday: boolean; name?: string };
      sessions: ProgramSession[];
      isToday: boolean;
    }> = [];

    const todayStr = normalizeDateString(new Date());

    // 1. Previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDayNum = daysInPrevMonth - i;
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const mm = String(prevMonthIdx + 1).padStart(2, '0');
      const dd = String(prevDayNum).padStart(2, '0');
      const dateStr = `${prevYear}-${mm}-${dd}`;

      days.push({
        dateString: dateStr,
        dayNumber: prevDayNum,
        isCurrentMonth: false,
        isSunday: isSunday(dateStr),
        holiday: getIndonesianHoliday(dateStr),
        sessions: sessionsByDate[dateStr] || [],
        isToday: dateStr === todayStr,
      });
    }

    // 2. Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(currentMonth + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${currentYear}-${mm}-${dd}`;

      days.push({
        dateString: dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        isSunday: isSunday(dateStr),
        holiday: getIndonesianHoliday(dateStr),
        sessions: sessionsByDate[dateStr] || [],
        isToday: dateStr === todayStr,
      });
    }

    // 3. Next month leading days to complete grid (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const mm = String(nextMonthIdx + 1).padStart(2, '0');
      const dd = String(i).padStart(2, '0');
      const dateStr = `${nextYear}-${mm}-${dd}`;

      days.push({
        dateString: dateStr,
        dayNumber: i,
        isCurrentMonth: false,
        isSunday: isSunday(dateStr),
        holiday: getIndonesianHoliday(dateStr),
        sessions: sessionsByDate[dateStr] || [],
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [currentYear, currentMonth, sessionsByDate]);

  // Count holidays in current month
  const currentMonthHolidays = useMemo(() => {
    return calendarDays
      .filter((d) => d.isCurrentMonth && d.holiday.isHoliday)
      .map((d) => ({
        date: d.dateString,
        day: d.dayNumber,
        name: d.holiday.name || 'Public Holiday',
      }));
  }, [calendarDays]);

  return (
    <div className="space-y-6">
      {/* Top Calendar Toolbar */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-kulkul-purple/10 text-kulkul-purple flex items-center justify-center">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>{MONTH_NAMES[currentMonth]}</span>
              <span>{currentYear}</span>
            </h2>
            <p className="text-2xs text-slate-500 font-medium">
              Indonesian National Calendar &bull; Public Holidays &amp; Session Scheduling
            </p>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToday}
            className="btn btn-sm btn-outline border-slate-200 text-slate-700 hover:bg-slate-100 font-bold"
          >
            Today
          </button>

          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Calendar Grid */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-black uppercase tracking-wider select-none">
          {WEEKDAY_NAMES.map((w, idx) => (
            <div
              key={idx}
              className={w.isHolidayCol ? 'text-rose-600 font-black' : 'text-slate-600'}
            >
              <span className="hidden sm:inline">{w.full}</span>
              <span className="sm:hidden">{w.short}</span>
            </div>
          ))}
        </div>

        {/* Calendar Days Matrix */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100/50">
          {calendarDays.map((dayItem, idx) => {
            const isRedDay = dayItem.isSunday || dayItem.holiday.isHoliday;
            const isNationalHoliday = dayItem.holiday.isHoliday;

            return (
              <div
                key={idx}
                className={`min-h-[120px] sm:min-h-[140px] p-2 flex flex-col justify-between transition-colors ${
                  !dayItem.isCurrentMonth
                    ? 'bg-slate-50/60 text-slate-400'
                    : isNationalHoliday
                    ? 'bg-rose-50/40 hover:bg-rose-50/70'
                    : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${
                      dayItem.isToday
                        ? 'bg-kulkul-purple text-white shadow-xs'
                        : isRedDay
                        ? 'text-rose-600 font-black'
                        : dayItem.isCurrentMonth
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {dayItem.dayNumber}
                  </span>

                  {/* Holiday Badge or Schedule Action */}
                  {isNationalHoliday ? (
                    <span className="text-2xs font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 tracking-tight">
                      Holiday
                    </span>
                  ) : isMentorOrAdmin && dayItem.isCurrentMonth ? (
                    <button
                      type="button"
                      onClick={() => onSelectDateToSchedule(dayItem.dateString)}
                      className="opacity-0 hover:opacity-100 focus:opacity-100 transition p-1 text-slate-400 hover:text-kulkul-purple hover:bg-slate-100 rounded-lg"
                      title={`Schedule session on ${dayItem.dateString}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* Body: Holiday Name or Scheduled Sessions */}
                <div className="flex-1 my-1.5 space-y-1 overflow-y-auto max-h-[85px] scrollbar-none">
                  {/* Holiday Notice */}
                  {isNationalHoliday && (
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold leading-tight">
                      <div className="line-clamp-2">{dayItem.holiday.name}</div>
                      <div className="text-rose-600 font-medium text-2xs pt-0.5">
                        Public Holiday &bull; Closed
                      </div>
                    </div>
                  )}

                  {/* Sessions on this Day */}
                  {dayItem.sessions.map((sess) => {
                    const startTimeStr = new Date(sess.start_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <button
                        key={sess.id}
                        type="button"
                        onClick={() => onSelectSession(sess)}
                        className="w-full text-left p-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/80 text-purple-900 text-xs transition shadow-2xs space-y-0.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-1 font-bold truncate">
                          <Clock className="w-3 h-3 text-kulkul-purple shrink-0" />
                          <span>{startTimeStr}</span>
                          <span className="truncate">{sess.title}</span>
                        </div>
                        {sess.mentor_name && (
                          <div className="text-2xs text-purple-700 truncate">
                            {sess.mentor_name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Day Footer Action for Mentors */}
                {isMentorOrAdmin && dayItem.isCurrentMonth && !isNationalHoliday && dayItem.sessions.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDateToSchedule(dayItem.dateString)}
                    className="w-full py-1 text-xs font-bold text-slate-400 hover:text-kulkul-purple transition text-center border border-dashed border-slate-200 hover:border-kulkul-purple rounded-lg cursor-pointer"
                  >
                    + Schedule
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Holiday Summary & Legend Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Holidays list in current month */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>Public Holidays ({MONTH_NAMES[currentMonth]} {currentYear})</span>
          </div>

          {currentMonthHolidays.length === 0 ? (
            <p className="text-xs text-slate-500">
              No public holidays this month. All weekdays are open for session scheduling.
            </p>
          ) : (
            <div className="space-y-1.5">
              {currentMonthHolidays.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-900"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-rose-700 w-6 text-center">
                      {h.day}
                    </span>
                    <span className="font-semibold">{h.name}</span>
                  </div>
                  <span className="text-2xs uppercase font-extrabold px-2 py-0.5 rounded-full bg-rose-200/70 text-rose-800">
                    Holiday
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Calendar Legend & Instructions */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="text-slate-900 font-extrabold text-xs">
            Fellowship Scheduling Guidelines
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
              <span>
                <strong>Public Holidays:</strong> Mentors cannot schedule cohort sessions on official Indonesian public holidays.
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-kulkul-purple shrink-0" />
              <span>
                <strong>Active Cohort Sessions:</strong> Click a session chip to view details or launch the Workspace (Code Studio, Whiteboard, &amp; Notes).
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
              <span>
                <strong>Available Weekdays:</strong> Click "+ Schedule" on any open date to create a new session.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
