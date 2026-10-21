// The panel's answer when the engine could not reach the page: one message per cause (see
// lib/page-access.ts), each pointing to the setting that actually fixes it, plus the browser's own
// message so a report can say what really happened.

import { t, type Lang, type StringKey } from '@/lib/ui-strings';
import type { AccessFailure } from '@/lib/page-access';

export interface AccessViewOptions {
  lang: Lang;
  isFirefox: boolean;
  /** The browser's own error message, shown collapsed. */
  detail?: string;
  onOpenSettings: () => void;
}

function para(className: string, text = ''): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

export function renderAccessError(
  container: HTMLElement,
  code: AccessFailure,
  o: AccessViewOptions,
): void {
  const L = o.lang;
  const tr = (key: StringKey) => t(L, key);
  const box = document.createElement('div');
  box.className = 'permission-error';

  if (code === 'PERMISSION_DENIED') {
    const steps = document.createElement('div');
    steps.className = 'permission-error-options';
    const grant = para('permission-error-option');
    const link = document.createElement('a');
    link.href = '#';
    link.id = 'open-settings-link';
    link.textContent = tr('errorPermissionOpenSettings');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      o.onOpenSettings();
    });
    grant.append(link, ` → ${tr('errorPermissionGrant')}`);
    steps.append(
      grant,
      para(
        'permission-error-hint',
        tr(o.isFirefox ? 'errorPermissionAltFirefox' : 'errorPermissionAltChrome'),
      ),
    );
    box.append(
      para('permission-error-title', tr('errorPermissionTitle')),
      para('permission-error-intro', tr('errorPermissionIntro')),
      steps,
      para('permission-error-done', tr('errorPermissionDone')),
    );
  } else if (code === 'PRIVATE_WINDOW') {
    box.append(
      para('permission-error-title', tr('errorPrivateTitle')),
      para(
        'permission-error-intro',
        tr(o.isFirefox ? 'errorPrivateFirefox' : 'errorPrivateChrome'),
      ),
      para('permission-error-done', tr('errorPrivateDone')),
    );
  } else {
    box.append(
      para('permission-error-title', tr('errorRestrictedTitle')),
      para('permission-error-intro', tr('errorRestrictedIntro')),
      para('permission-error-done', tr('errorRestrictedDone')),
    );
  }

  if (o.detail) {
    const details = document.createElement('details');
    details.className = 'permission-error-detail';
    const summary = document.createElement('summary');
    summary.textContent = tr('errorTechDetail');
    const pre = document.createElement('pre');
    pre.textContent = o.detail;
    details.append(summary, pre);
    box.append(details);
  }

  container.replaceChildren(box);
}
