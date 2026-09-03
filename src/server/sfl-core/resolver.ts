// packages/vscode-sfl/src/server/sfl-core/resolver.ts
//
// Ported from frontend/src/features/sfl-language/sfl/resolver.ts (SFL 1.2).
// Two things added on top of the port, both for LSP diagnostics/features
// (absent in the frontend original):
//   • Each SflResolveError now carries the offending `block` and, where a
//     more precise location exists (a composition ref, an endpoint path),
//     a `range` — so diagnostics can underline the exact span instead of
//     falling back to the whole block's name.
//   • `resolveCompositionRef` exposes the scope-chain lookup that
//     `classifyComposition` already does internally, for hover/definition/
//     rename on a `: Ref & Ref` composition reference.
//
// Resolution rule for a name X in scope S (§10):
//   1. search S's direct children
//   2. not found → walk up to parent scopes, up to the root
//   3. dot-path (a.b.c): first segment via 1–2, further segments must be
//      direct children of the previously resolved container.

import type { SflDocument, SflBlock, SflProperty, BlockKind, SflRange } from './ast';

export interface SflResolveError {
  message: string;
  /** Name/path that triggered the error, for diagnostics. */
  ref?: string;
  /** The block the error is attached to (added for LSP diagnostics; absent in the frontend original). */
  block?: SflBlock;
  /** A more precise range than block.nameRange, when one is available (a composition ref, an endpoint path). */
  range?: SflRange;
}

export interface ResolveResult {
  errors: SflResolveError[];
  /** Resolve a dot-path from a given block's scope. Undefined if unresolved. */
  resolve: (fromBlock: SflBlock, segments: string[]) => SflBlock | undefined;
  /**
   * Resolve a single composition-list reference (`: Ref & Ref`, §8) from a
   * given block's scope — a scope-chain-only lookup (no dot-path descent, no
   * global fallback: Style/Layout are excluded from the global name index),
   * requiring the hit to be a Style or a Layout block. Added for LSP features
   * (hover/definition/rename on composition refs); the original resolver
   * only validated this internally via `classifyComposition`.
   */
  resolveCompositionRef: (fromBlock: SflBlock, name: string) => SflBlock | undefined;
}

// `Container` (Frame/Swimlane, §12.1) nests its Groups/Entities and forms its
// own scope; `Entity` remains a leaf. `Layout`/`Style` are leaves like
// `Entity` (§8, Table 4) and open no scope of their own. `Table` (§12.1a) is
// deliberately excluded too — it holds a fixed Columns/Rows schema, not
// freely placeable children, so its Column/Row names aren't resolved through
// this scope mechanism (same treatment as the frontend's resolver.ts).
// `Chart` (SFL 1.4 §5.4) is excluded for the same reason: its Axis/Series/Rule
// children are a fixed schema, never referenced by a dot-path or a from/to
// endpoint, so a Chart opens no resolvable scope either. `Symbol` (§5.5) is
// likewise a leaf: its `Port` children are reached through named-port endpoint
// resolution below, not a dot-path descent through the Symbol.
const CONTAINER_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>(['Project', 'Model', 'Group', 'Container']);

// Required-field rules per block kind (§14, Table 8), checked directly on a
// block's own properties — this is validation, not name resolution. `shape`
// joins the set for SFL 1.4: an entity that only carries `shape:` (a built-in
// shape, or the name of a `Symbol`) is a real canvas object, not an anonymous
// one — matches stickyflow.js, where `Entity a { shape: OpAmp }` is valid.
const ENTITY_CONTENT_KEYS = ['text', 'kind', 'asset', 'shape'] as const;

