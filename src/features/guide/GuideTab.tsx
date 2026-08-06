import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { GuideSection } from '../../lib/schema';
import { deleteGuideSection, saveGuideSection } from '../../store/sync';
import { formatFull, parseDateKey } from '../../lib/dates';
import { daysSinceInjury } from '../../lib/progress';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, TextInput, inputClass } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';
import { ProtocolTimeline } from './ProtocolTimeline';

/** The recovery README: injury history up top, then editable reference
 * sections (discharge instructions, wound care, contacts) seeded from the
 * after-visit summary. Reference material, not medical advice — the care
 * team's word is authoritative. */
export function GuideTab() {
  const injury = useStore((s) => s.injury);
  const guide = useStore((s) => s.guide);
  const [editor, setEditor] = useState<{
    id: string | null;
    initial: GuideSection;
    key: number;
  } | null>(null);

  const sections = Object.entries(guide).sort(
    ([, a], [, b]) => a.order - b.order || a.title.localeCompare(b.title),
  );
  const dayN = daysSinceInjury(injury.occurredOn, Date.now());
  const nextOrder = sections.length
    ? Math.max(...sections.map(([, s]) => s.order)) + 1
    : 1;

  const openEditor = (id: string | null, initial: GuideSection) =>
    setEditor({ id, initial, key: Date.now() });

  return (
    <div className="space-y-3">
      {injury.title ? (
        <Card>
          <SectionLabel>The injury</SectionLabel>
          <p className="mt-1.5 text-sm font-semibold">{injury.title}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {injury.occurredOn ? (
              <li>
                Injured {formatFull(parseDateKey(injury.occurredOn))}
                {injury.mechanism ? ` — ${injury.mechanism}` : ''}
              </li>
            ) : null}
            {injury.diagnosis ? <li>{injury.diagnosis}</li> : null}
            {injury.surgeryOn ? (
              <li>Surgery {formatFull(parseDateKey(injury.surgeryOn))}</li>
            ) : null}
            {dayN !== null ? (
              <li className="font-medium text-ink">Recovery day {dayN}</li>
            ) : null}
          </ul>
          {Object.keys(injury.providers).length > 0 ? (
            <div className="mt-2 border-t border-line pt-2">
              <span className="text-xs font-medium text-muted">Care team</span>
              <ul className="mt-0.5 space-y-0.5 text-xs">
                {Object.entries(injury.providers).map(([id, p]) => (
                  <li key={id}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <ProtocolTimeline />

      {sections.map(([id, section]) => (
        <Card key={id}>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => openEditor(id, section)}
            aria-label={`Edit section: ${section.title}`}
          >
            <SectionLabel>{section.title}</SectionLabel>
            <p className="mt-1.5 text-sm whitespace-pre-line">{section.body}</p>
          </button>
        </Card>
      ))}

      {sections.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No reference sections yet — add discharge instructions, wound
            care steps, or contact numbers so they're always one tap away.
          </p>
        </Card>
      ) : null}

      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          openEditor(null, { title: '', body: '', order: nextOrder, updatedAt: null })
        }
      >
        Add section
      </Button>

      {editor ? (
        <SectionEditor
          key={editor.key}
          sectionId={editor.id}
          initial={editor.initial}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function SectionEditor({
  sectionId,
  initial,
  onClose,
}: {
  sectionId: string | null;
  initial: GuideSection;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={sectionId ? 'Edit section' : 'New section'}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !body.trim()) {
            toastError('Missing details', 'A title and body are required.');
            return;
          }
          setSaving(true);
          saveGuideSection(sectionId, {
            title: title.trim(),
            body: body.trim(),
            order: initial.order,
          })
            .then(() => {
              onClose();
              toast('Section saved', title.trim());
            })
            .catch(() => toastError('Not synced', 'Try again.'))
            .finally(() => setSaving(false));
        }}
      >
        <Field label="Title">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Wound care"
            required
          />
        </Field>
        <Field label="Content">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className={`${inputClass} resize-y`}
            placeholder="One instruction per line…"
            required
          />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          {sectionId ? (
            confirmDelete ? (
              <Button
                variant="danger"
                onClick={() =>
                  deleteGuideSection(sectionId)
                    .then(() => {
                      onClose();
                      toast('Section deleted');
                    })
                    .catch(() => toastError('Not synced'))
                }
              >
                Really delete?
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
