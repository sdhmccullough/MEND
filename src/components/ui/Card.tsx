import type { HTMLAttributes } from 'react';

// The standard surface card; PayDay copy-pasted this classname ~12 times.
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card) ${className}`}
      {...props}
    />
  );
}

// Uppercase micro-heading used above settings sections and card groups.
export function SectionLabel({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-xs font-semibold tracking-wide text-muted uppercase ${className}`}
      {...props}
    />
  );
}
