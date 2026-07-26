// packages/vscode-sfl/src/server/features/formatting.ts
//
// "Format Document" via the ported canonical emitter (§15): re-emitting a
// parsed AST always produces the one canonical text form, which is exactly
// what a formatter is supposed to do — no separate formatting logic needed.
//
// Only runs on a *cleanly* parsed document (zero parse errors). documentModel
// .ts's recovery strategy blanks out offending lines to keep surfacing
// diagnostics past the first syntax error — formatting a document in that
// state would silently emit text with the user's broken lines deleted, which
// is much worse than just declining to format.

import { Range, TextEdit } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentModel } from '../documentModel';
import { emit } from '../sfl-core';

export function computeFormatting(model: DocumentModel, document: TextDocument): TextEdit[] {
  if (!model.doc || model.parseErrors.length > 0) return [];

  const formatted = emit(model.doc);
  const original = document.getText();
  if (formatted === original) return [];

  const fullRange: Range = {
    start: { line: 0, character: 0 },
    end: document.positionAt(original.length),
  };
  return [{ range: fullRange, newText: formatted }];
}
