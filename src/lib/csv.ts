// CSV export, ported from opquast-desktop's lib/tools/export/csv.js. Same column layout and
// ';' / CRLF formatting (Excel-friendly), but UTF-8 + BOM instead of the legacy ISO-8859-1 hack.

import { statusLabel, t as tr, type Lang } from '@/lib/ui-strings';
import type { VersionStamp } from '@/lib/versions';
import type { Detail, ResultRow } from '@/lib/types';

const HEADERS: Record<Lang, string[]> = {
  fr: [
    'ID',
    'Checklist',
    'Référence',
    'Libellé',
    'Modifié',
    'Code',
    'Résultat',
    'Commentaire',
    'Détails',
  ],
  en: ['ID', 'Checklist', 'Reference', 'Label', 'Changed', 'Code', 'Result', 'Comment', 'Details'],
};

const SEP = ';';
const EOL = '\r\n';

/** BOM so Excel reads the UTF-8 accents correctly. */
export const CSV_BOM = '﻿';

function field(value: string): string {
  let v = String(value ?? '');
  // Cells come from the analysed page and from users: a spreadsheet must not run one as a formula.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** Quote + join a grid of string cells into a ';'-separated, CRLF-terminated CSV body (no BOM). */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(field).join(SEP)).join(EOL);
}

function detailText(d: Detail): string {
  return d.text || d.selector || d.xpath || d.tag || '';
}

export function buildCsv(rows: ResultRow[], lang: Lang, checklistName: string): string {
  const grid: string[][] = [
    HEADERS[lang],
    ...rows.map((r) => [
      r.id,
      checklistName,
      r.criterion?.name ?? '',
      r.criterion?.description ?? '',
      r.auto === false ? '*' : '',
      r.result,
      statusLabel(lang, r.result),
      r.comment ?? '',
      r.details.map(detailText).join('\n'),
    ]),
  ];
  return CSV_BOM + toCsv(grid) + EOL;
}

// ---------------------------------------------------------------------------
// Feedbacks
// ---------------------------------------------------------------------------

const FB_HEADERS: Record<Lang, string[]> = {
  fr: [
    'Origine',
    'Type',
    'Date',
    'Référentiel',
    'Critère',
    'Libellé',
    'Verdict',
    'Commentaire',
    'URL',
    'Version extension',
    'Version moteur',
    'Overlay',
    'Empreinte',
    'ID analyse',
  ],
  en: [
    'Origin',
    'Type',
    'Date',
    'Checklist',
    'Criterion',
    'Label',
    'Verdict',
    'Comment',
    'URL',
    'Extension version',
    'Engine version',
    'Overlay',
    'Fingerprint',
    'Analysis ID',
  ],
};

export interface FeedbackCsvRow {
  origin: string;
  typeLabel: string;
  createdAt: number;
  slug?: string;
  ref?: string;
  description?: string;
  status?: string;
  body: string;
  url?: string;
  versions?: VersionStamp;
  analysisId?: string;
}

/**
 * Feedbacks as a spreadsheet.
 *
 * The escape hatch from `mailto:`, which mail clients truncate well before the browser does — a
 * selection of thirty feedbacks is already at risk, and the header block makes it worse. This is
 * also the archival format, so the version columns are repeated on every line rather than put in a
 * preamble: a metadata block above the header breaks the import in every spreadsheet, and denormal
 * but machine-readable is the whole point of choosing CSV over the email.
 */
/** ISO 8601, or '' for a record whose date is missing or corrupt (toISOString() would throw). */
function isoDate(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function buildFeedbackCsv(rows: FeedbackCsvRow[], lang: Lang): string {
  const grid: string[][] = [
    FB_HEADERS[lang],
    ...rows.map((r) => [
      r.origin,
      r.typeLabel,
      isoDate(r.createdAt),
      r.slug ?? '',
      r.ref ?? '',
      r.description ?? '',
      r.status ? statusLabel(lang, r.status as never) : '',
      r.body ?? '',
      r.url ?? '',
      r.versions?.ext ?? '',
      // A record written before 0.6 says so, rather than showing three empty cells that read as
      // a bug in the export.
      r.versions?.engine ? r.versions.engine : tr(lang, 'versionUnknown'),
      r.versions?.overlay ?? '',
      r.versions?.hash ?? '',
      r.analysisId ?? '',
    ]),
  ];
  return CSV_BOM + toCsv(grid) + EOL;
}
