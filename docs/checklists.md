# Checklists

The extension ships two checklists, both from the Opquast referential
["Qualité Numérique"](https://checklists.opquast.com/):

| Slug | Name | Criteria | Automated |
| --- | --- | --- | --- |
| `901-opquast-basics` | Opquast Basics | 65 | 35 |
| `900-opquast-v5` | Web Quality — Opquast V5 | 245 | 108 |

Opquast Basics is the subset of V5 tagged "Basics": its criteria have the same identifiers, so it
uses the V5 rulesets as they are. A criterion without a ruleset is shown as "not tested", for a
human to review.

## Where the data comes from

```
Opquast API ──fetch-v5-checklist──▶ data/checklists/{en,fr}/900-opquast-v5.json
                                       │
                                  derive-basics
                                       ▼
                                data/checklists/{en,fr}/901-opquast-basics.json
                                       │
                                  sync-assets (build)
                                       ▼
                                public/checklists/  (+ index.json)
```

- `scripts/fetch-v5-checklist.mjs` downloads V5 from the Opquast API (it needs an API key, so
  this step is for Opquast maintainers) and keeps only the fields the extension shows: criterion
  number, description, section (`thema`), tags and phases.
- `scripts/derive-basics.mjs` extracts the Basics criteria and checks there are exactly 65.
- `scripts/sync-assets.mjs` copies both into the build and writes `index.json`, the list the
  panel and the options page read. It names each checklist in each language (the English V5 name
  is set there, as the API gives it in French).

Each criterion looks like:

```json
"53950": {
  "checklist": { "id": 900, "name": "Qualité Web - Opquast V5" },
  "name": "1",
  "thema": "Contenus",
  "description": "Il est possible de connaître les nouveaux contenus ou services.",
  "tags": ["…"],
  "phases": ["…"]
}
```

## Automation status

`data/v5-automation-triage.json` lists every V5 criterion with how far it can be automated
(fully, partly with a human decision, needs HTTP headers, manual only), the approach, the rules it
can reuse, and whether it is implemented and tested. Adding a rule is described in
[`data/engine-overlay/README.md`](../data/engine-overlay/README.md).

Each rule's plain-language description, shown under "Test procedure" in the criterion detail,
is in `data/test-descriptions/{en,fr}.json`, keyed by the rule name.

## Retired checklists

Opquast Desktop came with about ten other checklists (earlier Opquast versions, SEO, web
performance, accessibility frameworks, open data). They were retired before the first release of
this extension and are not part of this repository. Preferences that still name one fall back to
Opquast Basics.

## License

The checklist content is © Opquast, distributed under CC BY-SA 4.0. See
[`data/checklists/LICENSE`](../data/checklists/LICENSE).
