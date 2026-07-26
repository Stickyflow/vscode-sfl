// packages/vscode-sfl/src/server/sfl-core/queries.ts
//
// Shared read-only helpers over a parsed SflDocument, used by every LSP
// feature (diagnostics/completion/hover/definition/rename/semanticTokens):
// walking the block tree, hit-testing a cursor position against the ranges
// parser.ts records, and resolving a Style's or Layout's effective
// (inherited) property set. New code — no frontend equivalent, since the
// in-app editor never needed position hit-testing.

import type {
  SflDocument, SflBlock, SflEntry, SflProperty, SflPosition, SflRange, SflValue, BlockKind,
} from './ast';
import type { ResolveResult } from './resolver';

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
  | { type: 'compositionRef'; block: SflBlock; name: string; refIndex: number; range: SflRange }
  | { type: 'propertyKey'; block: SflBlock; property: SflProperty }
  | { type: 'pathSegment'; block: SflBlock; property: SflProperty; segments: string[]; segmentIndex: number; range: SflRange };

/**
 * Finds what the given position hits: a block's own name (definition site),
 * a composition-list reference (`: Ref & Ref`, §8), a property key, or a
 * segment of an ident/endpoint path value (from/to, or a bare keyword/path
 * like `shape: pill`).
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
    if (block.compositionRanges) {
      for (let i = 0; i < block.compositionRanges.length; i++) {
        if (inRange(pos, block.compositionRanges[i])) {
          hit = { type: 'compositionRef', block, name: block.composition[i], refIndex: i, range: block.compositionRanges[i] };
          return;
        }
      }
    }
    for (const entry of block.entries) {
      if (hit) break;
      if (entry.type === 'property') visitProperty(block, entry.property);
      else if (entry.type === 'layout') for (const p of entry.layout.properties) { if (hit) break; visitProperty(block, p); }
      else if (entry.type === 'style') for (const p of entry.style.properties) { if (hit) break; visitProperty(block, p); }
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
      if (value.side) {
        s += `, ${value.side}`;
        if (value.fraction !== undefined) s += ` (${value.fraction})`;
      }
      return s;
    }
  }
}

// Document-wide name → kind index (mirrors emitter.ts's buildKindIndex): used
// to classify a composition-list ref as Style vs. Layout without needing a
// full resolveDocument() scope walk, for a quick "effective properties"
// preview. Style/Layout names are conventionally unique across a document
// (the emitter relies on the same assumption for canonical composition
// ordering, §15.5).
function buildKindIndex(doc: SflDocument): Map<string, BlockKind> {
  const map = new Map<string, BlockKind>();
  for (const b of allBlocks(doc)) if (!map.has(b.name)) map.set(b.name, b.kind);
  return map;
}

/**
 * Resolves a Style's effective property set by walking its single-parent
 * inheritance chain (§9.2, base first, most specific last — later entries in
 * the returned map override earlier ones on collision).
 */
export function effectiveStyleProperties(doc: SflDocument, style: SflBlock): Map<string, SflValue> {
  return effectiveCompositionProperties(doc, style, 'Style');
}

/** Same as `effectiveStyleProperties`, for a reusable Layout block's inheritance chain. */
export function effectiveLayoutProperties(doc: SflDocument, layout: SflBlock): Map<string, SflValue> {
  return effectiveCompositionProperties(doc, layout, 'Layout');
}

/**
 * The parent ref within a Style's/Layout's own composition list (§9.2) — the
 * one entry, if any, that resolves to another block of the same kind. Shared
 * by completion (composition-item "extends" detail) and hover (composition
 * markdown).
 */
export function compositionParentRef(doc: SflDocument, target: SflBlock): string | undefined {
  const kindOf = buildKindIndex(doc);
  return target.composition.find(ref => kindOf.get(ref) === target.kind);
}

/**
 * Every range in the document that *refers to* `target` — a composition-list
 * entry (`: Ref & Ref`) or a from:/to: endpoint segment whose resolution is
 * `target`. Shared by rename (which turns these into TextEdits) and the
 * Find All References feature (which turns them into read-only Locations).
 * Does not include `target`'s own declaration — callers add `target.nameRange`
 * themselves when they want it included (rename always does; references only
 * when the client asks for `includeDeclaration`).
 */
export function findReferenceRanges(doc: SflDocument, resolveResult: ResolveResult, target: SflBlock): SflRange[] {
  const ranges: SflRange[] = [];
  walkBlocks(doc.blocks, (block) => {
    if (block.composition.length && block.compositionRanges) {
      for (let i = 0; i < block.composition.length; i++) {
        if (resolveResult.resolveCompositionRef(block, block.composition[i]) === target) {
          ranges.push(block.compositionRanges[i]);
        }
      }
    }
    for (const entry of block.entries) {
      if (entry.type !== 'property') continue;
      const value = entry.property.value;
      if (value.type !== 'endpoint' || !value.segmentRanges) continue;
      for (let i = 0; i < value.segments.length; i++) {
        const partial = value.segments.slice(0, i + 1);
        if (resolveResult.resolve(block, partial) === target) {
          ranges.push(value.segmentRanges[i]);
        }
      }
    }
  });
  return ranges;
}

function effectiveCompositionProperties(doc: SflDocument, block: SflBlock, kind: 'Style' | 'Layout'): Map<string, SflValue> {
  const kindOf = buildKindIndex(doc);
  const chain: SflBlock[] = [];
  const seen = new Set<string>();
  let cur: SflBlock | undefined = block;
  while (cur) {
    if (seen.has(cur.name)) break; // cycle guard — diagnostics already flag this
    seen.add(cur.name);
    chain.unshift(cur);
    const parentRef: string | undefined = cur.composition.find(ref => kindOf.get(ref) === kind);
    cur = parentRef ? findBlockByName(doc, parentRef, [kind]) : undefined;
  }

  const props = new Map<string, SflValue>();
  for (const b of chain) {
    for (const entry of b.entries) {
      if (entry.type === 'property') props.set(entry.property.key, entry.property.value);
    }
  }
  return props;
}
