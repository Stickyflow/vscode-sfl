// Fails the build when the TextMate grammar doesn't highlight every block
// keyword the language server knows. BLOCK_KINDS (src/server/sfl-core/ast.ts)
// is the source of truth; the grammar's block-header rules repeat the list as
// regex alternations, and that copy used to fall behind silently (a new kind
// parsed and showed up in the outline, but rendered as plain text).
//
// Runs after `tsc` (see the `compile` script), so it reads the compiled
// out/server/sfl-core/ast.js rather than parsing TypeScript.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { BLOCK_KINDS } = require(path.join(root, 'out', 'server', 'sfl-core', 'ast.js'));

const grammar = JSON.parse(readFileSync(path.join(root, 'syntaxes', 'sfl.tmLanguage.json'), 'utf8'));
const headerRules = Object.entries(grammar.repository).filter(([name]) => name.startsWith('block-header-'));

const highlighted = new Set();
for (const [, rule] of headerRules) {
  const group = /\\b\(([A-Za-z|]+)\)/.exec(rule.begin ?? '');
  for (const kind of group ? group[1].split('|') : []) highlighted.add(kind);
}

const missing = BLOCK_KINDS.filter((kind) => !highlighted.has(kind));
const unknown = [...highlighted].filter((kind) => !BLOCK_KINDS.includes(kind));

if (missing.length || unknown.length) {
  if (missing.length) console.error(`[check-grammar] not highlighted by syntaxes/sfl.tmLanguage.json: ${missing.join(', ')}`);
  if (unknown.length) console.error(`[check-grammar] highlighted but not in BLOCK_KINDS: ${unknown.join(', ')}`);
  console.error('[check-grammar] add them to a block-header-* rule (container or leaf) in the grammar.');
  process.exit(1);
}
console.log(`[check-grammar] grammar covers all ${BLOCK_KINDS.length} block kinds`);
