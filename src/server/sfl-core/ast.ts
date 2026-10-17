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
// `Chart` (SFL 1.4 §5.4) has its own geometry, but a fixed schema of `Axis` /
// `Series` / `Rule` child blocks rather than free content — so `Chart` and its
// three child kinds are all leaves here (no scope of their own; nothing
// resolves a name through a Chart). `Rule` is a reference line (§5.4.8),
// distinct from `Axis`/`Series`. Its series can also sit in a `data { }`
// entry, written without the `Series` keyword (`revenue { values: … }`).
//
// `Table` and its `Columns`/`Column`/`Rows`/`Row`/`Footer` blocks are gone:
// stickyflow.js removed them and no longer parses a `Table` block, so they are
// left out here too and report an error instead of rendering nothing. The
// `Container name { kind: table … }` spelling is an ordinary Container.
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
//
// The stickyflow.js 0.2 batch:
//   • `Text`: a free text label on the canvas, no shape around it. Leaf.
//   • `Widget`: a live control picked by `type:` (`rollingNumber`,
//     `tickScale`, `ruler`). Leaf.
//   • `Shader`: a reusable shader surface (`program:` plus its parameters),
//     referenced by name from a style's `shader:`. Leaf, like `Style`.
//   • `DataSource`: typed `fields { }` a document can bind to. Expressions
//     read it as `source.field`. Leaf.
// Any block may now also hold bindings (`key: <- expr`), event handlers
// (`onTap: target <- expr`) and a `data { }` entry, see SflEntry.
//
// BLOCK_KINDS is the single list of block keywords: BlockKind is derived from
// it, the Record<BlockKind, …> tables (outline symbols, hover docs) fail to
// compile when a kind is missing, and scripts/check-grammar.mjs fails the
// build when the TextMate grammar doesn't highlight one. It follows
// NAMED_BLOCK_KINDS in stickyflow.js's src/sflLanguage/ast.ts.
export const BLOCK_KINDS = [
  'Project', 'Model', 'Group', 'Container', 'Shape', 'Entity', 'Link', 'Layout', 'Style',
  'Chart', 'Axis', 'Series', 'Rule',
  'Path', 'Symbol', 'Port', 'Net',
  'Isometric', 'Connection',
  'Text', 'Widget', 'Shader', 'DataSource',
] as const;

/** Block keywords stickyflow.js used to parse and has dropped, with what to use instead. */
export const REMOVED_BLOCK_KINDS: Readonly<Record<string, string>> = {
  Table: "'Table' blocks are no longer supported by stickyflow.js. Use a Container with kind: table, or a Chart",
  Columns: "'Columns' belonged to the removed Table block and is no longer supported by stickyflow.js",
  Column: "'Column' belonged to the removed Table block and is no longer supported by stickyflow.js",
  Rows: "'Rows' belonged to the removed Table block and is no longer supported by stickyflow.js",
  Row: "'Row' belonged to the removed Table block and is no longer supported by stickyflow.js",
  Footer: "'Footer' belonged to the removed Table block and is no longer supported by stickyflow.js",
};

export type BlockKind = (typeof BLOCK_KINDS)[number];

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
  | { type: 'style'; style: SflStyle }
  | { type: 'fields'; fields: SflProperty[] }
  | { type: 'data'; data: SflData }
  | { type: 'binding'; binding: SflBinding }
  | { type: 'handler'; handler: SflHandler };

/**
 * A `data { … }` entry: a Chart's series (blocks, written with or without the
 * `Series` keyword) or a DataSource's rows. Not a named block, so it has no
 * BlockKind and opens no scope.
 */
export interface SflData {
  entries: SflEntry[];
}

export type BindingOperator = '<-' | '<->' | '->';

export type ExpressionOperator = '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '!=' | '&&' | '||';

/**
 * A binding or handler expression. `ref` and `call` keep a range per path
 * segment, so go-to-definition and rename reach `source` in `source.field`.
 */
export type SflExpr =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'ref'; path: string[]; pathRanges?: SflRange[] }
  | { kind: 'unary'; operator: '!' | '-'; operand: SflExpr }
  | { kind: 'binary'; operator: ExpressionOperator; left: SflExpr; right: SflExpr }
  | { kind: 'call'; callee: string[]; args: SflExpr[] };

/** `key: <- expr` (also `<->` and `->`): a property whose value comes from an expression. */
export interface SflBinding {
  key: string;
  keyRange?: SflRange;
  operator: BindingOperator;
  expr: SflExpr;
}

/** `target <- expr` inside a handler. */
export interface SflAssignment {
  target: string[];
  targetRanges?: SflRange[];
  expr: SflExpr;
}

/** `onTap: target <- expr`, or `onTap { … }` with one assignment per line. */
export interface SflHandler {
  event: string;
  eventRange?: SflRange;
  assignments: SflAssignment[];
}

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

/** The `style { … }` sub-block — properties and bindings, no nested blocks (§5). */
export interface SflStyle {
  properties: SflProperty[];
  bindings?: SflBinding[];
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
