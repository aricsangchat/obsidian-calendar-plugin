# Changelog

## 1.6.0 — 2026-09-01

First release of an unofficial maintenance fork. The upstream plugin's last
commit was 2022-11-04.

This is a **robustness and maintenance release**. It does not claim to fix the
crash reported in upstream #417 — see "What is not fixed" below.

### Fixed

- **`Reveal active note` threw when the calendar pane was closed.** Both
  `Reveal active note` and `Open Weekly Note` dereferenced `this.view`, which is
  only assigned when the view is constructed. With the pane closed the commands
  failed with `TypeError: Cannot read properties of undefined (reading 'view')`.
  They now create the leaf on demand.
- **`Menu` constructor.** `new Menu(app)` no longer matches the API; the
  argument was removed.
- **`OpenViewState.mode`.** Moved under `state`, so the default view mode was
  being dropped when opening a note.

### Hardened

- **Locale week start.** The settings tab read `window._bundledLocaleWeekSpec.dow`
  unconditionally. Upstream populates that global from `moment.localeData()._week`
  during onload, which can be undefined on a cold start with a non-English
  locale. Now falls back to moment, then to Monday.

  Note for anyone applying the one-line fix suggested in #417
  (`(spec && spec.dow) || 1`): `dow: 0` is Sunday and falsy, so that version
  silently rewrites every Sunday-start locale — `en-US` included — to Monday.
  This release handles `0` correctly and has regression tests covering it.

- **Workspace lifecycle.** Replaced the `layout-ready` event with
  `Workspace.onLayoutReady()`. `layout-ready` still fires at runtime on 1.13.7
  but is no longer in the public typings, so this is hardening against an
  undocumented API rather than a bug fix.

### Build

- TypeScript 4.2 could no longer parse the current `obsidian` and `codemirror`
  type definitions, and rollup was emitting output anyway — so the build
  succeeded while silently broken. Upgraded TypeScript, rollup, and the Obsidian
  API, and deduplicated a second bundled copy of moment.
- `strict` and `verbatimModuleSyntax` are deliberately pinned off to keep this a
  maintenance release rather than a rewrite. Worth tightening separately.
- Added the project's first tests: 6 unit tests plus a cold-start harness that
  exercises the built bundle against a simulated Obsidian API.

### What is not fixed

The crash reported in upstream #417 — `Cannot read properties of undefined
(reading 'dow')` on a non-English locale — **could not be reproduced** on macOS
with Obsidian 1.13.7, using a French display language, a cleared workspace, and
the unpatched build. The settings tab rendered normally. The original reporter
was on Windows.

The defensive fix above is correct and tested, but it is unverified against the
conditions that actually produce that report. If you hit this crash, please open
an issue with your OS, Obsidian version, and display language.
