// packages/vscode-sfl/src/server/sfl-core/resolver.ts
//
// Ported verbatim from frontend/src/features/sfl/resolver.ts. No range
// changes needed here: it resolves names against the AST built by the local
// parser.ts, and that AST's SflBlock nodes already carry nameRange/styleRange
// — resolve() returning a SflBlock is enough for callers (definition/hover/
// rename) to reach those ranges themselves.
//
// Resolution rule for a name X in scope S (§10):
//   1. search S's direct children
//   2. not found → walk up to parent scopes, up to the root
//   3. dot-path (a.b.c): first segment via 1–2, further segments must be
//      direct children of the previously resolved container.

import type { SflDocument, SflBlock, BlockKind, SflRange } from './ast';

export interface SflResolveError {
  message: string;
  /** Name/path that triggered the error, for diagnostics. */
  ref?: string;
  /** The block the error is attached to (added for LSP diagnostics; absent in the frontend original). */
  block?: SflBlock;
  /** A more precise range than block.nameRange, when one is available (e.g. an endpoint path). */
  range?: SflRange;
}

export interface ResolveResult {
  errors: SflResolveError[];
  /** Resolve a dot-path from a given block's scope. Undefined if unresolved. */
  resolve: (fromBlock: SflBlock, segments: string[]) => SflBlock | undefined;
  /**
   * Resolve a `: StyleName` reference from a given block's scope (§9). Unlike
   * `resolve`, this only walks the scope chain upward (no dot-path descent,
   * no global fallback — Styles are excluded from the global name index) and
   * requires the hit to actually be a Style block. Added for LSP features
   * (hover/definition/rename on style refs); the original resolver only
   * validated this internally without exposing it.
   */
  resolveStyleRef: (fromBlock: SflBlock, name: string) => SflBlock | undefined;
}

// `Container` (Frame/Swimlane, §12.1) nests its Groups/Entities and forms its
// own scope; `Entity` remains a leaf.
const CONTAINER_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>(['Project', 'Flow', 'Group', 'Container']);

interface Scope {
  block?: SflBlock;               // undefined for the document root
  parent?: Scope;
  childrenByName: Map<string, SflBlock>;
  scopeByBlock: Map<SflBlock, Scope>; // nested container scopes, keyed by their block
}

