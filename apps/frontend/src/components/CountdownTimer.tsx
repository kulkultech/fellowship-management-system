import React, { useState, useEffect, useMemo } from 'react';

export interface CountdownTimerProps {
  targetDate: string | Date;
  onExpire?: () => void;
  variant?: 'boxes' | 'compact' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

function calculateTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - new Date().getTime();
  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    totalSeconds,
  };
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  targetDate,
  onExpire,
  variant = 'boxes',
  size = 'md',
  className = '',
}) => {
  const target = useMemo(() => new Date(targetDate), [targetDate]);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(target));

  useEffect(() => {
    const update = () => {
      const updated = calculateTimeLeft(target);
      setTimeLeft(updated);
      if (updated.isExpired && onExpire) {
        onExpire();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [target, onExpire]);

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Ultra-compact Pill Variant (inline in buttons, badges, track cards)
  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 font-mono text-xs px-3 py-1 rounded-full bg-white/95 border border-purple-200/90 text-slate-800 shadow-2xs select-none ${className}`}
      >
        <span className="text-slate-900 font-black tabular-nums">{pad(timeLeft.days)}d</span>
        <span className="text-slate-300 font-bold">•</span>
        <span className="text-slate-900 font-black tabular-nums">{pad(timeLeft.hours)}h</span>
        <span className="text-slate-300 font-bold">•</span>
        <span className="text-slate-900 font-black tabular-nums">{pad(timeLeft.minutes)}m</span>
        <span className="text-slate-300 font-bold">•</span>
        <span className="text-kulkul-purple font-black tabular-nums">{pad(timeLeft.seconds)}s</span>
      </div>
    );
  }

  // Compact / Hero Banner Variant
  if (variant === 'compact') {
    const isSm = size === 'sm';
    return (
      <div className={`flex items-center gap-2 sm:gap-2.5 select-none ${className}`}>
        {/* Days */}
        <div
          className={`flex flex-col items-center justify-center bg-white border border-slate-200/90 hover:border-purple-200 shadow-xs hover:shadow-sm rounded-2xl transition-all ${
            isSm ? 'min-w-[3.25rem] px-2.5 py-1.5' : 'min-w-[3.8rem] sm:min-w-[4.4rem] px-3 sm:px-4 py-2.5 sm:py-3'
          }`}
        >
          <span
            className={`font-mono font-black text-slate-900 tracking-tight tabular-nums leading-none ${
              isSm ? 'text-base' : 'text-xl sm:text-2xl'
            }`}
          >
            {pad(timeLeft.days)}
          </span>
          <span
            className={`font-black uppercase tracking-widest text-slate-400 mt-1.5 leading-none ${
              isSm ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            Days
          </span>
        </div>

        {/* Hours */}
        <div
          className={`flex flex-col items-center justify-center bg-white border border-slate-200/90 hover:border-purple-200 shadow-xs hover:shadow-sm rounded-2xl transition-all ${
            isSm ? 'min-w-[3.25rem] px-2.5 py-1.5' : 'min-w-[3.8rem] sm:min-w-[4.4rem] px-3 sm:px-4 py-2.5 sm:py-3'
          }`}
        >
          <span
            className={`font-mono font-black text-slate-900 tracking-tight tabular-nums leading-none ${
              isSm ? 'text-base' : 'text-xl sm:text-2xl'
            }`}
          >
            {pad(timeLeft.hours)}
          </span>
          <span
            className={`font-black uppercase tracking-widest text-slate-400 mt-1.5 leading-none ${
              isSm ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            Hours
          </span>
        </div>

        {/* Minutes */}
        <div
          className={`flex flex-col items-center justify-center bg-white border border-slate-200/90 hover:border-purple-200 shadow-xs hover:shadow-sm rounded-2xl transition-all ${
            isSm ? 'min-w-[3.25rem] px-2.5 py-1.5' : 'min-w-[3.8rem] sm:min-w-[4.4rem] px-3 sm:px-4 py-2.5 sm:py-3'
          }`}
        >
          <span
            className={`font-mono font-black text-slate-900 tracking-tight tabular-nums leading-none ${
              isSm ? 'text-base' : 'text-xl sm:text-2xl'
            }`}
          >
            {pad(timeLeft.minutes)}
          </span>
          <span
            className={`font-black uppercase tracking-widest text-slate-400 mt-1.5 leading-none ${
              isSm ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            Mins
          </span>
        </div>

        {/* Seconds (Highlighted with energetic brand purple accent) */}
        <div
          className={`flex flex-col items-center justify-center bg-gradient-to-b from-purple-50/90 via-white to-white border border-purple-300 shadow-xs hover:shadow-sm rounded-2xl ring-2 ring-purple-500/15 transition-all ${
            isSm ? 'min-w-[3.25rem] px-2.5 py-1.5' : 'min-w-[3.8rem] sm:min-w-[4.4rem] px-3 sm:px-4 py-2.5 sm:py-3'
          }`}
        >
          <span
            className={`font-mono font-black text-kulkul-purple tracking-tight tabular-nums leading-none ${
              isSm ? 'text-base' : 'text-xl sm:text-2xl'
            }`}
          >
            {pad(timeLeft.seconds)}
          </span>
          <span
            className={`font-black uppercase tracking-widest text-kulkul-purple/90 mt-1.5 leading-none ${
              isSm ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            Secs
          </span>
        </div>
      </div>
    );
  }

  // Large Boxes Variant (Candidate Apply Lock Page)
  const isLg = size === 'lg';
  return (
    <div className={`grid grid-cols-4 gap-2.5 sm:gap-4 max-w-md w-full select-none ${className}`}>
      {/* Days */}
      <div className="flex flex-col items-center justify-center p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-purple-300">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
        <span
          className={`font-black font-mono tracking-tight text-slate-900 tabular-nums leading-none ${
            isLg ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
          }`}
        >
          {pad(timeLeft.days)}
        </span>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 mt-2 sm:mt-2.5">
          Days
        </span>
      </div>

      {/* Hours */}
      <div className="flex flex-col items-center justify-center p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-purple-300">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
        <span
          className={`font-black font-mono tracking-tight text-slate-900 tabular-nums leading-none ${
            isLg ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
          }`}
        >
          {pad(timeLeft.hours)}
        </span>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 mt-2 sm:mt-2.5">
          Hours
        </span>
      </div>

      {/* Minutes */}
      <div className="flex flex-col items-center justify-center p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-purple-300">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
        <span
          className={`font-black font-mono tracking-tight text-slate-900 tabular-nums leading-none ${
            isLg ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
          }`}
        >
          {pad(timeLeft.minutes)}
        </span>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 mt-2 sm:mt-2.5">
          Mins
        </span>
      </div>

      {/* Seconds */}
      <div className="flex flex-col items-center justify-center p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-purple-50/90 via-white to-white border border-purple-300 shadow-sm relative overflow-hidden ring-2 ring-purple-400/20 transition-all duration-200 hover:shadow-md">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-kulkul-purple via-pink-500 to-kulkul-orange" />
        <span
          className={`font-black font-mono tracking-tight text-kulkul-purple tabular-nums leading-none ${
            isLg ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
          }`}
        >
          {pad(timeLeft.seconds)}
        </span>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-kulkul-purple/90 mt-2 sm:mt-2.5 flex items-center gap-1">
          <span>Secs</span>
          <span className="w-1.5 h-1.5 rounded-full bg-kulkul-purple animate-ping" />
        </span>
      </div>
    </div>
  );
};
