// packages/vscode-sfl/src/server/features/diagnostics.ts
//
// Turns a DocumentModel into LSP diagnostics: parse errors get their range
// straight from SflParseError's line/col; resolver errors (unresolved style,
// unresolved from/to endpoint, duplicate name, style-inheritance cycle) use
// the `block`/`range` fields added to SflResolveError in sfl-core/resolver.ts.

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';

function lineRange(line: number, col: number): Range {
  // Parse errors point at a single offending character; underline the rest of the line
  // from there since we don't have the offending token's length at this point.
  return { start: { line: line - 1, character: col - 1 }, end: { line: line - 1, character: col - 1 + 1 } };
}

export function computeDiagnostics(model: DocumentModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const err of model.parseErrors) {
    diagnostics.push({
      range: lineRange(err.line, err.col),
      severity: DiagnosticSeverity.Error,
      source: 'sfl',
      message: err.message,
    });
  }

  if (model.resolveResult) {
    for (const err of model.resolveResult.errors) {
      const range: Range = err.range
        ? { start: err.range.start, end: err.range.end }
        : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
      diagnostics.push({
        range,
        severity: DiagnosticSeverity.Error,
        source: 'sfl',
        message: err.message,
      });
    }
  }

  return diagnostics;
}
