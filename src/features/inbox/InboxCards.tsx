import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { applyInboxItem, dismissInboxItem } from '../../store/sync';
import { interpretInboxItem } from '../../lib/inboxApply';
import { formatEpochTime } from '../../lib/dates';
import { toast, toastError } from '../../components/ui/Toast';
import { SuggestionCard } from '../../components/SuggestionCard';

const TYPE_TITLES = {
  ptSession: 'PT session detected',
  doseLog: 'Dose detected',
  metric: 'Day log detected',
} as const;

/** Pending Hermes suggestions, surfaced on Today. A human always taps
 * Apply — the agent can only stage. */
export function InboxCards() {
  const inbox = useStore((s) => s.inbox);
  const meds = useStore((s) => s.meds);
  const user = useStore((s) => s.user);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!user) return null;
  const pending = Object.entries(inbox)
    .filter(([, item]) => item.status === 'pending')
    .sort(([, a], [, b]) => a.receivedAt - b.receivedAt);
  if (pending.length === 0) return null;

  return (
    <div className="space-y-2">
      {pending.map(([id, item]) => {
        const outcome = interpretInboxItem(id, item, {
          meds,
          uid: user.uid,
          now: Date.now(),
        });
        const received = item.receivedAt
          ? `Heard at ${formatEpochTime(item.receivedAt)}`
          : undefined;
        if (!outcome.ok) {
          return (
            <SuggestionCard
              key={id}
              title={`${TYPE_TITLES[item.type]} — can't apply`}
              body={`${outcome.reason}${received ? ` · ${received}` : ''}`}
              onDismiss={() => {
                setBusyId(id);
                dismissInboxItem(id)
                  .catch(() => toastError('Not synced'))
                  .finally(() => setBusyId(null));
              }}
              busy={busyId === id}
            />
          );
        }
        return (
          <SuggestionCard
            key={id}
            title={TYPE_TITLES[item.type]}
            body={`${outcome.summary}${received ? ` · ${received}` : ''}`}
            applyLabel="Apply"
            onApply={() => {
              setBusyId(id);
              applyInboxItem(id, outcome.updates)
                .then(() => toast('Suggestion applied', outcome.summary))
                .catch(() => toastError('Not synced', 'Try again.'))
                .finally(() => setBusyId(null));
            }}
            onDismiss={() => {
              setBusyId(id);
              dismissInboxItem(id)
                .catch(() => toastError('Not synced'))
                .finally(() => setBusyId(null));
            }}
            busy={busyId === id}
          />
        );
      })}
    </div>
  );
}
