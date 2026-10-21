# Contributing

Thank you for helping. The most useful contributions are often the simplest:

- **A wrong verdict**: open an issue with the page (or a minimal HTML file), the criterion number,
  the verdict you got and the one you expected.
- **A bug in the panel**: the browser and its version, what you did, what you saw.
- **A pull request**: see below.

Issues and pull requests can be written in English or French.

## Set up

Node.js 22 and git.

```bash
git clone --recurse-submodules https://github.com/Opquast/opquast-devtools.git
cd opquast-devtools
npm ci
npm run sync-assets    # generates public/ and src/engine/*.generated.ts (dev and build also do)
npm run dev            # or dev:firefox
```

If you cloned without `--recurse-submodules`: `git submodule update --init`.

The analysis engine is the `packages/opquast-test-runner` submodule. Do not edit it here: new V5
rules go into `data/engine-overlay/` (see its README), changes to the engine itself into
[opquast-test-runner](https://github.com/Opquast/opquast-test-runner).

## Before you open a pull request

```bash
npm run sync-assets && npm run compile && npm run lint && npm run format:check && npm test
```

`git config core.hooksPath .githooks` runs these before every push. CI runs them too, with both
builds, the engine's golden baseline (`golden:v5`) and the end-to-end suite.

Depending on what you changed:

| You changed | Also run |
| --- | --- |
| a rule, a ruleset or a function of the overlay | `npm run golden:v5`, `npm run test:v5` (and bump the overlay version) |
| the panel, the options page, the background | `npm run e2e` |
| the checklists | `npm run test:basics` |
| a string shown to users | add it in French **and** English in `src/lib/ui-strings.ts` |

## How this project is written

This extension rests on the work of the Opquast Desktop team. Opquast Desktop and its analysis
engine were written and funded by Opquast, under the Temesis SAS brand, between 2013 and 2016, in a
project led by Elie Sloïm: Olivier Meunier, Fabrice Bonny, Mickaël Hoareau and Samuel Martin built
them, with Laurent Jouanneau on the engine, Laurent Denis for quality and accessibility expertise,
and Muriel de Dona and Elie Sloïm for the user experience. Éric Gateau and Aurélien Lévy, through
their consulting and audit work, gave the team the means to build the Opquast tools. Their engine
still runs every analysis, and the extension carries on their design.

Since 2026, most of the code, tests and documentation of this extension have been written with
[Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant, working under the
direction of a human maintainer at Opquast. The maintainer sets the goals, reviews and tests every
change, decides what is merged, and is answerable for it. Commits made this way carry a
`Co-Authored-By: Claude` trailer.

What this means for you:

- Your contribution is reviewed by the same maintainer, with the same tests, whether you wrote it
  alone or with an AI assistant.
- Contributions written with an AI assistant are welcome, provided you understand them, have run
  them, and can answer questions about them. Say so in the pull request; add the matching
  `Co-Authored-By` trailer if your tool provides one.
- Verdicts are the heart of this tool: a change that alters one needs a test page showing the
  expected result, whoever or whatever wrote it.

## Conventions

- TypeScript, strict. Code, comments and commit messages in English.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `fix(panel): …`, `feat(overlay): …`, `docs: …`. The body says why.
- Add or update the tests that cover your change; note user-visible changes in `CHANGELOG.md`
  under the unreleased version.
- No telemetry and no request to a third-party service: the extension only talks to the page it
  inspects and its site (see [`PRIVACY.md`](PRIVACY.md)).

## Where things are

[`docs/architecture.md`](docs/architecture.md) walks through an analysis from the panel to the
stored result; [`docs/checklists.md`](docs/checklists.md) explains where the checklists come from.

## License

By contributing, you agree that your contribution is distributed under the licenses of the files
you change: MPL-1.1 / GPL-2.0 / LGPL-2.1 for the extension code, MPL-2.0 for the engine overlay
in `data/engine-overlay/` (see [`LICENSE`](LICENSE)).
