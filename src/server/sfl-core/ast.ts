// packages/vscode-sfl/src/server/sfl-core/ast.ts
//
// Ported from frontend/src/features/sfl-language/sfl/ast.ts (SFL 1.2 AST),
// the same way backend/app/services/ai/sfl/ast.py is a 1:1 port for the
// backend. This copy adds one thing the frontend original doesn't need:
// source Ranges on the nodes editor features (hover/definition/rename/
// semantic tokens) have to point at — the block-kind keyword, the block
// name, each composition-list reference, property keys, and ident/endpoint
// path segments. Everything else mirrors the original exactly.
//
// See docs/sfl-1.2-spezifikation.md §17 (EBNF) for the grammar this mirrors.

/** 0-based line/character position (LSP convention), unlike the 1-based Token.line/col in lexer.ts. */
export interface SflPosition {
  line: number;
  character: number;
}

export interface SflRange {
  start: SflPosition;
  end: SflPosition;
}

// `Container` = spatial container (Frame/Swimlane/…, distinguished via
// `kind:`); holds grouped or individual Entities. `Entity` remains the leaf.
// `Layout`/`Style` are reusable, referenceable leaves (§8/§9), like `Entity`.
// `Table` (§12.1a) has its own geometry like `Container`, but deliberately
// isn't one: it holds a fixed `Columns`/`Rows` schema instead of freely
// placeable children, so it's a leaf here too (no scope of its own) — the
// legacy `Container name { kind: table … }` spelling still parses fine as
// an ordinary Container, no special-casing needed for it.
// `Chart` (SFL 1.4 §5.4) is the same shape as `Table`: its own geometry, but
// a fixed schema of `Axis` / `Series` / `Rule` child blocks rather than free
// content — so `Chart` and its three child kinds are all leaves here too (no
// scope of their own; nothing resolves a name through a Chart). `Rule` is a
// reference line (§5.4.8), distinct from `Axis`/`Series`.
//
// The rest of the SFL 1.4 batch, mirroring `stickyflow.js`'s own
// `src/sfl/language/ast.ts`:
//   • `Path` (§3.3) — a freeform named shape (`points` / `closed` / `value`),
//     a leaf like `Entity` and, like it, a valid `from:`/`to:` endpoint.
//   • `Symbol` (§5.5) — a reusable named shape referenced as the *value* of
//     `shape:` (not via a `:` composition list); holds `Port` children. Leaf.
//   • `Port` (§3.5) — a named connection point inside a `Symbol`, addressed as
//     `entity.portName` on a Link endpoint (the entity's `shape:` points at
//     the Symbol). Leaf.
//   • `Net` (§3.5, "pattern C") — a multi-terminal net authored once instead
//     of N-1 Links; `members` is a bare-name list. Parse-only, leaf.
//   • `Footer` (§3.6) — a Table summary row, sibling to `Rows`, cell values
//     keyed by Column name like a `Row`. Leaf.
//   • `Shape` is the current keyword for the leaf canvas object; `Entity` is
//     still accepted as an equivalent alias (stickyflow.js treats both the
//     same and now emits `Shape` for new blocks). Everywhere `Entity` is
//     special-cased below, `Shape` is too.
//   • `Isometric`: a 3D box drawn in isometric projection; `size` takes a
//     third value for its depth. A leaf canvas object like `Shape`, and a
//     valid `from:`/`to:` endpoint.
//   • `Connection`: a Link between two Isometric objects, attached to a
//     cube face (`fromFace` / `toFace`) instead of a 2D side. Same
//     required `from`/`to` as a Link. Leaf.
export type BlockKind =
  | 'Project' | 'Model' | 'Group' | 'Container' | 'Table' | 'Shape' | 'Entity' | 'Link' | 'Layout' | 'Style'
  | 'Columns' | 'Column' | 'Rows' | 'Row'
  | 'Chart' | 'Axis' | 'Series' | 'Rule'
  | 'Path' | 'Symbol' | 'Port' | 'Net' | 'Footer'
  | 'Isometric' | 'Connection';

export const BLOCK_KINDS: readonly BlockKind[] = [
  'Project', 'Model', 'Group', 'Container', 'Table', 'Shape', 'Entity', 'Link', 'Layout', 'Style',
  'Columns', 'Column', 'Rows', 'Row',
  'Chart', 'Axis', 'Series', 'Rule',
  'Path', 'Symbol', 'Port', 'Net', 'Footer',
  'Isometric', 'Connection',
];

export type Side = 'top' | 'bottom' | 'left' | 'right';

