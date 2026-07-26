// packages/vscode-sfl/src/server/features/rename.ts
//
// F2 on a block's own name (or on a reference that resolves to one) renames
// the declaration plus every from:/to: endpoint and composition reference
// (`: Ref & Ref`, §8) that resolves to that same block — the "stable name,
// links follow" design from §3 of the spec, made concrete. Only `endpoint`
// values (from/to) are treated as references (per §10: "Endpoints are only
// valid on from and to. They are not a general value type") — a bare `ident`
// value like `shape: pill` is never rescanned, even if a block happens to
// share that name, avoiding false-positive renames.
//
// `newName` is validated before any edit is computed: it must be a legal SFL
// identifier (§4.3), and it must not collide with another block's name
// (names are effectively global per the emitter's own convention — see
// resolver.ts's `globalByName` fallback). Both cases reject with a
// ResponseError so VS Code surfaces a clear message instead of silently
// no-op'ing or writing a corrupt document.
//
// Scope is a single document: an SFL document is self-contained per the
// spec (no cross-file references exist), so this never needs a
// multi-file WorkspaceEdit.

import { ErrorCodes, Position, Range, ResponseError, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { allBlocks, findAtPosition, findReferenceRanges, type SflBlock } from '../sfl-core';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

  if (hit.type === 'compositionRef') {
    const target = model.resolveResult.resolveCompositionRef(hit.block, hit.name);
    return target ? { block: target, triggerRange: hit.range } : undefined;
  }

  if (hit.type === 'pathSegment' && hit.property.value.type === 'endpoint') {
    const partial = hit.segments.slice(0, hit.segmentIndex + 1);
    const target = model.resolveResult.resolve(hit.block, partial);
    return target ? { block: target, triggerRange: hit.range } : undefined;
  }

  return undefined;
}

/** Throws a ResponseError (surfaced to the user by VS Code) if `newName` can't be used. */
function assertValidNewName(model: DocumentModel, target: SflBlock, newName: string): void {
  if (!IDENTIFIER_RE.test(newName)) {
    throw new ResponseError(ErrorCodes.InvalidParams, `'${newName}' is not a valid SFL identifier — use letters, digits, and underscores, starting with a letter or underscore.`);
  }
  if (newName === target.name) return;
  const collision = allBlocks(model.doc!).find(b => b !== target && b.name === newName);
  if (collision) {
    throw new ResponseError(ErrorCodes.InvalidParams, `'${newName}' is already used by another ${collision.kind} in this document.`);
  }
}

function collectRenameEdits(model: DocumentModel, target: SflBlock, newName: string): TextEdit[] {
  const edits: TextEdit[] = [];
  if (target.nameRange) edits.push({ range: target.nameRange, newText: newName });
  for (const range of findReferenceRanges(model.doc!, model.resolveResult!, target)) {
    edits.push({ range, newText: newName });
  }
  return edits;
}

export function computePrepareRename(model: DocumentModel, position: Position): { range: Range; placeholder: string } | undefined {
  const target = resolveRenameTarget(model, position);
  return target ? { range: target.triggerRange, placeholder: target.block.name } : undefined;
}

export function computeRename(model: DocumentModel, uri: string, position: Position, newName: string): WorkspaceEdit | undefined {
  const target = resolveRenameTarget(model, position);
  if (!target) return undefined;
  assertValidNewName(model, target.block, newName);
  return { changes: { [uri]: collectRenameEdits(model, target.block, newName) } };
}
