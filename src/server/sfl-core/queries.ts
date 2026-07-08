// packages/vscode-sfl/src/server/sfl-core/queries.ts
//
// Shared read-only helpers over a parsed SflDocument, used by every LSP
// feature (diagnostics/completion/hover/definition/rename/semanticTokens):
// walking the block tree, hit-testing a cursor position against the ranges
// parser.ts now records, and resolving a Style's effective (inherited)
// property set. New code — no frontend equivalent, since the in-app editor
// never needed position hit-testing.

import type {
  SflDocument, SflBlock, SflEntry, SflProperty, SflPosition, SflRange, SflValue, BlockKind,
} from './ast';

/** Recursively visits every block in the document, including nested ones. */
export function walkBlocks(blocks: SflBlock[], visit: (block: SflBlock, parent: SflBlock | undefined) => void, parent?: SflBlock): void {
  for (const block of blocks) {
    visit(block, parent);
    const nested = block.entries.filter((e): e is Extract<SflEntry, { type: 'block' }> => e.type === 'block').map(e => e.block);
    walkBlocks(nested, visit, block);
  }
}

export function allBlocks(doc: SflDocument): SflBlock[] {
  const out: SflBlock[] = [];
  walkBlocks(doc.blocks, (b) => out.push(b));
  return out;
}

export function findBlockByName(doc: SflDocument, name: string, kinds?: readonly BlockKind[]): SflBlock | undefined {
  return allBlocks(doc).find(b => b.name === name && (!kinds || kinds.includes(b.kind)));
}

export function collectBlockNames(doc: SflDocument, kinds?: readonly BlockKind[]): { name: string; kind: BlockKind }[] {
  return allBlocks(doc)
    .filter(b => !kinds || kinds.includes(b.kind))
    .map(b => ({ name: b.name, kind: b.kind }));
}

function inRange(pos: SflPosition, range: SflRange): boolean {
  return pos.line === range.start.line && pos.character >= range.start.character && pos.character <= range.end.character;
}

/** What the cursor is currently sitting on, for hover/definition/rename. */
export type PositionHit =
  | { type: 'blockName'; block: SflBlock }
  | { type: 'styleRef'; block: SflBlock; name: string; range: SflRange }
  | { type: 'propertyKey'; block: SflBlock; property: SflProperty }
  | { type: 'pathSegment'; block: SflBlock; property: SflProperty; segments: string[]; segmentIndex: number; range: SflRange };

/**
 * Finds what the given position hits: a block's own name (definition site),
 * a style reference, a property key, or a segment of an ident/endpoint path
 * value (from/to, or a bare keyword/path like `shape: pill`).
 */
export function findAtPosition(doc: SflDocument, pos: SflPosition): PositionHit | undefined {
  let hit: PositionHit | undefined;

  const visitProperty = (block: SflBlock, property: SflProperty) => {
    if (hit) return;
    if (property.keyRange && inRange(pos, property.keyRange)) {
      hit = { type: 'propertyKey', block, property };
      return;
    }
    hit = findInValue(block, property, property.value, pos);
  };

  walkBlocks(doc.blocks, (block) => {
    if (hit) return;
    if (block.nameRange && inRange(pos, block.nameRange)) {
      hit = { type: 'blockName', block };
      return;
    }
    if (block.style && block.styleRange && inRange(pos, block.styleRange)) {
      hit = { type: 'styleRef', block, name: block.style, range: block.styleRange };
      return;
    }
    for (const entry of block.entries) {
      if (hit) break;
      if (entry.type === 'property') visitProperty(block, entry.property);
      else if (entry.type === 'layout') for (const p of entry.layout.properties) { if (hit) break; visitProperty(block, p); }
    }
  });

  return hit;
}

function findInValue(block: SflBlock, property: SflProperty, value: SflValue, pos: SflPosition): PositionHit | undefined {
  if ((value.type === 'ident' || value.type === 'endpoint') && value.segmentRanges) {
    for (let i = 0; i < value.segmentRanges.length; i++) {
      if (inRange(pos, value.segmentRanges[i])) {
        return { type: 'pathSegment', block, property, segments: value.segments, segmentIndex: i, range: value.segmentRanges[i] };
      }
    }
  }
  if (value.type === 'list') {
    for (const v of value.values) {
      const inner = findInValue(block, property, v, pos);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** Stringifies a value for hover/completion display, e.g. `"#d9ff00"`, `pill`, `100, 100`. */
export function valueToDisplayString(value: SflValue): string {
  switch (value.type) {
    case 'string': return `"${value.value}"`;
    case 'number': return String(value.value);
    case 'tuple': return value.values.join(', ');
    case 'list': return `[${value.values.map(valueToDisplayString).join(', ')}]`;
    case 'ident': return value.segments.join('.');
    case 'endpoint': {
      let s = value.segments.join('.');
      if (value.side) s += ` ${value.side}`;
      if (value.fraction !== undefined) s += ` ${value.fraction}`;
      return s;
    }
  }
}

/**
 * Resolves a Style's effective property set by walking its single-parent
 * inheritance chain (§9.2, base first, most specific last — later entries in
 * the returned map override earlier ones on collision, mirroring the
 * emitter's "Entity-Property > Style-Property > Default" precedence for the
 * style layer itself).
 */
export function effectiveStyleProperties(doc: SflDocument, style: SflBlock): Map<string, SflValue> {
  const chain: SflBlock[] = [];
  const seen = new Set<string>();
  let cur: SflBlock | undefined = style;
  while (cur) {
    if (seen.has(cur.name)) break; // cycle guard — diagnostics already flag this
    seen.add(cur.name);
    chain.unshift(cur);
    cur = cur.style ? findBlockByName(doc, cur.style, ['Style']) : undefined;
  }

  const props = new Map<string, SflValue>();
  for (const s of chain) {
    for (const entry of s.entries) {
      if (entry.type === 'property') props.set(entry.property.key, entry.property.value);
    }
  }
  return props;
}
