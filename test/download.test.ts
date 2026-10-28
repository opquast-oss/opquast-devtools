import { describe, expect, it } from 'vitest';
import { fileDate, fileHost, fileName } from '@/entrypoints/panel/download';

describe('export file names', () => {
  it('dates the file in the local time zone', () => {
    expect(fileDate(new Date(2026, 9, 28, 23, 59).getTime())).toBe('2026-10-28');
    expect(fileDate(Number.NaN)).toBe('');
  });

  it('names the host, port included, and nothing for a page without one', () => {
    expect(fileHost('https://www.example.com/a?b')).toBe('www.example.com');
    expect(fileHost('http://localhost:8080/')).toBe('localhost-8080');
    expect(fileHost('file:///tmp/a.html')).toBe('');
    expect(fileHost('')).toBe('');
  });

  it('skips the empty parts', () => {
    expect(fileName(['opquast', 'v5', '', '2026-10-28'], 'csv')).toBe('opquast-v5-2026-10-28.csv');
  });
});
