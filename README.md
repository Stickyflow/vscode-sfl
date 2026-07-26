# SFL Language Support (VS Code)

Language support for [SFL 1.2](../../docs/SFL/sfl-1.2-spezifikation.md) (`.sfl` files).

## What's implemented

- **Language registration** — `.sfl` files are recognized, with `//` comments,
  bracket matching, and indent-on-`{` (`language-configuration.json`).
- **Syntax highlighting** — a TextMate grammar (`syntaxes/sfl.tmLanguage.json`)
  covering block headers, composition lists (`: Ref & Ref`), `layout {}` /
  `style {}` sub-blocks, strings (incl. `"""…"""`), numbers, property keys,
  and comments. Colors are pinned via `package.json`'s `configurationDefaults`
  to match the in-app SFL editor's own palette (see
  `frontend/src/features/sfl-language/sfl/editor/styles/right-sfl-sidebar.css`)
  regardless of your active VS Code theme — currently the dark variant only;
  see **Notes** below.
- **Language server** (`src/server/`), built on a ported copy of
  [`frontend/src/features/sfl-language/sfl/`](../../frontend/src/features/sfl-language/sfl/)'s
  lexer/parser/resolver/emitter (see `src/server/sfl-core/`), extended to
  track source ranges:
  - **Diagnostics** — parse errors, unresolved `from:`/`to:` endpoints,
    unresolved composition refs, duplicate names, style/layout-inheritance
    cycles, a Group referencing a Layout (use a Container instead).
  - **Completion** — block keywords, property keys, closed-vocabulary values
    (`kind`, `shape`, `route`, …), Style/Layout names after `:` or `&` in a
    block header, and in-document Entity/Group/Container names inside
    `from:`/`to:`.
  - **Hover** — a Style's/Layout's effective (inherited) properties; an
    Entity's kind + text; a known `kind:` value's meaning from the spec.
  - **Go to Definition** — Ctrl/Cmd+click a composition ref or a `from:`/`to:`
    path segment to jump to its declaration.
  - **Rename (F2)** — renaming a block updates its declaration and every
    `from:`/`to:`/composition reference that resolves to it, in one edit.
    Rejects invalid identifiers and name collisions before editing anything.
  - **Find All References** (Shift+F12) — every occurrence of a block,
    read-only counterpart to rename.
  - **Outline** (Ctrl+Shift+O / breadcrumbs) — the block tree, with an
    Entity's `kind:` (or its composition list) as the detail text.
  - **Format Document** — canonical serialization (§15) via the ported
    emitter. Only runs on a document with zero syntax errors, to avoid
    silently deleting a broken line.
  - **Semantic tokens** — capability is registered but intentionally emits no
    tokens right now; see the comment in `src/server/features/semanticTokens.ts`
    for why (it was fighting the color-parity goal above).

## Debugging (F5)

```
npm install
npm run compile   # or `npm run watch` — the "Run Extension" launch config also runs this for you
```

Then open this folder (`packages/vscode-sfl/`) as its own VS Code window and
press **F5** (or run the **"Run Extension"** / **"Extension + Server"**
compound launch config). This opens an Extension Development Host with the
language server already attached — breakpoints in `src/server/**` work
through the "Attach to Server" config.

In the Extension Development Host, open one of the repo's shared fixtures to
smoke-test:

- `fixtures/valid/checkout-flow.sfl` — the full example: nested groups, style
  inheritance, conditional links. Try F2 on `load_cart`, hover over
  `FilledPill`, Ctrl/Cmd+click a `from:`/`to:` target, Shift+F12 on
  `BasePill`, Shift+Alt+F to format.
- `fixtures/valid/minimal-entity.sfl` — smallest valid document.
- `fixtures/valid/value-kinds.sfl` — property value variety, incl. a local
  `style {}` sub-block and endpoint side/fraction syntax.

To see diagnostics in action, duplicate a block name or point a `from:` at a
name that doesn't exist:

```sfl
sfl 1.2

Entity a {
  text: "A"
}

Link broken {
  from: a
  to: does_not_exist
}
```

## Tests

```
npm test
```

Runs the ported core against `fixtures/valid/*.sfl` (round-trip parse +
resolve with zero errors) plus dedicated SFL 1.2 syntax coverage (composition
lists, Layout blocks, `style {}` sub-blocks, endpoint side/fraction), and unit
tests for diagnostics, rename, references, document symbols, and formatting.

## Notes

- The language server core (`src/server/sfl-core/`) is a ported, range-
  extended copy of the frontend's SFL module — the same "1:1 port" pattern
  already used for `backend/app/services/ai/sfl/`. It doesn't re-export from
  `frontend/` to keep this extension fully self-contained; **if the frontend
  parser's grammar changes again (as it did from 1.1 to 1.2), port the change
  here too** — nothing enforces the two staying in sync automatically.
- Color parity (`configurationDefaults` in `package.json`) ships the app's
  **dark** palette only. `editor.tokenColorCustomizations` has no generic
  "if the active theme is dark" switch — only exact theme-name keys — so a
  static default can't adapt to light themes. If light-theme parity matters,
  the extension would need to detect `vscode.window.activeColorTheme.kind` at
  runtime and write the customization itself; that wasn't done here to avoid
  an extension writing to user settings without being asked.
- `publisher` in `package.json` is a placeholder — update it before actually
  publishing to the Marketplace.
