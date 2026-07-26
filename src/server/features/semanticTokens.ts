// packages/vscode-sfl/src/server/features/semanticTokens.ts
//
// Intentionally emits no tokens right now. This used to color a block-name
// *declaration* distinctly from a from:/to:/composition reference that
// resolves — exactly the "regex can't tell a reference from a keyword" gap
// the context note called out for stage 3. But that distinction actively
// fights a more important goal: exact color parity with the in-app SFL
// editor (see syntaxes/sfl.tmLanguage.json + package.json's
// configurationDefaults), whose own highlighter is purely lexical and
// colors every property value — reference or not — the same "const" green.
// Emitting a differently-colored semantic token for a *resolved* reference
// would visibly diverge from that on any document with real from:/to:
// links, which is the opposite of what was asked for.
//
// The capability stays registered (harmless, forward-compatible) so this can
// be revisited for something that doesn't compete on base color — e.g. a
// modifier-only refinement (read/write occurrence highlighting) layered on
// top of the TextMate-driven palette instead of replacing it.

import { SemanticTokens } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';

export const SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: [] as string[],
  tokenModifiers: [] as string[],
};

export function computeSemanticTokens(_model: DocumentModel): SemanticTokens {
  return { data: [] };
}
