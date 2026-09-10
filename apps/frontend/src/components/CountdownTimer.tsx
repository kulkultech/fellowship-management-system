import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetDate: string | Date;
  onExpire?: () => void;
  variant?: 'boxes' | 'compact' | 'pill';
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
  className = '',
}) => {
  const target = React.useMemo(() => new Date(targetDate), [targetDate]);
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

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-mono font-bold tracking-tight text-xs px-3 py-1 rounded-full bg-purple-50 text-kulkul-purple border border-purple-200/80 ${className}`}
      >
        <span>{pad(timeLeft.days)}d</span>
        <span>:</span>
        <span>{pad(timeLeft.hours)}h</span>
        <span>:</span>
        <span>{pad(timeLeft.minutes)}m</span>
        <span>:</span>
        <span>{pad(timeLeft.seconds)}s</span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1.5 font-mono text-sm font-bold text-slate-800 ${className}`}>
        <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-kulkul-purple">
          {pad(timeLeft.days)}d
        </span>
        <span className="text-slate-400">:</span>
        <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-kulkul-purple">
          {pad(timeLeft.hours)}h
        </span>
        <span className="text-slate-400">:</span>
        <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-kulkul-purple">
          {pad(timeLeft.minutes)}m
        </span>
        <span className="text-slate-400">:</span>
        <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-kulkul-purple">
          {pad(timeLeft.seconds)}s
        </span>
      </div>
    );
  }

  // Default: 'boxes'
  return (
    <div className={`grid grid-cols-4 gap-2 sm:gap-3 max-w-sm ${className}`}>
      <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-purple-200/80 dark:border-purple-800/60 shadow-sm backdrop-blur-xs">
        <span className="text-xl sm:text-2xl font-extrabold font-mono text-kulkul-purple dark:text-purple-300">
          {pad(timeLeft.days)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
          Days
        </span>
      </div>

      <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-purple-200/80 dark:border-purple-800/60 shadow-sm backdrop-blur-xs">
        <span className="text-xl sm:text-2xl font-extrabold font-mono text-kulkul-purple dark:text-purple-300">
          {pad(timeLeft.hours)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
          Hours
        </span>
      </div>

      <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-purple-200/80 dark:border-purple-800/60 shadow-sm backdrop-blur-xs">
        <span className="text-xl sm:text-2xl font-extrabold font-mono text-kulkul-purple dark:text-purple-300">
          {pad(timeLeft.minutes)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
          Mins
        </span>
      </div>

      <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-purple-200/80 dark:border-purple-800/60 shadow-sm backdrop-blur-xs">
        <span className="text-xl sm:text-2xl font-extrabold font-mono text-kulkul-orange dark:text-orange-400">
          {pad(timeLeft.seconds)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
          Secs
        </span>
      </div>
    </div>
  );
};
