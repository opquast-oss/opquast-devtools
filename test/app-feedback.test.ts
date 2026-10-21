import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { addAppFeedback, clearAppFeedbacks, getAppFeedbacks } from '@/lib/app-feedback';

describe('app-feedback (storage.local)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts empty', async () => {
    expect(await getAppFeedbacks()).toEqual([]);
  });

  it('appends entries newest-last and stamps id + createdAt', async () => {
    await addAppFeedback({ category: 'bug', message: 'first' }, 1000);
    const list = await addAppFeedback({ category: 'idea', message: 'second' }, 2000);

    expect(list).toHaveLength(2);
    expect(list.map((f) => f.message)).toEqual(['first', 'second']);
    expect(list[0]).toMatchObject({ category: 'bug', createdAt: 1000 });
    expect(list[1]).toMatchObject({ category: 'idea', createdAt: 2000 });
    // ids are unique
    expect(new Set(list.map((f) => f.id)).size).toBe(2);
  });

  it('persists across reads', async () => {
    await addAppFeedback({ category: 'other', message: 'note' }, 5);
    expect(await getAppFeedbacks()).toHaveLength(1);
  });

  it('clear empties the list', async () => {
    await addAppFeedback({ category: 'bug', message: 'x' }, 1);
    await clearAppFeedbacks();
    expect(await getAppFeedbacks()).toEqual([]);
  });
});
