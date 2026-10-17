// packages/vscode-sfl/src/server/sfl-core/emitter.ts
//
// Ported verbatim from frontend/src/features/sfl-language/sfl/emitter.ts
// (SFL 1.2 canonical serialization, §15). Not needed for parsing/resolving,
// but reused here for the "Format Document" LSP feature — re-emitting a
// parsed document always produces the one canonical text form, which is
// exactly what a formatter is supposed to do.

import type {
  SflDocument, SflBlock, SflEntry, SflProperty, SflLayout, SflStyle, SflValue, BlockKind,
  SflData, SflBinding, SflHandler, SflAssignment, SflExpr,
} from './ast';

const INDENT = '  '; // two spaces per level (§15.1)

// Canonical order of layout properties (§15.4); unknown layout fields follow,
// alphabetically (§16). Applies both to a `layout {}` sub-block and to a
// reusable `Layout` block's own properties.
const LAYOUT_ORDER = ['position', 'size', 'rotation', 'order'];

// Canonical order of style properties (§15.6): structural appearance to
// detailed appearance. Applies both to a `style {}` sub-block and to a
// reusable `Style` block's own properties.
const STYLE_ORDER = [
  'shape', 'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'textColor', 'color',
  'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'verticalAlign',
  'cornerRadius', 'dash', 'shadow', 'opacity', 'icon', 'route', 'marker',
  'markerStart', 'markerEnd', 'asset',
];

export function emit(doc: SflDocument): string {
  const kindOf = buildKindIndex(doc);
  const body = joinSiblingBlocks(doc.blocks, 0, kindOf);
  const out = body ? `sfl ${doc.version}\n\n${body}` : `sfl ${doc.version}`;
  // Trailing whitespace stripped; file ends with exactly one newline (§15.8).
  return out.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n') + '\n';
}

// Document-wide name → kind index, used to classify composition-list refs as
// Style vs. Layout for canonical ordering (§15.5). Built once per emit() call.
function buildKindIndex(doc: SflDocument): Map<string, BlockKind> {
  const map = new Map<string, BlockKind>();
  const walk = (blocks: SflBlock[]) => {
    for (const b of blocks) {
      if (!map.has(b.name)) map.set(b.name, b.kind);
      walk(b.entries.filter(e => e.type === 'block').map(e => (e as any).block as SflBlock));
    }
  };
  walk(doc.blocks);
  return map;
}

// §15.4/§15.7: reusable Layout definitions stack without a blank line between
// them, likewise reusable Style definitions — each non-empty group gets a
// synthetic section header comment (`// Layout Definition` / `// Style
// Definition`). Everything else (Entity/Group/Container/Link/Model/…) keeps
// the normal blank line between sibling blocks. The headers are pure emitter
// decoration, not an AST field (comments are discarded on parse, §4.2) — they
// are re-derived from the block-kind distribution on every emit(), so
// canonicalize() stays idempotent.
function joinSiblingBlocks(blocks: SflBlock[], depth: number, kindOf: Map<string, BlockKind>): string {
  const pad = INDENT.repeat(depth);
  const layouts = blocks.filter(b => b.kind === 'Layout');
  const styles = blocks.filter(b => b.kind === 'Style');
  const others = blocks.filter(b => b.kind !== 'Layout' && b.kind !== 'Style');

  const groups: string[] = [];
  if (layouts.length) {
    groups.push(`${pad}// Layout Definition\n${layouts.map(b => emitBlock(b, depth, kindOf)).join('\n')}`);
  }
  if (styles.length) {
    groups.push(`${pad}// Style Definition\n${styles.map(b => emitBlock(b, depth, kindOf)).join('\n')}`);
  }
  for (const o of others) groups.push(emitBlock(o, depth, kindOf));

  return groups.join('\n\n');
}

// §15.5: composition-list refs canonicalize to Style-ref(s) first, then
// Layout-ref(s), then anything unresolved (defensive passthrough).
function emitComposition(composition: string[], kindOf: Map<string, BlockKind>): string {
  if (composition.length === 0) return '';
  const styleRefs = composition.filter(r => kindOf.get(r) === 'Style');
  const layoutRefs = composition.filter(r => kindOf.get(r) === 'Layout');
  const other = composition.filter(r => kindOf.get(r) !== 'Style' && kindOf.get(r) !== 'Layout');
  return ` : ${[...styleRefs, ...layoutRefs, ...other].join(' & ')}`;
}

// §14.7: a reusable Layout/Style *definition* with few properties collapses
// to one compact line (`Style Name { a: 1; b: 2 }`) instead of one property
// per line. Local `layout {}`/`style {}` sub-blocks never use this compact
// form — only the top-level reusable block kinds do. The threshold is
// deliberately a small, fixed property count rather than a line-width
// heuristic, so the rule stays deterministic and idempotent.
const COMPACT_MAX_PROPS = 3;

