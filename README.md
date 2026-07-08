# SFL Language Support (VS Code)

Language support for [SFL 1.1](../../docs/sfl-1.1-spezifikation.md) (`.sfl` files).

## What's implemented

- **Language registration** — `.sfl` files are recognized, with `//` comments,
  bracket matching, and indent-on-`{` (`language-configuration.json`).
- **Syntax highlighting** — a TextMate grammar (`syntaxes/sfl.tmLanguage.json`)
  covering block headers, style refs, `layout`, strings (incl. `"""…"""`),
  numbers, property keys, and comments.
- **Language server** (`src/server/`), built on a ported copy of
  [`frontend/src/features/sfl/`](../../frontend/src/features/sfl/)'s
  lexer/parser/resolver (see `src/server/sfl-core/`), extended to track source
  ranges:
  - **Diagnostics** — parse errors, unresolved `from:`/`to:` endpoints,
    unresolved style refs, duplicate names, style-inheritance cycles.
  - **Completion** — block keywords, property keys, closed-vocabulary values
    (`kind`, `shape`, `route`, …), Style names after `:` in a block header,
    and in-document Entity/Group/Container names inside `from:`/`to:`.
  - **Hover** — a Style's effective (inherited) properties; an Entity's kind
    + text; a known `kind:` value's meaning from the spec.
  - **Go to Definition** — Ctrl/Cmd+click a style ref or a `from:`/`to:`
    path segment to jump to its declaration.
  - **Rename (F2)** — renaming a block updates its declaration and every
    `from:`/`to:`/style reference that resolves to it, in one edit.
  - **Semantic tokens** — refines the regex-based grammar above with the real
    resolver: a block-name declaration vs. a reference that actually
    resolves vs. a plain keyword value, which TextMate regex can't tell apart.

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
  `FilledPill`, Ctrl/Cmd+click a `from:`/`to:` target.
- `fixtures/valid/minimal-entity.sfl` — smallest valid document.
- `fixtures/valid/value-kinds.sfl` — property value variety.

To see diagnostics in action, duplicate a block name or point a `from:` at a
name that doesn't exist:

```sfl
sfl 1.1

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
resolve with zero errors), plus diagnostics and rename edit-set tests.

## Notes

- The language server core (`src/server/sfl-core/`) is a ported, range-
  extended copy of the frontend's SFL module — the same "1:1 port" pattern
  already used for `backend/app/services/ai/sfl/`. It doesn't re-export from
  `frontend/` to keep this extension fully self-contained; if the frontend
  parser's grammar changes, port the change here too.
- `publisher` in `package.json` is a placeholder — update it before actually
  publishing to the Marketplace.
