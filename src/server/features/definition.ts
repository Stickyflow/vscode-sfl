// packages/vscode-sfl/src/server/features/definition.ts
//
// Go-to-definition: Ctrl/Cmd+click on a style ref or a from:/to: endpoint
// segment jumps to the referenced block's name range. Cmd+click on
// `cart.load_cart` navigates to the `load_cart` Entity inside Group `cart` —
// the dot-path resolution from resolver.ts (§10/§11), made visible.

import { Location, Position } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { findAtPosition } from '../sfl-core';

export function computeDefinition(model: DocumentModel, uri: string, position: Position): Location | undefined {
  if (!model.doc || !model.resolveResult) return undefined;
  const hit = findAtPosition(model.doc, { line: position.line, character: position.character });
  if (!hit) return undefined;

  if (hit.type === 'styleRef') {
    const target = model.resolveResult.resolveStyleRef(hit.block, hit.name);
    if (target?.nameRange) return { uri, range: target.nameRange };
    return undefined;
  }

  if (hit.type === 'pathSegment') {
    const partial = hit.segments.slice(0, hit.segmentIndex + 1);
    const target = model.resolveResult.resolve(hit.block, partial);
    if (target?.nameRange) return { uri, range: target.nameRange };
    return undefined;
  }

  return undefined;
}
