# Permissions — justification

Opquast DevTools requests the following permissions. Every use is **local to the
inspected page**; nothing is transmitted to external services (see
[PRIVACY.md](PRIVACY.md)).

| Permission | Why it is needed |
| --- | --- |
| `scripting` | Inject the Opquast analysis engine into the inspected page's **isolated world** on demand (the core feature). |
| `activeTab` | Standard DevTools access to the tab currently being inspected. |
| `storage`, `unlimitedStorage` | Persist analyses, overrides and feedbacks in IndexedDB and preferences in `storage.local`, entirely on-device. `unlimitedStorage` covers the history of analyses, which can grow large. |
| `host_permissions: <all_urls>` | The extension must work on **any page a developer inspects**. It is used to inject the engine, read the inspected tab's URL, re-fetch the scripts, stylesheets and images the page itself references (their size, headers and content are checked), and fetch site-root artefacts of the page's site (`robots.txt`, `sitemap.xml`, a 404 probe, the `www.` variant). |

## Notes for reviewers

- **No data exfiltration.** The extension makes no calls to Opquast or any third
  party. All network activity targets the inspected page's site and the
  resources that page already loads.
- **`<all_urls>` is inherent to a general-purpose DevTools auditing tool** — the
  set of sites a developer may inspect is not known in advance. Data handling is
  local-only regardless of the site.
- **No `tabs` permission.** The inspected tab's URL and loading status are
  obtained through the `<all_urls>` host permission. The broad `tabs` permission
  is therefore not requested.
- **No `webRequest` permission** (removed in 0.7.0, along with the unused
  "reload + capture" mode).
