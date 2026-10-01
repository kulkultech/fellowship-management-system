import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
  Calendar as CalendarIcon,
  Globe,
  LayoutGrid,
  List,
  Video,
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
  syncIndonesianCalendar?: boolean;
  onToggleSyncIndonesianCalendar?: (val: boolean) => void;
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
  syncIndonesianCalendar = true,
  onToggleSyncIndonesianCalendar,
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
  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => normalizeDateString(new Date()));

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
    setSelectedDateStr(normalizeDateString(now));
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

  // Count holidays in current month (only if sync is active)
  const currentMonthHolidays = useMemo(() => {
    if (!syncIndonesianCalendar) return [];
    return calendarDays
      .filter((d) => d.isCurrentMonth && d.holiday.isHoliday)
      .map((d) => ({
        date: d.dateString,
        day: d.dayNumber,
        name: d.holiday.name || 'Public Holiday',
      }));
  }, [calendarDays, syncIndonesianCalendar]);

  // Agenda items in current month
  const currentMonthAgenda = useMemo(() => {
    return calendarDays
      .filter((d) => d.isCurrentMonth && (d.sessions.length > 0 || (syncIndonesianCalendar && d.holiday.isHoliday)))
      .map((d) => {
        const dateObj = new Date(d.dateString + 'T00:00:00Z');
        const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        return {
          ...d,
          weekdayShort,
          monthShort,
        };
      });
  }, [calendarDays, syncIndonesianCalendar]);

  // Selected day details for mobile quick view under grid
  const selectedDayItem = useMemo(() => {
    return calendarDays.find((d) => d.dateString === selectedDateStr);
  }, [calendarDays, selectedDateStr]);

  return (
    <div className="space-y-6">
      {/* Top Calendar Toolbar */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Row 1: Calendar Title, Synced Badge & View Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                syncIndonesianCalendar
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-kulkul-purple/10 text-kulkul-purple'
              }`}
            >
              {syncIndonesianCalendar ? (
                <CalendarIcon className="w-5 h-5" />
              ) : (
                <Globe className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>{MONTH_NAMES[currentMonth]}</span>
                  <span>{currentYear}</span>
                </h2>
                {syncIndonesianCalendar ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-rose-100 text-rose-800">
                    ID Holidays Synced
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-slate-100 text-slate-700">
                    International Mode
                  </span>
                )}
              </div>
              <p className="text-2xs text-slate-500 font-medium">
                {syncIndonesianCalendar
                  ? 'Indonesian National Calendar • Public Holidays & Session Scheduling'
                  : 'Standard International Calendar • Global Scheduling'}
              </p>
            </div>
          </div>

          {/* View Switcher: Grid vs Agenda */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda View</span>
            </button>
          </div>
        </div>

        {/* Row 2: Sync Toggle & Month Navigation Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Admin / Mentor Sync Toggle */}
          {isMentorOrAdmin && onToggleSyncIndonesianCalendar ? (
            <div className="flex items-center justify-between sm:justify-start gap-3 bg-slate-50 border border-slate-200/80 px-3.5 py-1.5 rounded-2xl w-full sm:w-auto">
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  Sync Indonesian Calendar
                </span>
                <span className="text-2xs text-slate-500 font-medium">
                  {syncIndonesianCalendar
                    ? 'National holidays active'
                    : 'Disabled for global clients'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={syncIndonesianCalendar}
                onClick={() => onToggleSyncIndonesianCalendar(!syncIndonesianCalendar)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  syncIndonesianCalendar ? 'bg-kulkul-purple' : 'bg-slate-300'
                }`}
                title={
                  syncIndonesianCalendar
                    ? 'Click to disable Indonesian calendar sync'
                    : 'Click to enable Indonesian calendar sync'
                }
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    syncIndonesianCalendar ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : <div />}

          {/* Month Navigation Buttons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
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
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-bold text-slate-700 sm:hidden">
                {MONTH_NAMES[currentMonth].slice(0, 3)} {currentYear}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: Main Calendar Grid */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Horizontal scroll container with protected min-width */}
            <div className="overflow-x-auto scrollbar-thin">
              <div className="min-w-[620px] sm:min-w-0">
                {/* Weekday Header */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-black uppercase tracking-wider select-none">
                  {WEEKDAY_NAMES.map((w, idx) => (
                    <div
                      key={idx}
                      className={
                        syncIndonesianCalendar && w.isHolidayCol
                          ? 'text-rose-600 font-black'
                          : 'text-slate-600'
                      }
                    >
                      <span className="hidden sm:inline">{w.full}</span>
                      <span className="sm:hidden">{w.short}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Days Matrix */}
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100/50">
                  {calendarDays.map((dayItem, idx) => {
                    const isRedDay =
                      syncIndonesianCalendar && (dayItem.isSunday || dayItem.holiday.isHoliday);
                    const isNationalHoliday =
                      syncIndonesianCalendar && dayItem.holiday.isHoliday;
                    const isSelected = dayItem.dateString === selectedDateStr;

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDateStr(dayItem.dateString)}
                        className={`min-h-[105px] sm:min-h-[140px] p-1.5 sm:p-2 flex flex-col justify-between transition cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-kulkul-purple ring-inset bg-purple-50/25'
                            : ''
                        } ${
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
                            className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-extrabold ${
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
                            <span className="text-3xs sm:text-2xs font-extrabold uppercase px-1.5 sm:px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 tracking-tight shrink-0">
                              Holiday
                            </span>
                          ) : isMentorOrAdmin && dayItem.isCurrentMonth ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectDateToSchedule(dayItem.dateString);
                              }}
                              className="opacity-0 hover:opacity-100 focus:opacity-100 transition p-1 text-slate-400 hover:text-kulkul-purple hover:bg-slate-100 rounded-lg cursor-pointer"
                              title={`Schedule session on ${dayItem.dateString}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>

                        {/* Body: Holiday Name or Scheduled Sessions */}
                        <div className="flex-1 my-1 sm:my-1.5 space-y-1 overflow-y-auto max-h-[75px] sm:max-h-[85px] scrollbar-none">
                          {/* Holiday Notice */}
                          {isNationalHoliday && (
                            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-3xs sm:text-xs font-bold leading-tight">
                              <div className="line-clamp-2">{dayItem.holiday.name}</div>
                              <div className="text-rose-600 font-medium text-3xs sm:text-2xs pt-0.5 hidden sm:block">
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSession(sess);
                                }}
                                className="w-full text-left p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/80 text-purple-900 text-3xs sm:text-xs transition shadow-2xs space-y-0.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-1 font-bold truncate">
                                  <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-kulkul-purple shrink-0" />
                                  <span>{startTimeStr}</span>
                                  <span className="truncate">{sess.title}</span>
                                </div>
                                {sess.mentor_name && (
                                  <div className="text-3xs sm:text-2xs text-purple-700 truncate hidden sm:block">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDateToSchedule(dayItem.dateString);
                            }}
                            className="w-full py-0.5 sm:py-1 text-3xs sm:text-xs font-bold text-slate-400 hover:text-kulkul-purple transition text-center border border-dashed border-slate-200 hover:border-kulkul-purple rounded-lg cursor-pointer"
                          >
                            + Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Selected Date Quick Card for Mobile view */}
          {selectedDayItem && (
            <div className="block sm:hidden bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-kulkul-purple/10 text-kulkul-purple flex items-center justify-center font-bold text-xs">
                    {selectedDayItem.dayNumber}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">
                      {new Date(selectedDayItem.dateString + 'T00:00:00Z').toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </h4>
                    <p className="text-2xs text-slate-500">
                      {selectedDayItem.sessions.length} session{selectedDayItem.sessions.length === 1 ? '' : 's'} scheduled
                    </p>
                  </div>
                </div>

                {isMentorOrAdmin && (!syncIndonesianCalendar || !selectedDayItem.holiday.isHoliday) && (
                  <button
                    type="button"
                    onClick={() => onSelectDateToSchedule(selectedDayItem.dateString)}
                    className="btn btn-xs bg-kulkul-purple text-white font-bold"
                  >
                    + Schedule
                  </button>
                )}
              </div>

              {syncIndonesianCalendar && selectedDayItem.holiday.isHoliday && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  <div className="font-extrabold">{selectedDayItem.holiday.name}</div>
                  <div className="text-2xs text-rose-600 mt-0.5">Indonesian Public Holiday &bull; Closed</div>
                </div>
              )}

              {selectedDayItem.sessions.length > 0 ? (
                <div className="space-y-2">
                  {selectedDayItem.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      onClick={() => onSelectSession(sess)}
                      className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 text-purple-900 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{sess.title}</div>
                        <div className="text-2xs text-purple-700 flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3 text-kulkul-purple shrink-0" />
                          <span>
                            {new Date(sess.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &ndash;{' '}
                            {new Date(sess.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {sess.mentor_name && <span>&bull; {sess.mentor_name}</span>}
                        </div>
                      </div>
                      <span className="text-2xs font-extrabold text-kulkul-purple bg-white px-2 py-1 rounded-lg border border-purple-200 shrink-0">
                        View
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No cohort sessions scheduled on this date.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: Agenda List View */}
      {viewMode === 'agenda' && (
        <div className="space-y-3">
          {currentMonthAgenda.length === 0 ? (
            <div className="bg-white rounded-2xl sm:rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center mx-auto">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-800">
                No Events in {MONTH_NAMES[currentMonth]} {currentYear}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                There are no public holidays or scheduled sessions recorded for this month.
              </p>
              {isMentorOrAdmin && (
                <button
                  type="button"
                  onClick={() => onSelectDateToSchedule(normalizeDateString(new Date()))}
                  className="btn btn-sm bg-kulkul-purple text-white font-bold"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Schedule First Session
                </button>
              )}
            </div>
          ) : (
            currentMonthAgenda.map((agendaDay) => {
              const isNationalHoliday = syncIndonesianCalendar && agendaDay.holiday.isHoliday;

              return (
                <div
                  key={agendaDay.dateString}
                  className={`bg-white rounded-2xl sm:rounded-3xl border p-4 sm:p-5 shadow-sm transition flex flex-col sm:flex-row items-start gap-4 ${
                    isNationalHoliday
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {/* Date Badge */}
                  <div className="flex sm:flex-col items-center gap-1.5 sm:gap-0.5 sm:w-16 shrink-0 bg-slate-50 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
                    <span className="text-xs sm:text-2xs font-black uppercase text-slate-500">
                      {agendaDay.weekdayShort}
                    </span>
                    <span
                      className={`text-base sm:text-2xl font-black ${
                        isNationalHoliday ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {agendaDay.dayNumber}
                    </span>
                    <span className="text-2xs text-slate-400 font-bold sm:block">
                      {agendaDay.monthShort}
                    </span>
                  </div>

                  {/* Day Content: Holiday & Sessions */}
                  <div className="flex-1 w-full space-y-3">
                    {/* Holiday Alert */}
                    {isNationalHoliday && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="font-extrabold">{agendaDay.holiday.name}</span>
                          <span className="text-2xs text-rose-600 block">Indonesian National Holiday &bull; Closed</span>
                        </div>
                        <span className="text-2xs uppercase font-extrabold px-2 py-0.5 rounded-full bg-rose-200/70 text-rose-800 shrink-0">
                          Holiday
                        </span>
                      </div>
                    )}

                    {/* Sessions List */}
                    {agendaDay.sessions.length > 0 && (
                      <div className="space-y-2">
                        {agendaDay.sessions.map((sess) => {
                          const startTimeStr = new Date(sess.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const endTimeStr = new Date(sess.end_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <div
                              key={sess.id}
                              className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-purple-200/90 bg-purple-50/50 hover:bg-purple-50 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                                    {sess.title}
                                  </h4>
                                  <span className="text-2xs font-extrabold uppercase px-2 py-0.5 rounded-md bg-purple-100 text-kulkul-purple">
                                    {sess.session_type.replace('_', ' ')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-2xs text-slate-500 flex-wrap">
                                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                                    <Clock className="w-3 h-3 text-kulkul-purple" />
                                    {startTimeStr} &ndash; {endTimeStr}
                                  </span>
                                  {sess.mentor_name && (
                                    <span>Mentor: <strong>{sess.mentor_name}</strong></span>
                                  )}
                                  {sess.meeting_url && (
                                    <a
                                      href={sess.meeting_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-kulkul-purple hover:underline font-bold"
                                    >
                                      <Video className="w-3 h-3" />
                                      <span>Join Call</span>
                                    </a>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                                <button
                                  type="button"
                                  onClick={() => onSelectSession(sess)}
                                  className="btn btn-xs sm:btn-sm btn-outline text-kulkul-purple border-purple-300 font-bold"
                                >
                                  View Details
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Schedule on this date action */}
                    {isMentorOrAdmin && (!syncIndonesianCalendar || !agendaDay.holiday.isHoliday) && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => onSelectDateToSchedule(agendaDay.dateString)}
                          className="text-xs font-bold text-kulkul-purple hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Schedule session on {agendaDay.monthShort} {agendaDay.dayNumber}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Holiday Summary & Legend Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {syncIndonesianCalendar ? (
          <>
            {/* Left: Holidays list in current month */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>
                  Public Holidays ({MONTH_NAMES[currentMonth]} {currentYear})
                </span>
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
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-3">
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
                    <strong>Active Cohort Sessions:</strong> Click a session chip to view details or launch the Workspace.
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
          </>
        ) : (
          <>
            {/* Left: International mode notice */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
                <Globe className="w-4 h-4 text-kulkul-purple" />
                <span>International Scheduling Mode</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Indonesian calendar sync is currently disabled. Cohort sessions can be scheduled on any date and time according to your international fellowship schedule without regional holiday restrictions.
              </p>
              {isMentorOrAdmin && onToggleSyncIndonesianCalendar && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleSyncIndonesianCalendar(true)}
                    className="text-xs font-bold text-kulkul-purple hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    Enable Indonesian Calendar Sync &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Right: International Guidelines */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="text-slate-900 font-extrabold text-xs">
                Global Cohort Scheduling Guidelines
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <span>
                    <strong>Full Calendar Availability:</strong> All dates in this month are open for booking live lectures and mentor reviews.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-kulkul-purple shrink-0" />
                  <span>
                    <strong>Interactive Sessions:</strong> Click scheduled sessions to launch Code Studio, Live Whiteboard, and Notes.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                  <span>
                    <strong>Flexible Booking:</strong> Click "+ Schedule" on any day in the month to plan cohort activities.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


