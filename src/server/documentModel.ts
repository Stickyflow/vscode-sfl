// packages/vscode-sfl/src/server/documentModel.ts
//
// Parses + resolves an SFL document once per change, shared by every feature
// provider.
//
// Syntax errors come from stickyflow.js's own parser, the one the renderer and
// the StickyFlow-Web Playground use, so VS Code reports exactly what the
// renderer accepts or rejects. The multi-error recovery is the Playground's
// (src/playground/editor/sflDiagnostics.ts): the parser throws on the first
// syntax error, so to surface more than one at a time we blank the bad line
// and retry. Blanking only replaces that line's content (not the line count),
// so every other line's positions stay correct.
//
// stickyflow.js's AST has no source positions yet, so the editor features
// (hover, definition, rename, outline, resolver checks) still run on sfl-core's
// AST. sfl-core parses the text with stickyflow.js's bad lines already blanked
// and silently blanks any further line it can't read: when it lags behind
// stickyflow.js, those features miss that part of the file, but it never adds
// an error of its own.

import { parse as parseWithStickyflow } from 'stickyflow';
import {
  parse, resolveDocument, SflParseError, SflLexError, REMOVED_BLOCK_KINDS, type SflDocument, type ResolveResult,
} from './sfl-core';

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

const MAX_RECOVERIES = 50;

const stripPrefix = (m: string) => m.replace(/^SFL (?:parse|lex) error \(\d+:\d+\):\s*/, '');

/** stickyflow.js doesn't export its error classes from the package root, so a syntax error is told apart by its line/col. */
function syntaxErrorOf(e: unknown): DocParseError | undefined {
  const failure = e as { line?: unknown; col?: unknown; message?: unknown } | null;
  if (!failure || typeof failure.line !== 'number') return undefined;
  return {
    line: failure.line,
    col: typeof failure.col === 'number' ? failure.col : 1,
    message: stripPrefix(String(failure.message ?? 'Syntax error')),
  };
}

export function buildDocumentModel(text: string): DocumentModel {
  if (!text.trim()) return { doc: null, parseErrors: [], resolveResult: null };

  const parseErrors: DocParseError[] = [];
  const seen = new Set<number>();
  const lines = text.split('\n');

  for (let iter = 0; iter < MAX_RECOVERIES; iter++) {
    try {
      parseWithStickyflow(lines.join('\n'));
      break;
    } catch (e) {
      const error = syntaxErrorOf(e);
      if (!error) break;
      // A removed keyword (`Table db {`) reads to stickyflow.js like a property
      // missing its ':', so say what actually happened.
      const removed = /^\s*([A-Za-z_]\w*)/.exec(lines[error.line - 1] ?? '')?.[1];
      if (removed && REMOVED_BLOCK_KINDS[removed]) error.message = REMOVED_BLOCK_KINDS[removed];
      if (!seen.has(error.line)) {
        seen.add(error.line);
        parseErrors.push(error);
      }
      const li = error.line - 1;
      if (li < 0 || li >= lines.length || lines[li] === '') break; // no progress possible
      lines[li] = '';
    }
  }
  parseErrors.sort((a, b) => a.line - b.line);

  const doc = parseForEditorFeatures(lines);
  const resolveResult = doc ? resolveDocument(doc) : null;
  return { doc, parseErrors, resolveResult };
}

/** sfl-core's AST for the editor features, blanking whatever lines it can't read. Never reports errors. */
function parseForEditorFeatures(lines: string[]): SflDocument | null {
  const own = [...lines];
  for (let iter = 0; iter < MAX_RECOVERIES; iter++) {
    try {
      return parse(own.join('\n'));
    } catch (e) {
      if (!(e instanceof SflParseError) && !(e instanceof SflLexError)) return null;
      const li = e.line - 1;
      if (li < 0 || li >= own.length || own[li] === '') return null;
      own[li] = '';
    }
  }
  return null;
}
