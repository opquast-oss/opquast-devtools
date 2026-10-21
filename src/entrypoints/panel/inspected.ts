// The inspected page, as seen from the panel. devtools.inspectedWindow.eval differs per browser:
// Firefox returns a Promise of [result, exceptionInfo]; Chrome returns null and only answers
// through a callback. Awaiting it directly — what the panel used to do — left Chrome with no URL,
// so the analysis never started on its own there.

export type EvalOutcome<T> = [T | undefined, unknown];

/** Evaluate `expression` in the inspected page, in either browser. Never rejects. */
export function evalInInspected<T = unknown>(expression: string): Promise<EvalOutcome<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (outcome: EvalOutcome<T>) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };
    const evaluate = browser.devtools.inspectedWindow.eval as unknown as (
      expr: string,
      ...rest: unknown[]
    ) => unknown;
    const failed = (e: unknown) => done([undefined, { isError: true, code: String(e) }]);
    try {
      if (import.meta.env.BROWSER === 'firefox') {
        // Documented form: a Promise of [result, exceptionInfo].
        (evaluate(expression) as Promise<EvalOutcome<T>>).then(done, failed);
      } else {
        // Chrome: returns null, answers through the callback only.
        evaluate(expression, {}, (result: T, info: unknown) => done([result, info]));
      }
    } catch (e) {
      failed(e);
    }
  });
}

/**
 * URL of the inspected page, or null when neither route may read it. eval is refused in some
 * Chrome setups ("Permission denied"), so fall back to the tab, readable with the host permission.
 */
export async function inspectedUrl(): Promise<string | null> {
  const [href] = await evalInInspected<string>('location.href');
  if (typeof href === 'string' && href) return href;
  try {
    const tab = await browser.tabs.get(browser.devtools.inspectedWindow.tabId);
    return tab.url || null;
  } catch {
    return null; // no tabs API in this panel (Firefox) or no access to the tab
  }
}
