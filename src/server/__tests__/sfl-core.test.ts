// Round-trips the repo's shared fixtures/valid/*.sfl documents through the
// ported parser + resolver: every fixture must parse cleanly and resolve
// with zero errors, and the declaration/reference ranges the LSP features
// depend on must actually be populated.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse, resolveDocument } from '../sfl-core';

const fixturesDir = path.join(__dirname, '../../../../../fixtures/valid');
const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.sfl'));

describe('sfl-core against fixtures/valid', () => {
  it('found at least one fixture file', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  for (const file of fixtureFiles) {
    it(`parses and resolves ${file} with zero errors`, () => {
      const text = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
      const doc = parse(text);
      const { errors } = resolveDocument(doc);
      expect(errors).toEqual([]);
    });

    it(`${file}: every block has a nameRange`, () => {
      const text = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
      const doc = parse(text);
      const missing: string[] = [];
      const walk = (blocks: typeof doc.blocks) => {
        for (const b of blocks) {
          if (!b.nameRange) missing.push(`${b.kind} ${b.name}`);
          const nested = b.entries.filter(e => e.type === 'block').map(e => (e as any).block);
          walk(nested);
        }
      };
      walk(doc.blocks);
      expect(missing).toEqual([]);
    });
  }

  it('records segment ranges on from/to endpoints', () => {
    const text = fs.readFileSync(path.join(fixturesDir, 'checkout-flow.sfl'), 'utf8');
    const doc = parse(text);
    let sawEndpointWithRanges = false;
    const walk = (blocks: typeof doc.blocks) => {
      for (const b of blocks) {
        for (const entry of b.entries) {
          if (entry.type === 'property' && entry.property.value.type === 'endpoint') {
            expect(entry.property.value.segmentRanges?.length).toBe(entry.property.value.segments.length);
            sawEndpointWithRanges = true;
          }
        }
        const nested = b.entries.filter(e => e.type === 'block').map(e => (e as any).block);
        walk(nested);
      }
    };
    walk(doc.blocks);
    expect(sawEndpointWithRanges).toBe(true);
  });
});
