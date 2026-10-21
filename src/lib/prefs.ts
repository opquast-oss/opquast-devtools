// User preferences, persisted in storage.local. Ports the legacy simple-prefs settings that are
// in scope for v1 (checklist selection, reference/theme columns, language).

export interface Prefs {
  slug: string;
  lang: string;
  showThemas: boolean;
  showTags: boolean;
  /** Slugs of the referentials offered in the panel dropdown (chosen on the options page). */
  enabledChecklists: string[];
  /** Auto-run the analysis when the DevTools panel opens (default on). */
  autoRun: boolean;
  /** Show the Feedbacks tab and feedback features (opt-in, default off). */
  participateFeedback: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  slug: '901-opquast-basics',
  lang: 'fr',
  showThemas: true,
  showTags: true,
  enabledChecklists: ['901-opquast-basics'],
  autoRun: true,
  participateFeedback: false,
};

const KEY = 'oqs-prefs';

export async function getPrefs(): Promise<Prefs> {
  const stored = await browser.storage.local.get(KEY);
  return { ...DEFAULT_PREFS, ...((stored[KEY] as Partial<Prefs>) ?? {}) };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function onPrefsChanged(cb: (prefs: Prefs) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]?.newValue) {
      cb({ ...DEFAULT_PREFS, ...(changes[KEY].newValue as Partial<Prefs>) });
    }
  });
}
