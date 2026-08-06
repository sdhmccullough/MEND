// Generic CSV building + export. Excel-friendly: CRLF line endings and a
// UTF-8 BOM so it opens with correct encoding on double-click. Domain
// exports (dose log, sessions) live in lib/export.ts.

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadOrShareCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], filename, { type: 'text/csv' });
  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    void navigator.share({ files: [file], title: filename }).catch(() => {
      triggerDownload(blob, filename);
    });
    return;
  }
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
