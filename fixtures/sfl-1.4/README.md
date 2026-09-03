# fixtures/sfl-1.4 — samples the extension can't parse yet

These are valid **SFL 1.4** documents (verified against `stickyflow.js`, whose
parser is at 1.4). They use block kinds the VS Code extension's ported grammar
does **not** know yet:

| File | 1.4 kinds exercised | Ported? |
|---|---|---|
| `symbol-ports.sfl` | `Symbol` (`points`), `Port` (`at:`), `shape:` referencing a Symbol, `entity.port` link endpoints | ❌ needs `entity.port` endpoint resolution |
| `path-choropleth.sfl` | `Path` (`points`, `closed`, `value`) | ❌ |

`Chart` / `Axis` / `Series` / `Rule` (SFL 1.4 §5.4) **have** been ported — their
samples (`chart-bar.sfl`, `chart-pie.sfl`) now live in `fixtures/valid/` and are
covered by the zero-error sweep in `src/server/__tests__/sfl-core.test.ts`.

## Why the rest are here and not in `fixtures/valid/`

`src/server/sfl-core/` started as a 1:1 port of the **SFL 1.2** grammar and is
being extended kind by kind. Its `BLOCK_KINDS` (`ast.ts`) currently reaches
`Project, Model, Group, Container, Table, Entity, Link, Layout, Style, Columns,
Column, Rows, Row, Chart, Axis, Series, Rule`, and `parser.ts` throws on
anything else. Every file under `fixtures/valid/` is swept by
`src/server/__tests__/sfl-core.test.ts` and must `parse` + `resolveDocument`
with zero errors, so a sample using a not-yet-ported kind can't live there — it
would fail the sweep.

`sfl-core.test.ts` has a guard block (`fixtures/sfl-1.4 …`) that asserts each
file here still fails to parse. It's a reminder, not a feature test.

## Promoting a sample once the parser catches up

1. Add the kinds to `BlockKind` / `BLOCK_KINDS` in `src/server/sfl-core/ast.ts`
   (mirror `stickyflow.js`'s `src/sfl/ast.ts`).
2. In `src/server/sfl-core/resolver.ts`, classify them:
   - scope openers (hold child blocks whose names are referenced): add to
     `CONTAINER_KINDS`. `Chart` deliberately is **not** one — its
     Axis/Series/Rule schema is never name-referenced (same call as `Table`).
   - structural children only ever addressed positionally: add to
     `NON_GLOBAL_KINDS` so a bare name can't resolve to them cross-scope
     (`Axis`, `Series`, `Rule` are there now).
3. For `Symbol`/`Port`: teach `entity.port` endpoint resolution (a 2-segment
   path whose last segment is a `Port` on the `Symbol` the entity's `shape:`
   points at).
4. Add the four exhaustive `Record<BlockKind, …>` entries
   (`documentSymbols.ts` `SYMBOL_KIND`, `sflDocs.ts` `BLOCK_KIND_DOCS`) — the
   build fails without them — plus completion vocab and TextMate keywords.
5. Move the sample into `fixtures/valid/` and drop it from the guard block in
   `sfl-core.test.ts`.
