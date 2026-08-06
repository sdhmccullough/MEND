import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { PtSession } from '../../lib/schema';
import { epochToDateKey, formatEpochTime, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SessionEditor, emptySession } from './SessionEditor';
import { HepEditorDialog } from './HepEditorDialog';

/** Today's PT: logged sessions, or the fast paths to log one. */
export function PtCard() {
  const ptSessions = useStore((s) => s.ptSessions);
  const hep = useStore((s) => s.hep);
  const user = useStore((s) => s.user);
  const [editor, setEditor] = useState<{
    sessionId: string | null;
    initial: PtSession;
    key: number;
  } | null>(null);
  const [hepOpen, setHepOpen] = useState(false);

  const today = todayKey();
  const todaySessions = Object.entries(ptSessions)
    .filter(([, s]) => epochToDateKey(s.at) === today)
    .sort(([, a], [, b]) => a.at - b.at);

  const uid = user?.uid ?? '';

  return (
    <Card>
      <SectionLabel>Physical therapy</SectionLabel>

      {todaySessions.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {todaySessions.map(([id, s]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setEditor({ sessionId: id, initial: s, key: Date.now() })}
                className="w-full rounded-(--radius-control) bg-surface-2 px-3 py-2 text-left text-sm transition hover:brightness-105"
              >
                <span className="flex items-baseline justify-between">
                  <span className="font-medium capitalize">{s.kind} session</span>
                  <span className="text-xs text-muted">{formatEpochTime(s.at)}</span>
                </span>
                <span className="block text-xs text-muted">
                  {s.exercises.length} exercise{s.exercises.length === 1 ? '' : 's'}
                  {s.painPre !== null && s.painPost !== null
                    ? ` · pain ${s.painPre}→${s.painPost}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setEditor({ sessionId: null, initial: emptySession(uid), key: Date.now() })}
        >
          Log clinic session
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() =>
            setEditor({
              sessionId: null,
              initial: emptySession(uid, hep.exercises),
              key: Date.now(),
            })
          }
        >
          Start home session
        </Button>
      </div>
      <button
        type="button"
        className="mt-2 text-xs text-muted underline-offset-2 hover:underline"
        onClick={() => setHepOpen(true)}
      >
        Edit home program ({hep.exercises.length} exercises)
      </button>

      {editor ? (
        <SessionEditor
          key={editor.key}
          open
          onOpenChange={(o) => {
            if (!o) setEditor(null);
          }}
          sessionId={editor.sessionId}
          initial={editor.initial}
        />
      ) : null}
      {hepOpen ? <HepEditorDialog open onOpenChange={setHepOpen} /> : null}
    </Card>
  );
}
