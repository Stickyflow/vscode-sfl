// packages/vscode-sfl/src/server/features/rename.ts
//
// F2 on a block's own name (or on a reference that resolves to one) renames
// the declaration plus every from:/to: endpoint and style-ref that resolves
// to that same block — the "stable name, links follow" design from §3 of the
// spec, made concrete. Only `endpoint` values (from/to) are treated as
// references (per §11: "Endpoints are only valid on from and to. They are
// not a general value type") — a bare `ident` value like `shape: pill` is
// never rescanned, even if a block happens to share that name, avoiding
// false-positive renames.
//
// Scope is a single document: an SFL document is self-contained per the
// spec (no cross-file references exist), so this never needs a
// multi-file WorkspaceEdit.

import { Position, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { findAtPosition, walkBlocks, type SflBlock } from '../sfl-core';

interface RenameTarget {
  block: SflBlock;
  /** The range under the cursor — used for prepareRename's highlighted span. */
  triggerRange: Range;
}

function resolveRenameTarget(model: DocumentModel, position: Position): RenameTarget | undefined {
  if (!model.doc || !model.resolveResult) return undefined;
  const hit = findAtPosition(model.doc, { line: position.line, character: position.character });
  if (!hit) return undefined;

  if (hit.type === 'blockName') {
    return hit.block.nameRange ? { block: hit.block, triggerRange: hit.block.nameRange } : undefined;
  }

  if (hit.type === 'styleRef') {
    const target = model.resolveResult.resolveStyleRef(hit.block, hit.name);
    return target ? { block: target, triggerRange: hit.range } : undefined;
  }

  if (hit.type === 'pathSegment' && hit.property.value.type === 'endpoint') {
    const partial = hit.segments.slice(0, hit.segmentIndex + 1);
    const target = model.resolveResult.resolve(hit.block, partial);
    return target ? { block: target, triggerRange: hit.range } : undefined;
  }

  return undefined;
}

function collectRenameEdits(model: DocumentModel, target: SflBlock, newName: string): TextEdit[] {
  const doc = model.doc!;
  const resolveResult = model.resolveResult!;
  const edits: TextEdit[] = [];

  if (target.nameRange) edits.push({ range: target.nameRange, newText: newName });

  walkBlocks(doc.blocks, (block) => {
    if (target.kind === 'Style' && block.style && block.styleRange) {
      const resolved = resolveResult.resolveStyleRef(block, block.style);
      if (resolved === target) edits.push({ range: block.styleRange, newText: newName });
    }

    for (const entry of block.entries) {
      if (entry.type !== 'property') continue;
      const value = entry.property.value;
      if (value.type !== 'endpoint' || !value.segmentRanges) continue;
      for (let i = 0; i < value.segments.length; i++) {
        const partial = value.segments.slice(0, i + 1);
        if (resolveResult.resolve(block, partial) === target) {
          edits.push({ range: value.segmentRanges[i], newText: newName });
        }
      }
    }
  });

  return edits;
}

export function computePrepareRename(model: DocumentModel, position: Position): { range: Range; placeholder: string } | undefined {
  const target = resolveRenameTarget(model, position);
  return target ? { range: target.triggerRange, placeholder: target.block.name } : undefined;
}

export function computeRename(model: DocumentModel, uri: string, position: Position, newName: string): WorkspaceEdit | undefined {
  const target = resolveRenameTarget(model, position);
  if (!target) return undefined;
  return { changes: { [uri]: collectRenameEdits(model, target.block, newName) } };
}
