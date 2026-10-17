// packages/vscode-sfl/src/server/features/formatting.ts
//
// "Format Document" via stickyflow.js's `canonicalize()` (§15): re-emitting a
// parsed AST always produces the one canonical text form, which is exactly
// what a formatter is supposed to do — no separate formatting logic needed.
// It is stickyflow.js's parser and emitter, not sfl-core's, so formatting
// can't drop anything sfl-core doesn't know yet.
//
// Only runs on a *cleanly* parsed document (zero parse errors). documentModel
// .ts's recovery strategy blanks out offending lines to keep surfacing
// diagnostics past the first syntax error — formatting a document in that
// state would silently emit text with the user's broken lines deleted, which
// is much worse than just declining to format.

import { Range, TextEdit } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentModel } from '../documentModel';
import { canonicalize } from 'stickyflow';

export function computeFormatting(model: DocumentModel, document: TextDocument): TextEdit[] {
  if (model.parseErrors.length > 0) return [];

  const original = document.getText();
  if (!original.trim()) return [];
  let formatted: string;
  try {
    formatted = canonicalize(original);
  } catch {
    return [];
  }
  if (formatted === original) return [];

  const fullRange: Range = {
    start: { line: 0, character: 0 },
    end: document.positionAt(original.length),
  };
  return [{ range: fullRange, newText: formatted }];
}
