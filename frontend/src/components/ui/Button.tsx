import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const base =
  'inline-flex items-center justify-center gap-1.5 font-sans whitespace-nowrap select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dosing-blue disabled:cursor-not-allowed';

const variants = {
  primary: 'bg-dosing-blue text-white rounded-circle hover:bg-dosing-blue-dark active:bg-dosing-blue-dark disabled:bg-gray-300 disabled:text-gray-500',
  secondary: 'bg-white text-gray-800 border border-gray-300 rounded-circle hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-white',
  danger: 'bg-white text-brand-red border border-gray-300 rounded-circle hover:bg-[#fff5f5] active:bg-alert-100 disabled:text-gray-400 disabled:border-gray-200 disabled:bg-white',
  dark: 'bg-gray-600 text-white rounded-circle hover:bg-gray-800 active:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500',
  ghost: 'bg-transparent text-gray-600 rounded-sm hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-400',
  apply: 'bg-gray-800 text-white rounded-sm hover:bg-black active:bg-black disabled:bg-gray-300 disabled:text-gray-500',
  /** light grey pill (Past Records "View Graph") */
  soft: 'bg-gray-100 text-gray-800 border border-gray-400 rounded-circle hover:bg-gray-200 font-normal',
} as const;

const sizes = {
  sm: 'h-6 px-3 text-[12px] font-medium',
  md: 'h-8 px-4 text-[14px] font-medium',
  /** toolbar buttons on Configurations (36px, 14px semibold) */
  lg: 'h-[36px] pl-[12px] pr-[16px] gap-[8px] text-[14px] font-semibold',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});
