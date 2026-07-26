// packages/vscode-sfl/src/server/features/references.ts
//
// Shift+F12 (Find All References) on a block's own name, or on a reference
// that resolves to one, lists every composition-list ref and from:/to:
// endpoint that points at it — read-only counterpart to rename.ts, sharing
// its target-resolution and occurrence-finding logic (findReferenceRanges).

import { Location, Position, ReferenceParams } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { findAtPosition, findReferenceRanges, type SflBlock } from '../sfl-core';

function resolveReferenceTarget(model: DocumentModel, position: Position): SflBlock | undefined {
  if (!model.doc || !model.resolveResult) return undefined;
  const hit = findAtPosition(model.doc, { line: position.line, character: position.character });
  if (!hit) return undefined;

  if (hit.type === 'blockName') return hit.block;

  if (hit.type === 'compositionRef') {
    return model.resolveResult.resolveCompositionRef(hit.block, hit.name);
  }

  if (hit.type === 'pathSegment' && hit.property.value.type === 'endpoint') {
    const partial = hit.segments.slice(0, hit.segmentIndex + 1);
    return model.resolveResult.resolve(hit.block, partial);
  }

  return undefined;
}

export function computeReferences(model: DocumentModel, uri: string, params: ReferenceParams): Location[] | undefined {
  const target = resolveReferenceTarget(model, params.position);
  if (!target) return undefined;

  const ranges = findReferenceRanges(model.doc!, model.resolveResult!, target);
  if (params.context.includeDeclaration && target.nameRange) ranges.unshift(target.nameRange);

  return ranges.map(range => ({ uri, range }));
}
