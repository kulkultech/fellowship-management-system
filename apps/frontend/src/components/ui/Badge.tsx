import React from 'react';

export type BadgeVariant =
  | 'purple'
  | 'orange'
  | 'green'
  | 'amber'
  | 'red'
  | 'slate'
  | 'blue';

export type BadgeSize = 'md' | 'sm';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  purple: 'bg-purple-100 text-kulkul-purple border border-purple-200',
  orange: 'bg-orange-100 text-kulkul-orange border border-orange-200',
  green: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  amber: 'bg-amber-100 text-amber-800 border border-amber-200',
  red: 'bg-rose-100 text-rose-800 border border-rose-200',
  slate: 'bg-slate-100 text-slate-700 border border-slate-200',
  blue: 'bg-blue-100 text-blue-800 border border-blue-200',
};

const sizeClasses: Record<BadgeSize, string> = {
  md: 'badge-md',
  sm: 'badge-sm',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  icon,
  className = '',
  ...props
}) => {
  return (
    <span
      className={`badge ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