export function resolveDocument(doc: SflDocument): ResolveResult {
  const errors: SflResolveError[] = [];
  const scopeOfBlock = new Map<SflBlock, Scope>();
  // Global name index: the emitter assigns globally unique names, so a bare
  // name may also resolve across scopes (§10 fallback) — links don't need
  // long dot-paths through every Frame/Group.
  const globalByName = new Map<string, SflBlock>();

  const root: Scope = { childrenByName: new Map(), scopeByBlock: new Map() };

  // ── Phase A: build the scope tree, catch duplicate names ────────────────
  const build = (blocks: SflBlock[], scope: Scope) => {
    for (const block of blocks) {
      if (block.kind !== 'Style' && !globalByName.has(block.name)) globalByName.set(block.name, block);
      if (scope.childrenByName.has(block.name)) {
        errors.push({
          message: `duplicate name '${block.name}' in the same scope`,
          ref: block.name,
          block,
          range: block.nameRange,
        });
      } else {
        scope.childrenByName.set(block.name, block);
      }

      if (CONTAINER_KINDS.has(block.kind)) {
        const child: Scope = { block, parent: scope, childrenByName: new Map(), scopeByBlock: new Map() };
        scope.scopeByBlock.set(block, child);
        scopeOfBlock.set(block, child);
        const nested = block.entries
          .filter(e => e.type === 'block')
          .map(e => (e as any).block as SflBlock);
        build(nested, child);
      } else {
        // Non-container blocks (Entity/Link/Style) still belong to this scope
        // for lookups, but define no inner scope.
        scopeOfBlock.set(block, scope);
      }
    }
  };
  build(doc.blocks, root);

  // ── lookups ─────────────────────────────────────────────────────────────
  const lookupFirst = (scope: Scope | undefined, name: string): SflBlock | undefined => {
    for (let s: Scope | undefined = scope; s; s = s.parent) {
      const hit = s.childrenByName.get(name);
      if (hit) return hit;
    }
    return undefined;
  };

  // scopeOfBlock maps a container block to its OWN inner scope, and a
  // non-container block (Entity/Link/Style) to the scope it lives in. So a
  // Link starts its lookup at its owner scope, and a dot-path descends into a
  // resolved container via that container's inner scope.
  const resolve = (fromBlock: SflBlock, segments: string[]): SflBlock | undefined => {
    if (segments.length === 0) return undefined;
    const startScope = scopeOfBlock.get(fromBlock) ?? root;
    // Scope resolution first (direct children + upward, §10), then a global
    // fallback for cross-scope bare names (names are globally unique).
    let current = lookupFirst(startScope, segments[0]) ?? globalByName.get(segments[0]);
    if (!current) return undefined;

    for (let k = 1; k < segments.length; k++) {
      if (!CONTAINER_KINDS.has(current.kind)) return undefined;
      const inner = scopeOfBlock.get(current); // container → its inner scope
      const child = inner?.childrenByName.get(segments[k]);
      if (!child) return undefined;
      current = child;
    }
    return current;
  };

  // ── Phase B: validate references ────────────────────────────────────────
  const styleBlocksByName = collectStylesByName(doc);
  const walkValidate = (blocks: SflBlock[]) => {
    for (const block of blocks) {
      // Style reference (`: StyleName`) must resolve to a Style.
      if (block.style) {
        const target = lookupFirst(scopeOfBlock.get(block) ?? root, block.style);
        if (!target || target.kind !== 'Style') {
          errors.push({ message: `unresolved style '${block.style}' on ${block.kind} '${block.name}'`, ref: block.style, block, range: block.styleRange ?? block.nameRange });
        }
      }

      if (block.kind === 'Link') {
        for (const key of ['from', 'to'] as const) {
          const entry = block.entries.find(e => e.type === 'property' && (e as any).property.key === key) as any;
          const val = entry?.property?.value;
          if (val && val.type === 'endpoint') {
            const target = resolve(block, val.segments);
            if (!target) {
              const ranges: SflRange[] | undefined = val.segmentRanges;
              const range = ranges && ranges.length > 0
                ? { start: ranges[0].start, end: ranges[ranges.length - 1].end }
                : block.nameRange;
              errors.push({ message: `Link '${block.name}': ${key} endpoint '${val.segments.join('.')}' does not resolve`, ref: val.segments.join('.'), block, range });
            }
          }
        }
      }

      const nested = block.entries.filter(e => e.type === 'block').map(e => (e as any).block as SflBlock);
      walkValidate(nested);
    }
  };
  walkValidate(doc.blocks);

  // Style-inheritance cycles (§9.2): flat single-parent, cycles are an error.
  for (const style of styleBlocksByName.values()) {
    const seen = new Set<string>();
    let cur: SflBlock | undefined = style;
    while (cur && cur.style) {
      if (seen.has(cur.name)) {
        errors.push({ message: `style inheritance cycle at '${style.name}'`, ref: style.name, block: style, range: style.styleRange ?? style.nameRange });
        break;
      }
      seen.add(cur.name);
      cur = styleBlocksByName.get(cur.style);
    }
  }

  const resolveStyleRef = (fromBlock: SflBlock, name: string): SflBlock | undefined => {
    const target = lookupFirst(scopeOfBlock.get(fromBlock) ?? root, name);
    return target && target.kind === 'Style' ? target : undefined;
  };

  return { errors, resolve, resolveStyleRef };
}

function collectStylesByName(doc: SflDocument): Map<string, SflBlock> {
  const map = new Map<string, SflBlock>();
  const walk = (blocks: SflBlock[]) => {
    for (const b of blocks) {
      if (b.kind === 'Style') map.set(b.name, b);
      walk(b.entries.filter(e => e.type === 'block').map(e => (e as any).block as SflBlock));
    }
  };
  walk(doc.blocks);
  return map;
}
