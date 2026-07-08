// packages/vscode-sfl/src/server/features/semanticTokens.ts
//
// Refines the regex-based TextMate baseline with the real parser+resolver,
// exactly the gap the context note calls out for stage 3 ("kann dort über
// semantic tokens das grobe TextMate-Highlighting verfeinern... eine
// Referenz anders färben als ein Keyword, was Regex nicht sauber
// unterscheiden kann"). Regex already colors keywords/strings/numbers fine,
// so this stays scoped to what only the resolver can tell you: a block-name
// *declaration* (`type` + `declaration` modifier) vs. a from:/to:/style
// reference that actually *resolves* (`variable`) vs. one that doesn't
// (left uncolored here — the diagnostic already flags it as an error).
// Property keys are included too since keyRange makes it free.

import { SemanticTokens } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { walkBlocks, type SflRange } from '../sfl-core';

export const SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: ['type', 'property', 'variable'],
  tokenModifiers: ['declaration'],
};

const TYPE_INDEX = { type: 0, property: 1, variable: 2 } as const;
const MOD_DECLARATION = 1 << 0;

interface RawToken {
  range: SflRange;
  typeIndex: number;
  modifiers: number;
}

export function computeSemanticTokens(model: DocumentModel): SemanticTokens {
  const tokens: RawToken[] = [];
  if (!model.doc || !model.resolveResult) return { data: [] };
  const doc = model.doc;
  const resolveResult = model.resolveResult;

  walkBlocks(doc.blocks, (block) => {
    if (block.nameRange) {
      tokens.push({ range: block.nameRange, typeIndex: TYPE_INDEX.type, modifiers: MOD_DECLARATION });
    }
    if (block.style && block.styleRange) {
      const resolved = resolveResult.resolveStyleRef(block, block.style);
      if (resolved) tokens.push({ range: block.styleRange, typeIndex: TYPE_INDEX.variable, modifiers: 0 });
    }

    for (const entry of block.entries) {
      if (entry.type !== 'property') continue;
      if (entry.property.keyRange) {
        tokens.push({ range: entry.property.keyRange, typeIndex: TYPE_INDEX.property, modifiers: 0 });
      }
      const value = entry.property.value;
      if (value.type === 'endpoint' && value.segmentRanges) {
        for (let i = 0; i < value.segments.length; i++) {
          const partial = value.segments.slice(0, i + 1);
          if (resolveResult.resolve(block, partial)) {
            tokens.push({ range: value.segmentRanges[i], typeIndex: TYPE_INDEX.variable, modifiers: 0 });
          }
        }
      }
    }
  });

  tokens.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);

  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    const line = t.range.start.line;
    const char = t.range.start.character;
    const length = t.range.end.character - t.range.start.character;
    const deltaLine = line - prevLine;
    const deltaChar = deltaLine === 0 ? char - prevChar : char;
    data.push(deltaLine, deltaChar, length, t.typeIndex, t.modifiers);
    prevLine = line;
    prevChar = char;
  }

  return { data };
}
