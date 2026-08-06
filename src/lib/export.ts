// Data-lifetime insurance (PRD gap 8): the record's value outlives the
// recovery, so export must exist before daily use stops. JSON = the whole
// household; CSV = the dose log a provider can read.

import type {
  Appointment,
  DayMetric,
  DoseRecord,
  HepTemplate,
  Injury,
  Med,
  PtSession,
} from './schema';
import { doseTextForDate } from './doses';
import { formatEpochTime, formatHHMM12 } from './dates';
import { toCsv } from './csv';

export interface ExportSlices {
  injury: Injury;
  meds: Record<string, Med>;
  doses: Record<string, Record<string, DoseRecord>>;
  ptSessions: Record<string, PtSession>;
  metrics: Record<string, DayMetric>;
  appointments: Record<string, Appointment>;
  hep: HepTemplate;
}

export function householdExportJson(slices: ExportSlices, exportedAt: number): string {
  return JSON.stringify({ app: 'mend', exportedAt, ...slices }, null, 2);
}

const DOSE_HEADER = ['date', 'time', 'med', 'dose', 'status', 'late', 'backfilled', 'note'];

export function doseLogCsv(
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
): string {
  const rows: Array<Array<string | number>> = [];
  for (const dateKey of Object.keys(doses).sort()) {
    for (const rec of Object.values(doses[dateKey])) {
      const med = meds[rec.medId];
      rows.push([
        dateKey,
        rec.takenAt !== null
          ? formatEpochTime(rec.takenAt)
          : rec.plannedAt
            ? `${formatHHMM12(rec.plannedAt)} (slot)`
            : '',
        med?.name ?? rec.medId,
        med ? doseTextForDate(med, dateKey) : '',
        rec.status,
        '', // late is a view-side derivation; keep the export raw
        rec.backfilled ? 'yes' : '',
        rec.note,
      ]);
    }
  }
  return toCsv(DOSE_HEADER, rows);
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
