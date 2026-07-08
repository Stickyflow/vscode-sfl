// packages/vscode-sfl/src/server/documentModel.ts
//
// Parses + resolves an SFL document once per change, shared by every feature
// provider. The multi-error recovery strategy (blank the offending line,
// reparse, repeat) is ported from
// frontend/src/features/sidepanels/right/components/sfl/sflDiagnostics.ts —
// the parser throws on the first syntax error, so to surface more than one at
// a time we neutralize the bad line and retry. Blanking only replaces that
// line's content (not the line count), so every other line's positions stay
// correct — which is what completion/hover/definition/rename actually rely on.

import { parse, resolveDocument, SflParseError, type SflDocument, type ResolveResult } from './sfl-core';

export interface DocParseError {
  line: number; // 1-based, matches SflParseError
  col: number;  // 1-based
  message: string;
}

export interface DocumentModel {
  doc: SflDocument | null;
  parseErrors: DocParseError[];
  resolveResult: ResolveResult | null;
}

const stripPrefix = (m: string) => m.replace(/^SFL parse error \(\d+:\d+\):\s*/, '');

export function buildDocumentModel(text: string): DocumentModel {
  if (!text.trim()) return { doc: null, parseErrors: [], resolveResult: null };

  const parseErrors: DocParseError[] = [];
  const seen = new Set<number>();
  const lines = text.split('\n');
  let doc: SflDocument | null = null;

  for (let iter = 0; iter < 50; iter++) {
    try {
      doc = parse(lines.join('\n'));
      break;
    } catch (e) {
      if (!(e instanceof SflParseError)) break;
      if (!seen.has(e.line)) {
        seen.add(e.line);
        parseErrors.push({ line: e.line, col: e.col, message: stripPrefix(e.message) });
      }
      const li = e.line - 1;
      if (li < 0 || li >= lines.length || lines[li] === '') break; // no progress possible
      lines[li] = '';
    }
  }

  parseErrors.sort((a, b) => a.line - b.line);
  const resolveResult = doc ? resolveDocument(doc) : null;
  return { doc, parseErrors, resolveResult };
}