// Kinds kept out of the global bare-name index: structural children that are
// only ever addressed positionally within their parent, never as a standalone
// `from:`/`to:` target or dot-path root. `Axis`/`Series`/`Rule` (SFL 1.4
// Chart children) and `Symbol`/`Port`/`Net`/`Footer` (the rest of the 1.4
// batch) join `Table`'s Columns/Rows structure blocks here. `Path` is *not*
// listed — it is a freeform shape and a valid link endpoint, like `Entity`.
const NON_GLOBAL_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  'Style', 'Layout', 'Columns', 'Column', 'Rows', 'Row',
  'Axis', 'Series', 'Rule', 'Symbol', 'Port', 'Net', 'Footer',
]);

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
      if (!NON_GLOBAL_KINDS.has(block.kind) && !globalByName.has(block.name)) globalByName.set(block.name, block);
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
        // Non-container blocks still belong to this scope for lookups, but
        // define no inner scope.
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
  // non-container block to the scope it lives in. So a Link starts its
  // lookup at its owner scope, and a dot-path descends into a resolved
  // container via that container's inner scope.
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

  const refRange = (block: SflBlock, ref: string): SflRange | undefined => {
    const i = block.composition.indexOf(ref);
    return i >= 0 ? block.compositionRanges?.[i] : undefined;
  };

  // ── Phase B: validate references ────────────────────────────────────────
  const styleBlocksByName = collectBlocksByKind(doc, 'Style');
  const layoutBlocksByName = collectBlocksByKind(doc, 'Layout');
  const symbolBlocksByName = collectBlocksByKind(doc, 'Symbol');

  // Named-port endpoint (§3.5): `entity.portName` — the last segment names a
  // `Port` on the `Symbol` that the entity's `shape:` points at. It is a
  // dot-path, so it never reaches resolve()'s container descent (an Entity
  // opens no scope). Mirrors stickyflow.js's linkEndpointReader: only the last
  // two segments matter, so `board.amp1.out` works the same as `amp1.out`.
  const isNamedPortEndpoint = (segments: string[]): boolean => {
    if (segments.length < 2) return false;
    const portName = segments[segments.length - 1];
    const entity = globalByName.get(segments[segments.length - 2]);
    if (entity?.kind !== 'Entity') return false;
    for (const entry of entity.entries) {
      if (entry.type !== 'property' || entry.property.key !== 'shape') continue;
      const value = entry.property.value;
      if (value.type !== 'ident') continue;
      const symbol = symbolBlocksByName.get(value.segments[0]);
      if (symbol?.entries.some(e => e.type === 'block' && e.block.kind === 'Port' && e.block.name === portName)) {
        return true;
      }
    }
    return false;
  };

  // Classifies a block's composition-list refs by the target's block kind
  // (§9: at most one direct Style, at most one direct Layout). A ref that
  // resolves to neither, or doesn't resolve at all, is an error. Memoized per
  // block (via `composed`) so cycle detection can reuse the classification
  // without re-pushing the same errors a second time.
  const composed = new Map<SflBlock, { styleRef?: string; layoutRef?: string }>();
  const classifyComposition = (block: SflBlock): { styleRef?: string; layoutRef?: string } => {
    const cached = composed.get(block);
    if (cached) return cached;
    const scope = scopeOfBlock.get(block) ?? root;
    let styleRef: string | undefined;
    let layoutRef: string | undefined;
    for (const ref of block.composition) {
      const target = lookupFirst(scope, ref);
      if (!target) {
        errors.push({ message: `unresolved reference '${ref}' on ${block.kind} '${block.name}'`, ref, block, range: refRange(block, ref) });
        continue;
      }
      if (target.kind === 'Style') {
        if (styleRef) errors.push({ message: `${block.kind} '${block.name}' references more than one Style ('${styleRef}', '${ref}')`, ref, block, range: refRange(block, ref) });
        else styleRef = ref;
      } else if (target.kind === 'Layout') {
        if (layoutRef) errors.push({ message: `${block.kind} '${block.name}' references more than one Layout ('${layoutRef}', '${ref}')`, ref, block, range: refRange(block, ref) });
        else layoutRef = ref;
      } else {
        errors.push({ message: `reference '${ref}' on ${block.kind} '${block.name}' is neither a Style nor a Layout`, ref, block, range: refRange(block, ref) });
      }
    }
    const result = { styleRef, layoutRef };
    composed.set(block, result);
    return result;
  };

  const walkValidate = (blocks: SflBlock[]) => {
    for (const block of blocks) {
      const { layoutRef } = classifyComposition(block);

      // Group is purely semantic re: GEOMETRY (§11): no Layout reference, no
      // local layout{} — whoever carries a position/size is a Container. A
      // Style reference or a local style{} (pure look: color/icon) stays
      // allowed on Group.
      if (block.kind === 'Group') {
        if (layoutRef) {
          errors.push({ message: `Group '${block.name}' must not reference a Layout — use a Container`, ref: block.name, block, range: refRange(block, layoutRef) ?? block.nameRange });
        }
        const localLayout = block.entries.find(e => e.type === 'layout');
        if (localLayout) {
          errors.push({ message: `Group '${block.name}' must not have a local layout {} block — use a Container`, ref: block.name, block, range: block.nameRange });
        }
      }

      if (block.kind === 'Link') {
        const props = block.entries.filter(e => e.type === 'property').map(e => (e as any).property as SflProperty);
        for (const key of ['from', 'to'] as const) {
          const entry = props.find(p => p.key === key);
          if (!entry) {
            errors.push({ message: `Link '${block.name}' is missing required '${key}'`, ref: block.name, block, range: block.nameRange });
            continue;
          }
          if (entry.value.type === 'endpoint') {
            const target = resolve(block, entry.value.segments);
            if (!target && !isNamedPortEndpoint(entry.value.segments)) {
              const ranges = entry.value.segmentRanges;
              const range = ranges && ranges.length > 0
                ? { start: ranges[0].start, end: ranges[ranges.length - 1].end }
                : block.nameRange;
              errors.push({ message: `Link '${block.name}': ${key} endpoint '${entry.value.segments.join('.')}' does not resolve`, ref: entry.value.segments.join('.'), block, range });
            }
          }
        }
      }

      // Required content (§14, Table 8): an Entity needs a name plus at
      // least one of text/kind/asset so it isn't an anonymous canvas object.
      if (block.kind === 'Entity') {
        const props = block.entries.filter(e => e.type === 'property').map(e => (e as any).property as SflProperty);
        if (!ENTITY_CONTENT_KEYS.some(key => props.some(p => p.key === key))) {
          errors.push({ message: `Entity '${block.name}' needs at least one of text, kind, or asset`, ref: block.name, block, range: block.nameRange });
        }
      }

      const nested = block.entries.filter(e => e.type === 'block').map(e => (e as any).block as SflBlock);
      walkValidate(nested);
    }
  };
  walkValidate(doc.blocks);

  // Style-inheritance cycles (§9.2): flat single-parent, cycles are an error.
  // A Style's parent is whichever of its own composition refs resolves to
  // another Style (`Style FilledPill : BasePill`).
  const styleParent = (style: SflBlock): SflBlock | undefined => {
    const { styleRef } = classifyComposition(style);
    return styleRef ? styleBlocksByName.get(styleRef) : undefined;
  };
  for (const style of styleBlocksByName.values()) {
    const seen = new Set<string>();
    let cur: SflBlock | undefined = style;
    while (cur) {
      if (seen.has(cur.name)) {
        const { styleRef } = classifyComposition(cur);
        errors.push({ message: `style inheritance cycle at '${style.name}'`, ref: style.name, block: cur, range: (styleRef ? refRange(cur, styleRef) : undefined) ?? style.nameRange });
        break;
      }
      seen.add(cur.name);
      cur = styleParent(cur);
    }
  }

  // Layout-inheritance cycles: same shallow single-parent rule as Style, for
  // symmetry (a Layout may extend one other Layout).
  const layoutParent = (layout: SflBlock): SflBlock | undefined => {
    const { layoutRef } = classifyComposition(layout);
    return layoutRef ? layoutBlocksByName.get(layoutRef) : undefined;
  };
  for (const layout of layoutBlocksByName.values()) {
    const seen = new Set<string>();
    let cur: SflBlock | undefined = layout;
    while (cur) {
      if (seen.has(cur.name)) {
        const { layoutRef } = classifyComposition(cur);
        errors.push({ message: `layout inheritance cycle at '${layout.name}'`, ref: layout.name, block: cur, range: (layoutRef ? refRange(cur, layoutRef) : undefined) ?? layout.nameRange });
        break;
      }
      seen.add(cur.name);
      cur = layoutParent(cur);
    }
  }

  const resolveCompositionRef = (fromBlock: SflBlock, name: string): SflBlock | undefined => {
    const target = lookupFirst(scopeOfBlock.get(fromBlock) ?? root, name);
    return target && (target.kind === 'Style' || target.kind === 'Layout') ? target : undefined;
  };

  return { errors, resolve, resolveCompositionRef };
}

function collectBlocksByKind(doc: SflDocument, kind: BlockKind): Map<string, SflBlock> {
  const map = new Map<string, SflBlock>();
  const walk = (blocks: SflBlock[]) => {
    for (const b of blocks) {
      if (b.kind === kind) map.set(b.name, b);
      walk(b.entries.filter(e => e.type === 'block').map(e => (e as any).block as SflBlock));
    }
  };
  walk(doc.blocks);
  return map;
}
