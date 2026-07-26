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
  - Format Document (canonical serialization).
- Optional file icon theme ("SFL File Icons") showing the StickyFlow logo for
  `.sfl` files.

### Known limitations

- Color parity covers dark themes only; no light-theme equivalent yet.
- Semantic tokens capability is registered but currently emits nothing (see
  `src/server/features/semanticTokens.ts` for why).
- Not yet published; `publisher` is a placeholder.
