// General app feedback (distinct from the per-criterion journal): a small list the user jots about
// the extension itself, stored locally in storage.local (like prefs). Nothing leaves the device until
// the user explicitly clicks "Transmettre", which opens a prefilled email in their own mail client.

export type AppFeedbackCategory = 'bug' | 'idea' | 'other';

export interface AppFeedback {
  id: string;
  category: AppFeedbackCategory;
  message: string;
  createdAt: number;
}

const KEY = 'oqs-app-feedback';

export async function getAppFeedbacks(): Promise<AppFeedback[]> {
  const stored = await browser.storage.local.get(KEY);
  const list = stored[KEY];
  return Array.isArray(list) ? (list as AppFeedback[]) : [];
}

/** Append one entry (newest last). Returns the full, updated list. */
export async function addAppFeedback(
  entry: { category: AppFeedbackCategory; message: string },
  now: number,
): Promise<AppFeedback[]> {
  const list = await getAppFeedbacks();
  const feedback: AppFeedback = {
    id: `${now}-${list.length}`,
    category: entry.category,
    message: entry.message,
    createdAt: now,
  };
  const next = [...list, feedback];
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export async function deleteAppFeedback(id: string): Promise<AppFeedback[]> {
  const next = (await getAppFeedbacks()).filter((f) => f.id !== id);
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export async function updateAppFeedback(
  id: string,
  changes: { category?: AppFeedbackCategory; message?: string },
): Promise<AppFeedback[]> {
  const next = (await getAppFeedbacks()).map((f) => (f.id === id ? { ...f, ...changes } : f));
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export async function clearAppFeedbacks(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
