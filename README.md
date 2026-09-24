<p align="center">
  <img src="assets/Distel.png" alt="StickyFlow" width="900">
</p>

<div align="center">

# vscode-sfl

**Language support for SFL diagrams in VS Code.**

</div>

SFL is the text format behind [StickyFlow](https://github.com/Stickyflow)
diagrams. This extension makes `.sfl` files feel like any other language in
your editor: highlighting, errors as you type, completion, hover docs,
go-to-definition, rename and formatting. It covers SFL 1.4, the same grammar
[`stickyflow.js`](https://github.com/Stickyflow/stickyflow.js) renders.

Want to see the diagram too? Installing this extension also installs its
companion, [`vscode-sfl-preview`](https://github.com/Stickyflow/vscode-sfl-preview),
which renders a live preview next to the editor.

## Why vscode-sfl?

An SFL diagram is just text, so it lives next to your code: it diffs,
reviews and version-controls like everything else in the repo. But a text
format is only pleasant to write if the editor understands it. Without
language support, a typo in a `from:` target or a misspelled style name
only shows up when the diagram renders wrong.

With it, you get the feedback loop you already expect from a real language.
Rename a block and every link pointing at it follows. Hover a style and see
the properties it inherits. Ctrl+click a link endpoint and land on the
shape it connects to.

```sfl
sfl 1.4

Style Pill {
  shape: pill
  fill: "#d9ff00"
}

Model checkout {
  Entity add_products : Pill {
    kind: process
    text: "Add products"
  }

  Entity pay : Pill {
    kind: process
    text: "Pay"
  }

  Link add_to_pay {
    from: add_products
    to: pay
  }
}
```

## Features

- **Syntax highlighting** for block headers, composition lists
  (`: Style & Style`), `layout {}` / `style {}` sub-blocks, strings
  (including `"""…"""`), numbers, property keys and comments.
- **Diagnostics**: parse errors, `from:`/`to:` targets that don't exist,
  unknown style or layout references, duplicate names, inheritance cycles.
- **Completion** for block keywords, property keys, fixed values (`kind`,
  `shape`, `route`, …), style and layout names after `:` or `&`, and the
  names of your own entities inside `from:`/`to:`.
- **Hover docs** for keywords, properties and their accepted values, plus a
  style's effective (inherited) properties.
- **Go to Definition** (Ctrl/Cmd+click), **Find All References**
  (Shift+F12) and **Rename** (F2), which updates the declaration and every
  reference in one edit and refuses name collisions.
- **Outline** and breadcrumbs showing the block tree.
- **Format Document** (Shift+Alt+F), skipped when the file has syntax
  errors so a broken line is never silently dropped.
- An optional **file icon theme** that gives `.sfl` files the StickyFlow
  logo (see [Notes](#notes)).

All SFL 1.4 block kinds are supported, including `Table`, the chart kinds
(`Chart`, `Axis`, `Series`, `Rule`), `Path`, `Symbol` / `Port`, `Net` and
`Footer`.

## Installation

Install **SFL Language Support** from the
[VS Code Marketplace](MARKETPLACE_URL), or from inside VS Code:

1. Open the Extensions view (Ctrl/Cmd+Shift+X).
2. Search for **SFL Language Support**.
3. Click **Install**.

This also installs [SFL Preview](https://github.com/Stickyflow/vscode-sfl-preview)
for live diagram rendering. Open any `.sfl` file and the language server
starts automatically.

To build and install from source instead:

```bash
npm install
npm run package          # produces vscode-sfl-0.1.0.vsix
code --install-extension vscode-sfl-0.1.0.vsix
```

## Development

```bash
npm install
npm run compile          # or `npm run watch`
```

Open this folder in VS Code and press **F5**. That launches an Extension
Development Host with the language server attached; the **Attach to
Server** config lets breakpoints in `src/server/**` hit.

The `fixtures/valid/` folder is a good playground. `checkout-flow.sfl`
exercises most features: try F2 on `load_cart`, hover `FilledPill`,
Ctrl+click a `from:` target or Shift+F12 on `BasePill`.

### Tests

```bash
npm test                   # unit tests (vitest), no VS Code needed
npm run test:integration   # launches a real VS Code with the extension
```

Unit tests round-trip every fixture through the parser and cover each
language feature directly. Integration tests check what unit tests can't:
that the extension activates and the client actually talks to the server.

If integration tests fail when run from a terminal inside VS Code (or an
AI assistant's sandbox), run them from a plain terminal instead. A leaked
`ELECTRON_RUN_AS_NODE=1` or a Windows installer mutex are the usual
culprits.

## Notes

- **The parser is a copy.** `src/server/sfl-core/` is a ported copy of the
  SFL parser, extended to track source ranges, so the extension stays
  self-contained. When the SFL grammar changes, port the change here too:
  nothing keeps the copies in sync automatically.
- **Colors are fixed to a dark palette.** Highlighting colors are pinned to
  match the StickyFlow editor, regardless of your VS Code theme. They look
  best on dark themes.
- **The file icon theme replaces your current one.** VS Code can't add a
  single icon to an existing theme, so enabling **SFL File Icons**
  (Ctrl+Shift+P → *File Icon Theme*) swaps out your whole icon set.

## 🙌 Contributing

The extension is small and self-contained, which makes it a good place to
start. Two goals behind that:

- 🌱 **Grow it.** Semantic tokens, light-theme colors, quick fixes for
  common diagnostics, whatever's missing from your workflow: PRs are
  welcome.
- 🛠️ **Make it yours.** Each language feature lives in its own file under
  `src/server/features/`, so a focused change doesn't require understanding
  the whole server first.

See [Development](#development) to get set up. Found a bug or have an idea?
Open an issue or send a PR: small and focused beats big and perfect. We'll
review, comment if needed, and merge when we're happy with it. 🚀
