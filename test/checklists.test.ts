import { describe, expect, it } from 'vitest';
import { checklistName, shippedSelection, type ChecklistInfo } from '@/lib/checklists';

const manifest: ChecklistInfo[] = [
  {
    slug: '901-opquast-basics',
    names: { en: 'Opquast Basics', fr: 'Opquast Basics' },
    langs: ['en', 'fr'],
  },
  {
    slug: '900-opquast-v5',
    names: { en: 'Web Quality - Opquast V5', fr: 'Qualité Web - Opquast V5' },
    langs: ['en', 'fr'],
  },
];

describe('checklistName', () => {
  it('names a checklist in the requested language', () => {
    expect(checklistName(manifest, '900-opquast-v5', 'en')).toBe('Web Quality - Opquast V5');
    expect(checklistName(manifest, '900-opquast-v5', 'fr')).toBe('Qualité Web - Opquast V5');
  });

  it('falls back to French, then to the slug', () => {
    expect(checklistName(manifest, '900-opquast-v5', 'de')).toBe('Qualité Web - Opquast V5');
    expect(checklistName(manifest, '742-website', 'en')).toBe('742-website');
  });
});

describe('shippedSelection', () => {
  it('keeps a selection the build still ships', () => {
    expect(
      shippedSelection(manifest, ['901-opquast-basics', '900-opquast-v5'], '900-opquast-v5'),
    ).toEqual({
      enabledChecklists: ['901-opquast-basics', '900-opquast-v5'],
      slug: '900-opquast-v5',
    });
  });

  it('drops checklists that are no longer shipped', () => {
    expect(shippedSelection(manifest, ['742-website', '900-opquast-v5'], '742-website')).toEqual({
      enabledChecklists: ['900-opquast-v5'],
      slug: '900-opquast-v5',
    });
  });

  it('falls back to Opquast Basics when nothing shipped is left', () => {
    expect(shippedSelection(manifest, ['742-website'], '742-website')).toEqual({
      enabledChecklists: ['901-opquast-basics'],
      slug: '901-opquast-basics',
    });
  });
});