function emitBlock(block: SflBlock, depth: number, kindOf: Map<string, BlockKind>): string {
  const pad = INDENT.repeat(depth);
  const header = `${block.kind} ${block.name}${emitComposition(block.composition, kindOf)} {`;

  // A reusable Layout/Style block only ever holds properties (§5, Table 4)
  // and orders them like layout{}/style{}, not id/kind/text/alpha.
  const propComparator = block.kind === 'Layout' ? compareLayoutProps
    : block.kind === 'Style' ? compareStyleProps
    : compareProps;
  const properties = block.entries.filter(e => e.type === 'property').map(e => (e as any).property as SflProperty);
  const sortedProps = [...properties].sort((a, b) => propComparator(a.key, b.key));

  const isCompactDefinition = (block.kind === 'Layout' || block.kind === 'Style')
    && block.entries.every(e => e.type === 'property')
    && sortedProps.length <= COMPACT_MAX_PROPS;
  if (isCompactDefinition) {
    const body = sortedProps.map(emitProperty).join('; ');
    return body ? `${pad}${header} ${body} }` : `${pad}${header} }`;
  }

  const inner = emitBody(block.entries, sortedProps, depth, kindOf);
  return inner
    ? `${pad}${header}\n${inner}\n${pad}}`
    : `${pad}${header}\n${pad}}`;
}

// Properties, bindings and handlers, then (blank line) nested blocks —
// Layout/Style grouped+headered, others one-blank-line-separated,
// §15.4/§15.7 — then `fields {}`, `data {}`, `layout {}` and `style {}`
// attach directly (single newline, no blank line): they read as trailing
// metadata of THIS block, not as siblings of equal weight. Same order as
// stickyflow.js's emitting/blocks.ts.
function emitBody(entries: SflEntry[], sortedProps: SflProperty[], depth: number, kindOf: Map<string, BlockKind>): string {
  const innerPad = INDENT.repeat(depth + 1);
  const bindings = entries.flatMap(e => (e.type === 'binding' ? [e.binding] : []));
  const handlers = entries.flatMap(e => (e.type === 'handler' ? [e.handler] : []));
  const nestedBlocks = entries.flatMap(e => (e.type === 'block' ? [e.block] : []));

  const lines = [
    ...sortedProps.map(p => `${innerPad}${emitProperty(p)}`),
    ...bindings.map(b => `${innerPad}${emitBinding(b)}`),
    ...handlers.map(h => emitHandler(h, innerPad)),
  ].join('\n');
  const nested = joinSiblingBlocks(nestedBlocks, depth + 1, kindOf);
  const primary = [lines, nested].filter(Boolean).join('\n\n');

  const attached = [
    ...entries.flatMap(e => (e.type === 'fields' ? [emitFields(e.fields, depth + 1)] : [])),
    ...entries.flatMap(e => (e.type === 'data' ? [emitData(e.data, depth + 1, kindOf)] : [])),
    ...entries.flatMap(e => (e.type === 'layout' ? [emitLayout(e.layout, depth + 1)] : [])),
    ...entries.flatMap(e => (e.type === 'style' ? [emitStyle(e.style, depth + 1)] : [])),
  ];
  return [primary, ...attached].filter(Boolean).join('\n');
}

function emitFields(fields: SflProperty[], depth: number): string {
  const pad = INDENT.repeat(depth);
  const lines = fields.map(p => `${pad}${INDENT}${emitProperty(p)}`);
  return lines.length ? `${pad}fields {\n${lines.join('\n')}\n${pad}}` : `${pad}fields {\n${pad}}`;
}

function emitData(data: SflData, depth: number, kindOf: Map<string, BlockKind>): string {
  const pad = INDENT.repeat(depth);
  const properties = data.entries.filter(e => e.type === 'property').map(e => (e as any).property as SflProperty);
  const inner = emitBody(data.entries, [...properties].sort((a, b) => compareProps(a.key, b.key)), depth, kindOf);
  return inner ? `${pad}data {\n${inner}\n${pad}}` : `${pad}data {\n${pad}}`;
}

function emitLayout(layout: SflLayout, depth: number): string {
  const pad = INDENT.repeat(depth);
  const innerPad = INDENT.repeat(depth + 1);
  const sorted = [...layout.properties].sort((a, b) => compareLayoutProps(a.key, b.key));
  const lines = sorted.map(p => `${innerPad}${emitProperty(p)}`);
  return lines.length
    ? `${pad}layout {\n${lines.join('\n')}\n${pad}}`
    : `${pad}layout {\n${pad}}`;
}