export const SIDES: readonly Side[] = ['top', 'bottom', 'left', 'right'];

/** Document root: `sfl 1.2` header + a sequence of top-level blocks. */
export interface SflDocument {
  version: string;
  blocks: SflBlock[];
}

/**
 * A block: `Kind Name [: composition-list] { entries }`.
 * `composition` holds the raw identifiers after the colon, in authored order
 * (§8/§17: `identifier , { "&" , identifier }`). Whether a given ref is a
 * Style or a Layout reference is a semantic question resolved by looking up
 * the ref's target block kind (§9) — the parser stays purely syntactic and
 * does not classify them.
 */
export interface SflBlock {
  kind: BlockKind;
  /** Range of the block-kind keyword token itself (e.g. "Entity", "Model") — needed to color/distinguish container vs. leaf keywords. */
  kindRange?: SflRange;
  name: string;
  /** Range of the name token — the definition site for go-to-definition/rename. */
  nameRange?: SflRange;
  composition: string[];
  /** Range of each composition-list reference, parallel to `composition`. */
  compositionRanges?: SflRange[];
  /** Full span of the block, from the kind keyword through the closing '}' — needed for the Outline/document-symbols tree. */
  range?: SflRange;
  entries: SflEntry[];
}

export type SflEntry =
  | { type: 'property'; property: SflProperty }
  | { type: 'block'; block: SflBlock }
  | { type: 'layout'; layout: SflLayout }
  | { type: 'style'; style: SflStyle };

/** `key: value` (newline- or `;`-terminated). */
export interface SflProperty {
  key: string;
  /** Range of the property key token. */
  keyRange?: SflRange;
  value: SflValue;
}

/** The `layout { … }` sub-block — only properties, no nested blocks (§5). */
export interface SflLayout {
  properties: SflProperty[];
}

/** The `style { … }` sub-block — only properties, no nested blocks (§5). */
export interface SflStyle {
  properties: SflProperty[];
}

// ─── Values (§7 / §17) ────────────────────────────────────────────────────

export type SflValue =
  | SflStringValue
  | SflNumberValue
  | SflTupleValue
  | SflListValue
  | SflIdentValue
  | SflEndpointValue;

export interface SflStringValue {
  type: 'string';
  value: string;
  multiline: boolean;
}

export interface SflNumberValue {
  type: 'number';
  value: number;
}

/** `position: 100, 100` — two or more comma-separated numbers (§17 tuple). */
export interface SflTupleValue {
  type: 'tuple';
  values: number[];
}

/** `tags: ["a", "b"]` — bracketed, comma-separated values (§7.1). */
export interface SflListValue {
  type: 'list';
  values: SflValue[];
}

/**
 * A bare identifier or dot-path (`pill`, `cart.load_cart`). Syntactically a
 * keyword and a single-segment path are identical (§7.2); the distinction is
 * semantic (resolved by property name), so both share this node.
 */
export interface SflIdentValue {
  type: 'ident';
  segments: string[];
  /** Range of each segment, parallel to `segments`. */
  segmentRanges?: SflRange[];
}

/**
 * `from`/`to` only (§10/§16): `path [ "," side [ "(" fraction ")" ] ]`.
 * Not a general value type — the parser produces it exclusively for from/to.
 */
export interface SflEndpointValue {
  type: 'endpoint';
  segments: string[];
  /** Range of each path segment, parallel to `segments`. */
  segmentRanges?: SflRange[];
  side?: Side;
  fraction?: number;
}

// ─── Small constructors (keep call sites terse) ────────────────────────────

export const str = (value: string, multiline = false): SflStringValue => ({ type: 'string', value, multiline });
export const num = (value: number): SflNumberValue => ({ type: 'number', value });
export const tuple = (values: number[]): SflTupleValue => ({ type: 'tuple', values });
export const list = (values: SflValue[]): SflListValue => ({ type: 'list', values });
export const ident = (...segments: string[]): SflIdentValue => ({ type: 'ident', segments });
export const endpoint = (segments: string[], side?: Side, fraction?: number): SflEndpointValue =>
  ({ type: 'endpoint', segments, side, fraction });

export const isSide = (s: string): s is Side => (SIDES as readonly string[]).includes(s);
/** `Shape` and its legacy alias `Entity`: the leaf canvas object. */
export const isShapeKind = (kind: BlockKind): boolean => kind === 'Shape' || kind === 'Entity';

export const isBlockKind = (s: string): s is BlockKind => (BLOCK_KINDS as readonly string[]).includes(s);
