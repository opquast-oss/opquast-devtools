// About panel: name, version (read from the manifest so it always matches the build), a short
// description, and privacy / licensing summaries with links. Static, localized content.
// When participateFeedback is enabled, also renders the "Donner mon avis" form.

import { els, state } from './context';
import { t, type Lang, type StringKey } from '@/lib/ui-strings';
import { esc } from './html';
import { currentVersions, formatVersions } from '@/lib/versions';
import { addAppFeedback, type AppFeedbackCategory } from '@/lib/app-feedback';
import { toast, renderFeedbacks } from './feedbacks-view';

const SITE_URL = 'https://www.opquast.com';
const REFERENTIAL_URL: Record<Lang, string> = {
  fr: 'https://checklists.opquast.com/fr/qualite-numerique/licence/',
  en: 'https://checklists.opquast.com/en/digital-quality/licence/',
};
const ACKNOWLEDGMENTS: StringKey[] = [
  'aboutAck1',
  'aboutAck2',
  'aboutAck3',
  'aboutAck4',
  'aboutAck5',
];

export function renderAbout() {
  const L = state.lang;
  const version = browser.runtime.getManifest().version;
  // Not state.versions: this answers "what am I running", not "what produced the shown results".
  const engineLine = formatVersions(currentVersions(), L).replace(/^\S+\s/, '');

  let feedbackSection = '';
  if (state.participateFeedback) {
    feedbackSection = `
      <section class="about-section about-feedback-section">
        <h2>${esc(t(L, 'appFbHeading'))}</h2>
        <button id="app-feedback-open" type="button" class="app-feedback-open">${esc(t(L, 'appFbOpen'))}</button>
        <form id="app-feedback-form" class="app-feedback-form" hidden>
          <label class="app-feedback-field">
            <span id="app-feedback-cat-label">${esc(t(L, 'appFbCategory'))}</span>
            <select id="app-feedback-category">
              <option value="bug">${esc(t(L, 'appFbCatBug'))}</option>
              <option value="idea">${esc(t(L, 'appFbCatIdea'))}</option>
              <option value="other">${esc(t(L, 'appFbCatOther'))}</option>
            </select>
          </label>
          <label class="app-feedback-field">
            <span id="app-feedback-msg-label">${esc(t(L, 'appFbMessage'))}</span>
            <textarea id="app-feedback-message" rows="3" placeholder="${esc(t(L, 'appFbMessagePlaceholder'))}"></textarea>
          </label>
          <div class="app-feedback-actions">
            <button id="app-feedback-save" type="submit" class="export-btn">${esc(t(L, 'appFbSave'))}</button>
            <button id="app-feedback-cancel" type="button" class="icon-btn">${esc(t(L, 'appFbCancel'))}</button>
          </div>
          <p id="app-feedback-note" class="app-feedback-note">${esc(t(L, 'appFbLocalNote'))}</p>
        </form>
      </section>`;
  }

  els.panelAbout.innerHTML = `
    <div class="about">
      <h1 class="about-title">Opquast DevTools</h1>
      <p class="about-version">${esc(t(L, 'aboutVersion'))} ${esc(version)}</p>
      <p class="about-engine">${esc(t(L, 'aboutEngine'))} ${esc(engineLine)}</p>

      <section class="about-section">
        <h2>${esc(t(L, 'aboutBriefTitle'))}</h2>
        <p>${esc(t(L, 'aboutTagline'))}</p>
      </section>

      <section class="about-section">
        <h2>${esc(t(L, 'aboutGoodToKnowTitle'))}</h2>
        <ul class="about-good-to-know">
          <li>${esc(t(L, 'aboutGoodToKnow1'))}</li>
          <li>${esc(t(L, 'aboutGoodToKnow2'))}</li>
          <li>${esc(t(L, 'aboutGoodToKnow3'))}</li>
          <li>${esc(t(L, 'aboutGoodToKnow4'))}</li>
          <li>${esc(t(L, 'aboutGoodToKnow5'))}</li>
          <li>${esc(t(L, 'aboutGoodToKnow6'))}</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>${esc(t(L, 'aboutPrivacyTitle'))}</h2>
        <p>${esc(t(L, 'aboutPrivacyBody'))}</p>
      </section>

      <section class="about-section">
        <h2>${esc(t(L, 'aboutLicenseTitle'))}</h2>
        <p>${esc(t(L, 'aboutLicenseBody'))}</p>
      </section>

      <section class="about-section">
        <h2>${esc(t(L, 'aboutLinksTitle'))}</h2>
        <ul class="about-links">
          <li><a href="${SITE_URL}" target="_blank" rel="noreferrer">${esc(t(L, 'aboutLinkSite'))}</a></li>
          <li><a href="${REFERENTIAL_URL[L]}" target="_blank" rel="noreferrer">${esc(t(L, 'aboutLinkReferential'))}</a></li>
        </ul>
      </section>

      <section class="about-section about-acknowledgments">
        <h2>${esc(t(L, 'aboutAcknowledgmentsTitle'))}</h2>
        ${ACKNOWLEDGMENTS.map((k) => `<p>${esc(t(L, k))}</p>`).join('')}
        <p class="about-signature">${esc(t(L, 'aboutSignature'))}</p>
      </section>

      ${feedbackSection}
    </div>`;

  // Attach event handlers if feedback section is rendered
  if (state.participateFeedback) {
    setupAppFeedbackForm();
  }
}

/** Set up event handlers for the app feedback form (called after rendering). */
function setupAppFeedbackForm() {
  const openBtn = document.getElementById('app-feedback-open') as HTMLButtonElement | null;
  const form = document.getElementById('app-feedback-form') as HTMLFormElement | null;
  const cancelBtn = document.getElementById('app-feedback-cancel') as HTMLButtonElement | null;
  const messageEl = document.getElementById('app-feedback-message') as HTMLTextAreaElement | null;
  const categoryEl = document.getElementById('app-feedback-category') as HTMLSelectElement | null;

  if (!openBtn || !form || !cancelBtn || !messageEl || !categoryEl) return;

  const toggleForm = (open: boolean) => {
    form.hidden = !open;
    if (open) messageEl.focus();
  };

  openBtn.addEventListener('click', () => toggleForm(true));
  cancelBtn.addEventListener('click', () => toggleForm(false));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = messageEl.value.trim();
    if (!message) return;
    const category = categoryEl.value as AppFeedbackCategory;
    state.appFeedbacks = await addAppFeedback({ category, message }, Date.now());
    messageEl.value = '';
    toggleForm(false);
    toast(t(state.lang, 'appFbSaved'));
    renderFeedbacks();
  });
}
