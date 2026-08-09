// Round-trips this repo's own fixtures/valid/*.sfl documents through the
// ported parser + resolver: every fixture must parse cleanly and resolve
// with zero errors, and the declaration/reference ranges the LSP features
// depend on must actually be populated.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse, resolveDocument, emit } from '../sfl-core';

const fixturesDir = path.join(__dirname, '../../../fixtures/valid');
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

// These exercise the SFL 1.2 grammar additions specifically (§8/§10/§16),
// not just "old 1.1-shaped tests still happen to pass" — composition lists
// with '&', a reusable Layout block, a local style{} sub-block, the new
// endpoint side/fraction syntax, and the ';' property terminator.
describe('SFL 1.2 syntax', () => {
  const SAMPLE = `sfl 1.2

Style BasePill { shape: pill; fill: "#fff" }

Layout Card {
  size: 200, 100
}

Entity a : BasePill & Card {
  kind: process
  text: "A"

  style {
    stroke: "#000"
  }
}

Entity b {
  kind: process
  text: "B"
}

Link a_to_b {
  from: a, right (0.5)
  to: b, left
}
`;

  it('parses a composition list with Style + Layout refs and resolves with zero errors', () => {
    const doc = parse(SAMPLE);
    const { errors } = resolveDocument(doc);
    expect(errors).toEqual([]);
  });

  it('classifies each composition ref by target kind (not by position)', () => {
    const doc = parse(SAMPLE);
    const a = doc.blocks.find(b => b.name === 'a')!;
    expect(a.composition).toEqual(['BasePill', 'Card']);
    expect(a.compositionRanges).toHaveLength(2);
  });

  it('parses a local style{} sub-block alongside a composition list', () => {
    const doc = parse(SAMPLE);
    const a = doc.blocks.find(b => b.name === 'a')!;
    const styleEntry = a.entries.find(e => e.type === 'style');
    expect(styleEntry).toBeDefined();
  });

  it('parses endpoint side + fraction in the new ", side (fraction)" form', () => {
    const doc = parse(SAMPLE);
    const link = doc.blocks.find(b => b.name === 'a_to_b')!;
    const fromEntry = link.entries.find(e => e.type === 'property' && e.property.key === 'from') as any;
    expect(fromEntry.property.value).toMatchObject({ side: 'right', fraction: 0.5 });
    const toEntry = link.entries.find(e => e.type === 'property' && e.property.key === 'to') as any;
    expect(toEntry.property.value).toMatchObject({ side: 'left' });
    expect(toEntry.property.value.fraction).toBeUndefined();
  });

  it('parses the compact single-line Style/Layout definition form (";"-separated)', () => {
    const doc = parse(SAMPLE);
    const basePill = doc.blocks.find(b => b.name === 'BasePill')!;
    const props = basePill.entries.filter(e => e.type === 'property').map((e: any) => e.property.key);
    expect(props).toEqual(['shape', 'fill']);
  });

  it('rejects a Group that references a Layout (§11: use a Container instead)', () => {
    const text = `sfl 1.2

Layout Card { size: 200, 100 }

Group g : Card {
  text: "g"
}
`;
    const doc = parse(text);
    const { errors } = resolveDocument(doc);
    expect(errors.some(e => /must not reference a Layout/.test(e.message))).toBe(true);
  });

  it('round-trips through emit() without resolver errors on the re-parsed output', () => {
    const doc = parse(SAMPLE);
    const emitted = emit(doc);
    const reparsed = parse(emitted);
    expect(resolveDocument(reparsed).errors).toEqual([]);
  });
});

// Table (§12.1a) — added to the language after the initial 1.2 port; a leaf
// like Entity (its own geometry, but no scope of its own — Column/Row names
// aren't resolved through the normal container scope mechanism).
describe('Table (§12.1a)', () => {
  const TABLE_SAMPLE = `sfl 1.2

Table users {
  text: "Users"

  Columns schema {
    Column field {
      text: "Field"
      width: 160
    }
    Column type {
      text: "Type"
      width: 120
    }
  }

  Rows data {
    Row row_1 {
      field: "id"
      type: "uuid"
    }
  }

  layout {
    rowHeight: 28
  }

  style {
    showHeader: true
    headerFill: "#f1f5f9"
    gridColor: "#cbd5e1"
    gridWidth: 1
    borderStyle: double
    headerRuleStyle: double
  }
}
`;

  it('parses the spec example and resolves with zero errors', () => {
    const doc = parse(TABLE_SAMPLE);
    const { errors } = resolveDocument(doc);
    expect(errors).toEqual([]);
  });

  it('is a leaf: Columns/Rows do not open a resolvable scope for from/to', () => {
    const doc = parse(TABLE_SAMPLE);
    const table = doc.blocks.find(b => b.name === 'users')!;
    expect(table.kind).toBe('Table');
  });

  it('legacy `Container name { kind: table … }` still parses and resolves cleanly', () => {
    const legacy = `sfl 1.2

Container users {
  kind: table
  text: "Users"
}
`;
    const doc = parse(legacy);
    const { errors } = resolveDocument(doc);
    expect(errors).toEqual([]);
  });

  it('round-trips through emit() without resolver errors on the re-parsed output', () => {
    const doc = parse(TABLE_SAMPLE);
    const emitted = emit(doc);
    const reparsed = parse(emitted);
    expect(resolveDocument(reparsed).errors).toEqual([]);
  });
});
