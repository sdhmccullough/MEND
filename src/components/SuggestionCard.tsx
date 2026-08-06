import type { ReactNode } from 'react';
import { Button, IconButton } from './ui/Button';
import { XIcon } from './icons';

/** A machine suggestion awaiting a human decision — the generalization of
 * PayDay's SuggestionChip. Nothing applies without a tap. */
export function SuggestionCard({
  title,
  body,
  applyLabel = 'Apply',
  onApply,
  onDismiss,
  busy = false,
}: {
  title: string;
  body?: ReactNode;
  applyLabel?: string;
  /** Omit for malformed suggestions — dismiss is the only action. */
  onApply?: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-(--radius-card) border border-accent-strong/25 bg-accent-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {body ? <p className="mt-0.5 text-xs text-muted">{body}</p> : null}
        </div>
        <IconButton
          label="Dismiss suggestion"
          className="!size-8 shrink-0"
          onClick={onDismiss}
          disabled={busy}
        >
          <XIcon className="size-4" />
        </IconButton>
      </div>
      {onApply ? (
        <Button
          variant="primary"
          className="mt-2 !min-h-9 w-full"
          onClick={onApply}
          disabled={busy}
        >
          {busy ? 'Applying…' : applyLabel}
        </Button>
      ) : null}
    </div>
  );
}