function emitStyle(style: SflStyle, depth: number): string {
  const pad = INDENT.repeat(depth);
  const innerPad = INDENT.repeat(depth + 1);
  const sorted = [...style.properties].sort((a, b) => compareStyleProps(a.key, b.key));
  const lines = sorted.map(p => `${innerPad}${emitProperty(p)}`);
  lines.push(...(style.bindings ?? []).map(b => `${innerPad}${emitBinding(b)}`));
  return lines.length
    ? `${pad}style {\n${lines.join('\n')}\n${pad}}`
    : `${pad}style {\n${pad}}`;
}

function emitProperty(p: SflProperty): string {
  return `${p.key}: ${emitValue(p.value)}`;
}

function emitValue(v: SflValue): string {
  switch (v.type) {
    case 'string': return emitString(v.value);
    case 'number': return formatNumber(v.value);
    case 'tuple': return v.values.map(formatNumber).join(', ');
    case 'list': return `[${v.values.map(emitValue).join(', ')}]`;
    case 'ident': return v.segments.join('.');
    case 'endpoint': {
      let s = v.segments.join('.');
      if (v.side) {
        s += `, ${v.side}`;
        if (v.fraction !== undefined) s += ` (${formatNumber(v.fraction)})`;
      }
      return s;
    }
  }
}

// Expressions (bindings and handlers): parentheses only where precedence
// needs them, like stickyflow.js's emitting/expressions.ts.
const PRECEDENCE: Record<string, number> = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3, '>': 3, '<': 3, '>=': 3, '<=': 3,
  '+': 4, '-': 4, '*': 5, '/': 5,
};

function emitExpression(expr: SflExpr, parentPrecedence = 0): string {
  switch (expr.kind) {
    case 'number': return formatNumber(expr.value);
    case 'string': return emitString(expr.value);
    case 'boolean': return String(expr.value);
    case 'ref': return expr.path.join('.');
    case 'unary': return `${expr.operator}${emitExpression(expr.operand, 6)}`;
    case 'call': return `${expr.callee.join('.')}(${expr.args.map(a => emitExpression(a)).join(', ')})`;
    case 'binary': {
      const precedence = PRECEDENCE[expr.operator];
      const text = `${emitExpression(expr.left, precedence)} ${expr.operator} ${emitExpression(expr.right, precedence + 1)}`;
      return precedence < parentPrecedence ? `(${text})` : text;
    }
  }
}

function emitBinding(b: SflBinding): string {
  return `${b.key}: ${b.operator} ${emitExpression(b.expr)}`;
}

function emitAssignment(a: SflAssignment): string {
  return `${a.target.join('.')} <- ${emitExpression(a.expr)}`;
}

function emitHandler(h: SflHandler, pad: string): string {
  if (h.assignments.length === 1) return `${pad}${h.event}: ${emitAssignment(h.assignments[0])}`;
  const lines = h.assignments.map(a => `${pad}${INDENT}${emitAssignment(a)}`);
  return [`${pad}${h.event} {`, ...lines, `${pad}}`].join('\n');
}

// §15.6: strings are always single-line in double quotes. Line breaks are
// encoded as `\n` — no `"""` block on write (more readable for the mostly
// short canvas labels). The parser still accepts `"""`; the canonical form
// normalizes it to inline `\n`.
function emitString(value: string): string {
  const escaped = value
    .replace(/\r\n?/g, '\n')   // CRLF/CR → LF, before \n gets escaped
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

// §15.5: no superfluous zeros (80 not 80.0); decimal point only when needed.
function formatNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

// Property sort key within a block (§15.3 + §16). Presentational values now
// live in style{}/Style rather than as a loose top-level tier, but a stray
// presentational-named top-level property (round-trip of unknown/legacy
// data) still sorts fine here — alphabetically among "everything else".
function propRank(key: string): number {
  if (key === 'id') return 0;
  if (key === 'kind') return 1;
  if (key === 'text') return 2;
  return 3;
}

function compareProps(a: string, b: string): number {
  const ra = propRank(a), rb = propRank(b);
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareLayoutProps(a: string, b: string): number {
  const ia = LAYOUT_ORDER.indexOf(a);
  const ib = LAYOUT_ORDER.indexOf(b);
  const ra = ia === -1 ? LAYOUT_ORDER.length : ia;
  const rb = ib === -1 ? LAYOUT_ORDER.length : ib;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0; // unknown layout fields alphabetical (§16)
}

function compareStyleProps(a: string, b: string): number {
  const ia = STYLE_ORDER.indexOf(a);
  const ib = STYLE_ORDER.indexOf(b);
  const ra = ia === -1 ? STYLE_ORDER.length : ia;
  const rb = ib === -1 ? STYLE_ORDER.length : ib;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0; // unknown style fields alphabetical (§16)
}
