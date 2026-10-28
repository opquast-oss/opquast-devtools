import { describe, expect, it } from 'vitest';
import { buildCsv } from '@/lib/csv';
import type { ResultRow } from '@/lib/types';

const rows: ResultRow[] = [
  {
    id: '1',
    result: 'nc',
    results_list: ['nc'],
    comment: 'a "b"',
    details: [{ selector: 'img' }, { text: 'hello' }],
    time: 0,
    criterion: {
      name: '12',
      description: 'desc; with semicolon',
      thema: 'Code',
      checklist: { name: 'X' },
    },
    auto: true,
    forcedNt: false,
  },
  {
    id: '2',
    result: 'nt',
    results_list: [],
    comment: '',
    details: [],
    time: 0,
    criterion: { name: '13', description: 'manual' },
    auto: false,
    forcedNt: false,
  },
];

describe('buildCsv', () => {
  const csv = buildCsv(rows, 'fr', 'Opquast V3');

  it('starts with a UTF-8 BOM', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('has a header + one line per row', () => {
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(1 + rows.length); // header + 2 rows
  });

  it('quotes fields and escapes embedded quotes; semicolons stay inside quotes', () => {
    expect(csv).toContain('"a ""b"""'); // comment with escaped quotes
    expect(csv).toContain('"desc; with semicolon"');
  });

  it('marks manual (non-auto) rows with * in the Changed column', () => {
    const line2 = csv.split('\r\n').find((l) => l.startsWith('"2"'))!;
    expect(line2.split(';')).toContain('"*"');
  });

  it('localizes the result label', () => {
    expect(csv).toContain('"Non conforme"'); // fr label for nc
  });

  it('never lets a cell start like a spreadsheet formula', () => {
    const risky: ResultRow = {
      ...rows[0]!,
      comment: '=HYPERLINK("http://evil.test")',
      details: [{ text: '+1' }, { text: '@SUM(A1)' }],
    };
    const out = buildCsv([risky], 'fr', 'Opquast V3');
    expect(out).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
    expect(out).toContain(`"'+1\n@SUM(A1)"`);
    expect(out).not.toMatch(/(^|;)"[=+\-@]/m);
  });
});

describe('buildFeedbackCsv', () => {
  const stamp = { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'a3f1c8' };
  const row = {
    origin: 'Résultats',
    typeLabel: 'Confirmé',
    createdAt: Date.UTC(2026, 8, 6, 12, 0, 0),
    slug: '900-opquast-v5',
    ref: '122',
    description: 'Les vidéos sont sous-titrées.',
    status: 'nc',
    body: 'commentaire',
    url: 'https://example.test/',
    versions: stamp,
    analysisId: 'a1',
  };

  it('keeps the header + one line per feedback, so a spreadsheet can import it', async () => {
    const { buildFeedbackCsv } = await import('@/lib/csv');
    const csv = buildFeedbackCsv([row, { ...row, ref: '123' }], 'fr');
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    // No metadata preamble: a block above the header breaks the import everywhere.
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Empreinte"');
    expect(lines[0]).toContain('"ID analyse"');
  });

  it('carries the BOM so Excel reads the accents', async () => {
    const { buildFeedbackCsv } = await import('@/lib/csv');
    expect(buildFeedbackCsv([row], 'fr').startsWith('\uFEFF')).toBe(true);
  });

  it('repeats the engine columns on every line — this is the archival format', async () => {
    const { buildFeedbackCsv } = await import('@/lib/csv');
    const csv = buildFeedbackCsv([row], 'fr');
    expect(csv).toContain('"2.0.0-alpha.1"');
    expect(csv).toContain('"a3f1c8"');
    expect(csv).toContain('"a1"');
    // The verdict, which the email never used to state either.
    expect(csv).toContain('"Non conforme"');
  });

  it('says so for a feedback written before traceability existed', async () => {
    const { buildFeedbackCsv } = await import('@/lib/csv');
    const csv = buildFeedbackCsv([{ ...row, versions: undefined, analysisId: '' }], 'fr');
    // Three empty cells would read as a broken export; the wording says it is simply unknown.
    expect(csv).toMatch(/non tracé/);
  });

  it('leaves the date empty for a corrupt record instead of failing the whole export', async () => {
    const { buildFeedbackCsv } = await import('@/lib/csv');
    const csv = buildFeedbackCsv([{ ...row, createdAt: Number.NaN }], 'fr');
    expect(csv.split('\r\n')[1]).toContain('"";');
  });
});
