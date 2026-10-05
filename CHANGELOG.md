# Changelog

All notable changes to the SFL Language Support extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - Unreleased

First working version. Not yet published to the Marketplace (`publisher` in
`package.json` is a placeholder).

### Added

- Language registration for `.sfl` files: comments, bracket matching,
  indent-on-`{` (`language-configuration.json`).
- TextMate syntax highlighting (`syntaxes/sfl.tmLanguage.json`) for SFL 1.2 —
  block headers, composition lists (`: Ref & Ref`), `layout {}` / `style {}`
  sub-blocks, strings (incl. `"""…"""`), numbers, property keys, comments.
- Colors pinned to match the in-app SFL editor's dark palette via
  `configurationDefaults`, regardless of the active VS Code theme.
- A language server (`src/server/`) built on a ported, range-extended copy of
  the frontend's SFL lexer/parser/resolver/emitter, providing:
  - Diagnostics (parse errors, unresolved references, duplicate names,
    style/layout-inheritance cycles, invalid Group/Layout composition).
  - Completion (block keywords, property keys, closed-vocabulary values,
    composition refs, in-scope block names in `from:`/`to:`).
  - Hover, including documentation for block kinds and property keys.
  - Go to Definition.
  - Rename (F2), with identifier/collision validation.
  - Find All References.
  - Outline / document symbols.
- Bundled with the new `vscode-sfl-preview` extension via `extensionPack`, so
  installing this extension also installs the diagram preview.
  - Format Document (canonical serialization).
- Optional file icon theme ("SFL File Icons") showing the StickyFlow logo for
  `.sfl` files.
- `Table` block kind (§12.1a) — parsing, resolution, highlighting, hover
  docs, completion, and outline support, including its `Columns`/`Rows`/
  `Column`/`Row` structure and table-specific `style`/`layout` properties
  (`showHeader`, `headerFill`, `gridColor`, `gridWidth`, `borderStyle`,
  `headerRuleStyle`, `rowHeight`). Added after discovering the extension had
  fallen behind the language: `Table` shipped elsewhere in the repo on
  2026-07-20/25 and this was the first time anyone checked whether the
  extension still matched.
- `Chart` block kind (SFL 1.4 §5.4) and its `Axis` / `Series` / `Rule` child
  kinds — parsing, resolution, highlighting, hover docs, completion, and
  outline support. `Chart` carries its own geometry like a `Container` but a
  fixed schema, so it (like `Table`) opens no resolvable scope; `Axis` /
  `Series` / `Rule` names stay out of the global reference index. Adds the
  chart property vocabulary (`type`, `stacked`, `categories`, `min` / `max` /
  `step`, `unit`, `label`, `values`, `error`, `at`) and the `type:` value
  list (`bar`, `line`, `pie`, `scatter`, …). Real `.sfl` chart files
  previously hit `expected ':'` / `unknown block kind` in the editor while
  rendering fine in the preview (which runs the up-to-date `stickyflow.js`
  parser).
- `Path` (§3.3), `Symbol` / `Port` (§5.5 / §3.5), `Net` (§3.5) and `Footer`
  (§3.6) block kinds — the rest of the SFL 1.4 batch. Brings the ported
  grammar to parity with `stickyflow.js`'s own SFL. `Path` is a freeform
  shape and, like `Entity`, a valid `from:`/`to:` endpoint; `Symbol` / `Port`
  / `Net` / `Footer` are leaves kept out of the global reference index.
  Adds `entity.portName` named-port endpoint resolution — a `Link` endpoint
  whose last segment names a `Port` on the `Symbol` the entity's `shape:`
  points at — plus the `points` / `closed` / `value` / `tension` / `members`
  property vocabulary and hover docs. The `fixtures/sfl-1.4/` staging area is
  gone; its samples moved into `fixtures/valid/` under the zero-error sweep.
- `Shape` block kind, matching stickyflow.js (which now emits `Shape` for new
  canvas objects). `Entity` stays an equivalent alias: both get the same
  highlighting, completion, hover docs, outline entry, required-content check
  and named-port endpoint resolution. Previously a `Shape` block was a parse
  error.
- `Isometric` and `Connection` block kinds, matching stickyflow.js. `Isometric`
  is a leaf canvas object (a 3D box; `size` takes a third depth value) and a
  valid `from:`/`to:` endpoint. `Connection` links two Isometric objects by
  cube face and gets the same required `from`/`to` validation as a `Link`.
  Adds the `fromFace` / `toFace` (with value completion), `labelOffsetX` /
  `labelOffsetY` and `labelBackground` vocabulary, plus highlighting, hover
  docs and outline entries. Previously both were `unknown block kind` errors.

- Style templates: the *SFL: Apply Style Template* command (Night Lime,
  Midnight Violet, Graphite Mono, Paper Navy, Charcoal Pastel). It writes the template's
  `tpl_*` Style blocks into the file and points every shape, container,
  table, link, isometric object and Connection at them, replacing their
  existing Style reference and removing local overrides the template sets.
  A block's shape (its own or from the Style it loses) is kept. Start
  nodes (`kind: start`, or without one, shapes a flow starts from) get the
  accent style; a template can also style `kind: decision`, `kind: input`
  and the decision outcome nodes `kind: yes` / `kind: no` (all templates
  style yes/no; Charcoal Pastel also decision and input). `yes` and `no` are new `kind:` completions with hover docs; they're
  not in the SFL spec yet. Every template also splits each link from a
  decision labelled with a yes or no word into decision -> branch node ->
  target, placing the circle in the gap on the target's center line. `tpl_canvas` carries the canvas color for
  hosts that paint a background. Re-applying replaces the previous template;
  the result is re-parsed before anything is written.

### Changed

- The language server caches the parsed document per version. Diagnostics,
  completion, hover and the outline for the same keystroke now share one
  parse + resolve instead of reparsing for every request.
- `BLOCK_KINDS` is the single list of block keywords; `BlockKind` is derived
  from it. `npm run compile` also runs `check:grammar`, which fails when the
  TextMate grammar doesn't highlight a kind from that list.

### Fixed

- Table schema keywords (`Columns`, `Column`, `Rows`, `Row`) were missing from
  the TextMate grammar, so they showed as plain text instead of keywords.

### Known limitations

- Color parity covers dark themes only; no light-theme equivalent yet.
- Semantic tokens capability is registered but currently emits nothing (see
  `src/server/features/semanticTokens.ts` for why).
- Not yet published; `publisher` is a placeholder.
