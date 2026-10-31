// Guards against the copied parser in src/server/sfl-core drifting away from
// stickyflow.js again: BLOCK_KINDS must name exactly the block keywords the
// library parses (NAMED_BLOCK_KINDS in its src/sflLanguage/ast.ts).
//
// stickyflow.js does not export NAMED_BLOCK_KINDS from a public entry point
// yet, so the list is read from the declaration in the installed package's
// .d.ts files. Once the library exports it, import it here instead.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_KINDS } from '../sfl-core/ast';

function libraryBlockKinds(): string[] {
  const dist = path.dirname(require.resolve('stickyflow')); // .../stickyflow/dist
  const declaration = /declare const NAMED_BLOCK_KINDS: readonly \[([^\]]*)\]/;
  for (const file of readdirSync(dist).filter((f) => f.endsWith('.d.ts'))) {
    const match = declaration.exec(readFileSync(path.join(dist, file), 'utf8'));
    if (match) return [...match[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
  }
  throw new Error('NAMED_BLOCK_KINDS not found in stickyflow/dist/*.d.ts');
}

describe('block kinds', () => {
  it('match NAMED_BLOCK_KINDS in stickyflow.js', () => {
    const library = libraryBlockKinds();
    const missing = library.filter((kind) => !(BLOCK_KINDS as readonly string[]).includes(kind));
    const extra = BLOCK_KINDS.filter((kind) => !library.includes(kind));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});
