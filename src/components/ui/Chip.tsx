import type { ButtonHTMLAttributes } from 'react';

// Pill toggle used for filters and pickers.
export function Chip({
  active = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition ${
        active
          ? 'border-accent-strong bg-accent-soft text-accent-strong'
          : 'border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink'
      } ${className}`}
      {...props}
    />
  );
}
