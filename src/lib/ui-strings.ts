// Lightweight UI localization tied to the user's selected language (not the browser locale),
// so the panel and options page switch together with the checklist content. FR + EN.

export type Lang = 'fr' | 'en';

const STRINGS = {
  // Options page
  optTitle: { fr: 'Opquast — Préférences', en: 'Opquast — Preferences' },
  optSiteAccess: { fr: 'Accès aux sites', en: 'Site access' },
  optGrant: { fr: "Autoriser l'accès à tous les sites", en: 'Allow access to all sites' },
  optHostGranted: {
    fr: "✓ L'extension peut analyser tous les sites.",
    en: '✓ The extension can analyse every site.',
  },
  optHostMissing: {
    fr: "L'extension n'a pas accès aux sites : l'analyse ne peut pas s'exécuter.",
    en: 'The extension has no access to sites: the analysis cannot run.',
  },
  optChecklists: { fr: 'Référentiels à utiliser', en: 'Checklists to use' },
  optDefault: { fr: 'Checklist par défaut', en: 'Default checklist' },
  optAutoRun: { fr: "Lancer les tests à l'ouverture", en: 'Run the tests when the panel opens' },
  optShowThemas: { fr: 'Afficher la colonne « Rubrique »', en: 'Show the "Section" column' },
  optParticipate: {
    fr: "Participer à l'amélioration de cette application",
    en: 'Help improve this application',
  },
  optHint: {
    fr: 'Les préférences sont enregistrées automatiquement et appliquées au panneau DevTools « Opquast ».',
    en: 'Preferences are saved automatically and applied to the "Opquast" DevTools panel.',
  },
  optData: { fr: 'Données locales', en: 'Local data' },
  optHistoryCount: {
    fr: 'Analyses enregistrées dans ce navigateur : {n}',
    en: 'Analyses stored in this browser: {n}',
  },
  optClearHistory: { fr: "Effacer l'historique des analyses", en: 'Clear the analysis history' },
  optClearHistoryConfirm: {
    fr: 'Effacer toutes les analyses enregistrées ? Vos corrections manuelles et vos feedbacks sont conservés.',
    en: 'Clear every stored analysis? Your manual changes and feedbacks are kept.',
  },
  optHistoryCleared: { fr: 'Historique effacé', en: 'History cleared' },
  // Panel chrome (static markup, filled through data-i18n attributes)
  relaunch: { fr: 'Relancer', en: 'Relaunch' },
  checklistLabel: { fr: 'Checklist', en: 'Checklist' },
  langLabel: { fr: 'Langue', en: 'Language' },
  viewsLabel: { fr: 'Vues', en: 'Views' },
  loading: {
    fr: 'Lancement des tests. Merci de patienter…',
    en: 'Running the tests. Please wait…',
  },
  globalScore: { fr: 'Score global', en: 'Overall score' },
  scorePassTests: { fr: '{n} tests conformes', en: '{n} tests passed' },
  scoreFailTests: { fr: '{n} tests non conformes', en: '{n} tests failed' },
  scorePass: { fr: '{n} conformes', en: '{n} passed' },
  scoreFail: { fr: '{n} non conformes', en: '{n} failed' },
  display: { fr: 'Afficher ▾', en: 'Show ▾' },
  showThemas: { fr: 'Rubriques', en: 'Sections' },
  colTags: { fr: 'Tags', en: 'Tags' },
  show_c: { fr: 'Conformes', en: 'Passed' },
  show_nc: { fr: 'Non conformes', en: 'Failed' },
  show_i: { fr: 'À vérifier', en: 'To verify' },
  show_na: { fr: 'Non applicables', en: 'Not applicable' },
  show_nt: { fr: 'Non testés', en: 'Not tested' },
  searchLabel: { fr: 'Rechercher', en: 'Search' },
  selectAll: { fr: 'Tout sélectionner', en: 'Select all' },
  previousTitle: { fr: 'Résultat précédent', en: 'Previous result' },
  nextTitle: { fr: 'Résultat suivant', en: 'Next result' },
  edited: { fr: 'Modifié', en: 'Edited' },
  originalValue: { fr: 'Original : {v}', en: 'Original: {v}' },
  empty: { fr: '(vide)', en: '(empty)' },
  element: { fr: '(élément)', en: '(element)' },
  filterPlaceholder: { fr: 'Filtrer…', en: 'Filter…' },
  csvTitle: { fr: 'Exporter en CSV', en: 'Export as CSV' },
  settings: { fr: 'Paramètres', en: 'Settings' },
  colResult: { fr: 'Résultat', en: 'Result' },
  colNum: { fr: 'N°', en: 'No.' },
  colThema: { fr: 'Rubrique', en: 'Section' },
  colDesc: { fr: 'Description', en: 'Description' },
  emptyStart: {
    fr: 'Lance une analyse pour voir les résultats.',
    en: 'Run an analysis to see results.',
  },
  emptyNone: { fr: 'Aucun critère.', en: 'No criteria.' },
  running: { fr: 'Injection du moteur et exécution…', en: 'Injecting engine and running…' },
  engineNotInjected: {
    fr: "Le moteur d'analyse n'a pas pu s'exécuter sur cette page (CSP restrictive ou page protégée). Les résultats affichés ne sont pas fiables.",
    en: 'The analysis engine could not run on this page (restrictive CSP or protected page). The results shown are not reliable.',
  },
  errorPermissionTitle: {
    fr: 'Autorisation nécessaire',
    en: 'Permission needed',
  },
  errorPermissionIntro: {
    fr: "L'extension n'a pas l'autorisation de lire ce site.",
    en: "The extension isn't allowed to read this site.",
  },
  errorPermissionOpenSettings: {
    fr: "Ouvrir les paramètres de l'extension",
    en: 'Open the extension settings',
  },
  errorPermissionGrant: {
    fr: "« Autoriser l'accès à tous les sites ».",
    en: '"Allow access to all sites".',
  },
  errorPermissionAltFirefox: {
    fr: 'Ou : about:addons → Opquast DevTools → Permissions → « Accéder à vos données pour tous les sites web ».',
    en: 'Or: about:addons → Opquast DevTools → Permissions → "Access your data for all websites".',
  },
  errorPermissionAltChrome: {
    fr: 'Ou : chrome://extensions → Opquast DevTools → Détails → « Accès aux sites » → « Sur tous les sites ».',
    en: 'Or: chrome://extensions → Opquast DevTools → Details → "Site access" → "On all sites".',
  },
  errorPermissionDone: {
    fr: "Une fois l'autorisation accordée, cliquez sur Relancer.",
    en: 'Once permission is granted, click Relaunch.',
  },
  errorPrivateTitle: {
    fr: 'Fenêtre de navigation privée',
    en: 'Private window',
  },
  errorPrivateFirefox: {
    fr: "Firefox n'autorise pas cette extension dans les fenêtres privées. Pour l'y autoriser : about:addons → Opquast DevTools → « Exécution dans les fenêtres privées » → Autoriser.",
    en: 'Firefox does not allow this extension in private windows. To allow it: about:addons → Opquast DevTools → "Run in Private Windows" → Allow.',
  },
  errorPrivateChrome: {
    fr: "Chrome n'autorise pas cette extension en navigation privée. Pour l'y autoriser : chrome://extensions → Opquast DevTools → Détails → « Autoriser en mode navigation privée ».",
    en: 'Chrome does not allow this extension in Incognito. To allow it: chrome://extensions → Opquast DevTools → Details → "Allow in Incognito".',
  },
  errorPrivateDone: {
    fr: 'Rouvrez ensuite les outils de développement, puis cliquez sur Relancer.',
    en: 'Then reopen the developer tools and click Relaunch.',
  },
  errorRestrictedTitle: {
    fr: 'Page non analysable',
    en: 'This page cannot be analysed',
  },
  errorRestrictedIntro: {
    fr: "Le navigateur interdit à toutes les extensions d'accéder à cette page : pages internes (about:, chrome:), nouvel onglet, visionneuse PDF, mode lecture, boutiques d'extensions…",
    en: 'The browser keeps every extension out of this page: internal pages (about:, chrome:), new tab, PDF viewer, reader view, extension stores…',
  },
  errorRestrictedDone: {
    fr: 'Ouvrez une page web classique, puis cliquez sur Relancer.',
    en: 'Open a regular web page, then click Relaunch.',
  },
  errorTechDetail: {
    fr: 'Détail technique',
    en: 'Technical detail',
  },
  runFailedAccess: {
    fr: "L'analyse n'a pas pu accéder à la page : l'explication est dans l'onglet Scores.",
    en: 'The analysis could not reach the page: the Scores tab explains why.',
  },
  runFailed: {
    fr: "L'analyse a échoué. Cliquez sur Relancer pour réessayer.",
    en: 'The analysis failed. Click Relaunch to try again.',
  },
  runTimedOut: {
    fr: "L'analyse n'a pas répondu. Cliquez sur Relancer pour réessayer.",
    en: 'The analysis did not answer. Click Relaunch to try again.',
  },
  secResult: { fr: 'Résultat :', en: 'Result:' },
  secComment: { fr: 'Commentaire', en: 'Comment' },
  secDetails: { fr: 'Détails', en: 'Details' },
  occurrences: { fr: 'Occurrences', en: 'Occurrences' },
  inspect: { fr: 'Inspecter', en: 'Inspect' },
  notFound: { fr: 'élément introuvable dans la page', en: 'element not found in the page' },
  forcedNtNote: {
    fr: 'non testé : l’extension ne peut pas recueillir ce dont ce test a besoin (gestionnaires d’événements ajoutés par script)',
    en: 'not tested: the extension cannot collect what this test needs (event listeners added by script)',
  },
  st_c: { fr: 'Conforme', en: 'Pass' },
  st_nc: { fr: 'Non conforme', en: 'Fail' },
  st_i: { fr: 'À vérifier', en: 'To verify' },
  st_na: { fr: 'Non applicable', en: 'Not applicable' },
  st_nt: { fr: 'Non testé', en: 'Not tested' },
  // Manual modification UI
  changeResult: { fr: 'Modifier le résultat', en: 'Change result' },
  addComment: { fr: 'Notes personnelles', en: 'Personal notes' },
  saveComment: { fr: 'Enregistrer', en: 'Save' },
  userModified: { fr: 'Modifié manuellement', en: 'Manually modified' },
  resetToAuto: { fr: 'Rétablir le résultat automatique', en: 'Reset to automatic result' },
  rerunCriterion: { fr: 'Relancer', en: 'Re-run' },
  rerunning: { fr: 'Analyse…', en: 'Running…' },
  originalResult: { fr: 'Résultat auto :', en: 'Auto result:' },
  saved: { fr: 'enregistré', en: 'saved' },
  // Tabs and navigation
  tabScores: { fr: 'Scores', en: 'Scores' },
  tabResults: { fr: 'Résultats', en: 'Results' },
  // Scores view
  chooseChecklists: { fr: 'Choisir les checklists', en: 'Choose checklists' },
  analysisOf: { fr: 'Analyse du', en: 'Analysis of' },
  at: { fr: 'à', en: 'at' },
  // Modal navigation
  previous: { fr: 'Précédent', en: 'Previous' },
  next: { fr: 'Suivant', en: 'Next' },
  close: { fr: 'Fermer', en: 'Close' },
  closeEsc: { fr: 'Fermer (Échap)', en: 'Close (Esc)' },
  // Feedback (traceability journal)
  tabFeedbacks: { fr: 'Feedbacks', en: 'Feedbacks' },
  tabAbout: { fr: 'À propos', en: 'About' },
  // About panel
  aboutBriefTitle: { fr: 'En bref', en: 'In brief' },
  aboutTagline: {
    fr: "Outil d'analyse qualité proposé par la société Opquast, directement dans les outils de développement du navigateur.",
    en: 'Quality analysis tool by Opquast, right inside the browser DevTools.',
  },
  aboutGoodToKnowTitle: { fr: 'Bon à savoir', en: 'Good to know' },
  aboutGoodToKnow1: {
    fr: "Au moment de l'installation, vous devrez peut-être cocher la case d'autorisation « Accéder à vos données pour tous les sites web ».",
    en: 'During installation, you may need to check the "Access your data for all websites" permission.',
  },
  aboutGoodToKnow2: {
    fr: "Dans un premier temps, nous avons repris le code d'Opquast Desktop et l'avons actualisé avec les règles de la version 5 et les outils actuels.",
    en: 'Initially, we took the Opquast Desktop code and updated it with version 5 rules and current tools.',
  },
  aboutGoodToKnow3: {
    fr: "Pour l'instant, les tests inclus dans l'extension sont d'ordre déterministe. Les tests ne sont pas encore bons, nous le savons, et nous avons besoin de vous pour nous aider.",
    en: "For now, the tests included in the extension are deterministic. We know the tests aren't great yet, and we need your help.",
  },
  aboutGoodToKnow4: {
    fr: 'Des tests probabilistes seront introduits à un moment ou à un autre mais commençons par le déterministe.',
    en: "Probabilistic tests will be introduced at some point, but let's start with deterministic ones.",
  },
  aboutGoodToKnow5: {
    fr: 'Il y aura beaucoup de versions avant la version 1, à vous de nous dire de quoi vous avez besoin.',
    en: 'There will be many versions before version 1 — tell us what you need.',
  },
  aboutGoodToKnow6: {
    fr: "Si vous voulez participer à l'amélioration de l'extension, cochez la case correspondante dans les préférences. Vous aurez des détails sur les tests effectués et vous pourrez aussi préparer et éventuellement envoyer des feedbacks par mail.",
    en: "To help improve the extension, check the corresponding box in preferences. You'll get details on tests performed and can prepare and send feedback by email.",
  },
  aboutVersion: { fr: 'Version', en: 'Version' },
  aboutEngine: { fr: 'Moteur', en: 'Engine' },
  versionEngine: { fr: 'moteur', en: 'engine' },
  versionOverlay: { fr: 'overlay', en: 'overlay' },
  versionUnknown: {
    fr: 'moteur non tracé (analyse antérieure à la 0.6)',
    en: 'engine not traced (analysis predates 0.6)',
  },
  versionMismatch: { fr: '≠ version installée', en: '≠ installed version' },
  criterionRerun: { fr: 'réanalysé ({v})', en: 're-analysed ({v})' },
  fbEmailHeaderExt: { fr: 'Extension', en: 'Extension' },
  fbEmailHeaderEngine: { fr: 'Moteur', en: 'Engine' },
  fbEmailHeaderDate: { fr: 'Préparé le', en: 'Prepared on' },
  aboutPrivacyTitle: { fr: 'Confidentialité', en: 'Privacy' },
  aboutPrivacyBody: {
    fr: "Toutes vos données restent sur votre appareil. Rien n'est envoyé à Opquast (sauf les mails si vous envoyez vos feedbacks).",
    en: 'All your data stays on your device. Nothing is sent to Opquast (except emails if you send your feedbacks).',
  },
  aboutLicenseTitle: { fr: 'Licences', en: 'Licensing' },
  aboutLicenseBody: {
    fr: "Code sous tri-licence MPL-1.1 / GPL-2.0 / LGPL-2.1 ; moteur d'analyse sous MPL-2.0. Les règles Opquast sont diffusées sous licence CC BY-SA 4.0.",
    en: 'Code tri-licensed MPL-1.1 / GPL-2.0 / LGPL-2.1; analysis engine under MPL-2.0. Opquast rules are distributed under CC BY-SA 4.0.',
  },
  aboutLinksTitle: { fr: 'Liens', en: 'Links' },
  aboutLinkSite: { fr: 'Site Opquast', en: 'Opquast website' },
  aboutLinkReferential: { fr: 'Référentiel & licence', en: 'Referential & license' },
  aboutAcknowledgmentsTitle: { fr: 'Remerciements', en: 'Acknowledgments' },
  aboutAck1: {
    fr: "Cette extension est la reprise de l'extension Opquast Desktop développée par l'incroyable équipe d'Opquast aux alentours de 2013 : Olivier Meunier, Fabrice Bonny, Mickaël Hoareau, Samuel Martin avec l'aide de Laurent Denis pour l'expertise qualité et accessibilité et Muriel de Dona et moi-même pour la partie ergonomique.",
    en: "This extension carries on the Opquast Desktop extension, built around 2013 by Opquast's incredible team: Olivier Meunier, Fabrice Bonny, Mickaël Hoareau and Samuel Martin, with Laurent Denis for quality and accessibility expertise, and Muriel de Dona and myself for the user experience.",
  },
  aboutAck2: {
    fr: "Merci à Éric Gateau et Aurélien Lévy qui effectuaient des missions de conseil et d'audit qui nous aidaient à avoir les moyens de développer les outils Opquast. Nous avons vraiment fait des choses incroyables, je ne les oublierai jamais.",
    en: 'Thanks to Éric Gateau and Aurélien Lévy, whose consulting and audit work gave us the means to build the Opquast tools. We really did incredible things; I will never forget them.',
  },
  aboutAck3: {
    fr: "En 2026, j'ai repris le code d'Opquast Desktop sous l'impulsion de Benjamin Hannache et avec l'aide de Claude Code qui a grandement facilité le portage du code.",
    en: 'In 2026, I took up the Opquast Desktop code again, prompted by Benjamin Hannache and helped by Claude Code, which made porting the code much easier.',
  },
  aboutAck4: {
    fr: "J'adresse un immense remerciement à l'équipe du projet Opquast à ce moment-là. Vous n'êtes pas là, mais vous êtes là quand même.",
    en: 'A huge thank-you to the Opquast project team of that time. You are not here, and yet you are here all the same.',
  },
  aboutAck5: {
    fr: 'Merci également à celles et ceux qui nous font des retours et nous encouragent.',
    en: 'Thanks also to everyone who sends us feedback and encouragement.',
  },
  aboutSignature: { fr: 'Elie Sloïm — Juillet 2026', en: 'Elie Sloïm — July 2026' },
  fbTitle: { fr: 'Préparer un feedback', en: 'Prepare feedback' },
  fbHint: {
    fr: "Vos feedbacks sont enregistrés dans l'onglet Feedbacks. Vous pourrez les transmettre par mail quand vous le souhaiterez.",
    en: 'Your feedbacks are saved in the Feedbacks tab. You can send them by e-mail whenever you like.',
  },
  fbCommentPlaceholder: { fr: 'Votre remarque…', en: 'Your remark…' },
  fbSend: { fr: 'Enregistrer le retour', en: 'Save feedback' },
  fbSaved: { fr: 'Retour enregistré', en: 'Feedback saved' },
  fbAlready: {
    fr: 'Retour déjà enregistré (identique)',
    en: 'Feedback already recorded (identical)',
  },
  fbReplaceAsk: {
    fr: 'Un retour de ce type existe déjà pour ce critère sur cette page. Le remplacer ?',
    en: 'A feedback of this type already exists for this criterion on this page. Replace it?',
  },
  fbReplaced: { fr: 'Retour remplacé', en: 'Feedback replaced' },
  fbNone: { fr: 'Aucun feedback enregistré.', en: 'No feedback recorded yet.' },
  fbDelete: { fr: 'Supprimer', en: 'Delete' },
  fbExport: { fr: 'Exporter', en: 'Export' },
  // General app feedback (opinion about the extension itself)
  appFbOpen: { fr: 'Donner mon avis', en: 'Give feedback' },
  appFbHeading: { fr: "Votre avis sur l'application", en: 'Your feedback on the app' },
  appFbCategory: { fr: 'Catégorie', en: 'Category' },
  appFbCatBug: { fr: 'Problème / bug', en: 'Problem / bug' },
  appFbCatIdea: { fr: 'Idée d’amélioration', en: 'Improvement idea' },
  appFbCatOther: { fr: 'Autre', en: 'Other' },
  appFbMessage: { fr: 'Votre message', en: 'Your message' },
  appFbMessagePlaceholder: {
    fr: "Dites-nous ce que vous pensez de l'application…",
    en: 'Tell us what you think of the app…',
  },
  appFbSave: { fr: 'Enregistrer', en: 'Save' },
  appFbCancel: { fr: 'Annuler', en: 'Cancel' },
  appFbSaved: { fr: 'Avis enregistré localement', en: 'Feedback saved locally' },
  appFbLocalNote: {
    fr: "Vos avis restent sur votre appareil. Rien n'en sort tant que vous ne cliquez pas sur « Préparer un e-mail avec les feedbacks sélectionnés » dans l'onglet Feedbacks, et c'est vous qui envoyez cet e-mail.",
    en: 'Your feedback stays on your device. Nothing leaves it until you click "Prepare an e-mail with selected feedbacks" in the Feedbacks tab, and you are the one who sends that e-mail.',
  },
  appFbEmailSubject: { fr: 'Opquast DevTools — avis', en: 'Opquast DevTools — feedback' },
  // Unified feedbacks table
  fbColOrigin: { fr: 'Origine', en: 'Origin' },
  fbColType: { fr: 'Type', en: 'Type' },
  fbOriginResult: { fr: 'Résultats', en: 'Results' },
  fbOriginApp: { fr: 'Avis appli', en: 'App feedback' },
  fbRule: { fr: 'Règle {n}', en: 'Rule {n}' },
  fbDeleteConfirm: { fr: 'Supprimer ce feedback ?', en: 'Delete this feedback?' },
  confirmYes: { fr: 'Oui', en: 'Yes' },
  confirmNo: { fr: 'Non', en: 'No' },
  fbUnfold: { fr: 'Déplier', en: 'Expand' },
  fbFold: { fr: 'Replier', en: 'Collapse' },
  fbEdit: { fr: 'Modifier', en: 'Edit' },
  fbSelectRow: { fr: 'Sélectionner cette ligne', en: 'Select this row' },
  fbSelected: { fr: '{n} sélectionné(s)', en: '{n} selected' },
  fbBulkTransmit: {
    fr: 'Préparer un e-mail avec les feedbacks sélectionnés',
    en: 'Prepare an e-mail with selected feedbacks',
  },
  fbBulkExport: { fr: 'Exporter', en: 'Export' },
  fbBulkDelete: { fr: 'Supprimer', en: 'Delete' },
  fbBulkDeleteConfirm: {
    fr: 'Supprimer les feedbacks sélectionnés ?',
    en: 'Delete the selected feedback?',
  },
  fbColDate: { fr: 'Date', en: 'Date' },
  fb_confirm: { fr: 'Confirmé', en: 'Confirmed' },
  fb_refute: { fr: 'Infirmé', en: 'Refuted' },
  fb_clarify: { fr: 'Précision', en: 'Clarification' },
  fb_change: { fr: 'Changement', en: 'Change' },
  fb_note: { fr: 'Note', en: 'Note' },
  // Accessibility labels and announcements
  setResult: { fr: 'Marquer « {s} »', en: 'Mark as "{s}"' },
  fbColActions: { fr: 'Actions', en: 'Actions' },
  srAnalysisDone: {
    fr: 'Analyse terminée : {n} critères.',
    en: 'Analysis finished: {n} criteria.',
  },
  srAnalysisFailed: { fr: "L'analyse a échoué.", en: 'The analysis failed.' },
  actionFailed: {
    fr: "L'action n'a pas abouti. Le détail est dans la console du panneau.",
    en: 'The action did not complete. The details are in the panel console.',
  },
  // Feedbacks kept while participation is off
  fbParticipationOff: {
    fr: 'La participation est désactivée : aucun nouveau feedback ne vous est proposé. Ceux déjà enregistrés restent ici, sur votre appareil, jusqu’à ce que vous les supprimiez ; vous pouvez aussi les exporter. Cet onglet disparaît quand il n’en reste plus.',
    en: 'Participation is off: no new feedback is offered. Those already recorded stay here, on your device, until you delete them; you can also export them. This tab disappears once none are left.',
  },
  optParticipateOffKept: {
    fr: 'Vos {n} feedbacks déjà enregistrés ne sont pas supprimés : ils restent dans l’onglet Feedbacks du panneau Opquast, où vous pouvez les exporter ou les supprimer. L’onglet disparaît quand il n’en reste plus.',
    en: 'Your {n} feedbacks already recorded are not deleted: they stay in the Feedbacks tab of the Opquast panel, where you can export or delete them. The tab disappears once none are left.',
  },
  // Test procedure section
  secProcedure: { fr: 'Procédure de test', en: 'Test procedure' },
  procManual: { fr: 'Manuel', en: 'Manual' },
  procAuto: { fr: 'Automatique', en: 'Automated' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  const entry = STRINGS[key];
  // A key missing from the table (a typo in markup) shows as itself rather than breaking the page.
  if (!entry) return key;
  return entry[lang] ?? entry.fr;
}

/**
 * Fill the static markup of a page: `data-i18n="key"` sets the text, `data-i18n-title`,
 * `data-i18n-aria-label` and `data-i18n-placeholder` set the matching attribute.
 */
export function localizeDocument(lang: Lang, root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(lang, el.dataset.i18n as StringKey);
  }
  for (const attr of ['title', 'aria-label', 'placeholder']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(lang, el.getAttribute(`data-i18n-${attr}`) as StringKey));
    }
  }
  document.documentElement.lang = lang;
}

export function statusLabel(lang: Lang, status: string): string {
  const key = `st_${status}` as StringKey;
  return key in STRINGS ? t(lang, key) : status;
}

export function feedbackKindLabel(lang: Lang, kind: string): string {
  const key = `fb_${kind}` as StringKey;
  return key in STRINGS ? t(lang, key) : kind;
}
