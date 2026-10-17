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

// Symbol / Port / Path / Net / Footer (SFL 1.4) — the rest of the 1.4 batch,
// bringing the ported grammar to parity with stickyflow.js. Path is a freeform
// shape and, like Entity, a valid link endpoint; the other four are leaves kept
// out of the global bare-name index. The interesting bit is `entity.portName`:
// a Link endpoint whose last segment names a Port on the Symbol the entity's
// `shape:` points at. See fixtures/valid/{symbol-ports,path-choropleth,net}.sfl.
describe('Symbol / Port / Path / Net / Footer (SFL 1.4)', () => {
  const SAMPLE = `sfl 1.4

Symbol OpAmp {
  points: [[0, 0], [1, 0.5], [0, 1]]
  Port in_minus { at: 0, 0.75 }
  Port out { at: 1, 0.5 }
}

Model board {
  Entity amp1 { shape: OpAmp; layout { position: 0, 0; size: 100, 60 } }
  Entity amp2 { shape: OpAmp; layout { position: 300, 0; size: 100, 60 } }

  Path region {
    points: [[0, 0], [100, 0], [100, 100]]
    closed: true
    value: 42.5
  }

  Net rail { members: [amp1, amp2]; text: "+5V" }

  Link fb { from: amp1.out; to: amp2.in_minus }
  Link into_region { from: amp2, right (0.5); to: region, left (0.5) }
}
`;

  it('parses and resolves the 1.4 batch with zero errors', () => {
    const doc = parse(SAMPLE);
    expect(resolveDocument(doc).errors).toEqual([]);
  });

  it('recognizes each new kind as a block, not a property', () => {
    const doc = parse(SAMPLE);
    const kinds = new Set<string>();
    const walk = (blocks: typeof doc.blocks) => {
      for (const b of blocks) {
        kinds.add(b.kind);
        walk(b.entries.filter(e => e.type === 'block').map(e => (e as any).block));
      }
    };
    walk(doc.blocks);
    for (const k of ['Symbol', 'Port', 'Path', 'Net']) expect(kinds.has(k)).toBe(true);
  });

  it('resolves an `entity.portName` endpoint against the Symbol the entity\'s shape points at', () => {
    // `amp1.out` is not a scope descent (an Entity opens no scope) — it only
    // resolves because Symbol OpAmp has a Port named `out`.
    const doc = parse(SAMPLE);
    expect(resolveDocument(doc).errors).toEqual([]);
  });

  it('flags a named-port endpoint whose port does not exist on the Symbol', () => {
    const bad = SAMPLE.replace('from: amp1.out', 'from: amp1.nonexistent');
    const { errors } = resolveDocument(parse(bad));
    expect(errors.some(e => /endpoint 'amp1\.nonexistent' does not resolve/.test(e.message))).toBe(true);
  });

  it('keeps Symbol/Port/Net out of the global bare-name index (Path stays in)', () => {
    // A bare `from: out` (a Port name) must not resolve; `from: region` (a Path) must.
    const badPort = SAMPLE.replace('from: amp1.out', 'from: out');
    expect(resolveDocument(parse(badPort)).errors.some(e => /does not resolve/.test(e.message))).toBe(true);

    const pathLink = SAMPLE.replace('to: region, left (0.5)', 'to: region');
    expect(resolveDocument(parse(pathLink)).errors).toEqual([]);
  });

  it('round-trips through emit() without resolver errors on the re-parsed output', () => {
    const doc = parse(SAMPLE);
    expect(resolveDocument(parse(emit(doc))).errors).toEqual([]);
  });
});

// Chart (SFL 1.4 §5.4) — added to the ported grammar after Table. Chart carries
// its own geometry like a Container but a fixed Axis/Series/Rule schema, so it
// (and its three child kinds) are leaves: no resolvable scope, and their names
// stay out of the global bare-name index. `Rule` (§5.4.8) is a reference line,
// distinct from Axis/Series. See also fixtures/valid/chart-bar.sfl + chart-pie.sfl.
describe('Chart (SFL 1.4 §5.4)', () => {
  const CHART_SAMPLE = `sfl 1.2

Model board {
  Chart revenue {
    text: "Revenue"
    type: bar
    stacked: true

    Axis x {
      categories: ["Q1", "Q2", "Q3", "Q4"]
    }
    Axis y {
      min: 0
      max: 100
      step: 10
      unit: "k€"
      label: "Net"
    }

    Series product_a {
      color: "#7c3aed"
      label: "Product A"
      values: [10, 20, 35, 40]
    }
    Series product_b {
      label: "Product B"
      values: [30, 5, 15, 25]
      error: [3, none, 4, 2]
    }

    Rule target {
      at: 60
      text: "Target"
      color: "#ef4444"
    }

    layout {
      position: 0, 0
      size: 480, 300
    }
    style {
      fill: "#f8fafc"
      gridColor: "#e2e8f0"
    }
  }
}
`;

  it('parses a Chart with Axis/Series/Rule children and resolves with zero errors', () => {
    const doc = parse(CHART_SAMPLE);
    const { errors } = resolveDocument(doc);
    expect(errors).toEqual([]);
  });

  it('recognizes Chart/Axis/Series/Rule as block kinds (not properties)', () => {
    const doc = parse(CHART_SAMPLE);
    const chart = doc.blocks[0].entries.find(e => e.type === 'block' && e.block.kind === 'Chart');
    expect(chart && chart.type === 'block').toBe(true);
    const childKinds = chart && chart.type === 'block'
      ? chart.block.entries.filter(e => e.type === 'block').map(e => (e as any).block.kind).sort()
      : [];
    expect(childKinds).toEqual(['Axis', 'Axis', 'Rule', 'Series', 'Series']);
  });

  it('is a leaf: a Chart opens no scope, so its child names stay out of the global index', () => {
    // `Series product_a` must NOT become resolvable as a bare `from:`/`to:` target.
    const withBadLink = CHART_SAMPLE.replace(
      '  }\n}\n',
      '  }\n\n  Link l {\n    from: product_a\n    to: product_b\n  }\n}\n',
    );
    const doc = parse(withBadLink);
    const { errors } = resolveDocument(doc);
    expect(errors.some(e => /does not resolve/.test(e.message))).toBe(true);
  });

  it('round-trips through emit() without resolver errors on the re-parsed output', () => {
    const doc = parse(CHART_SAMPLE);
    const emitted = emit(doc);
    const reparsed = parse(emitted);
    expect(resolveDocument(reparsed).errors).toEqual([]);
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

// Table (§12.1a) was removed from stickyflow.js, along with its Columns/
// Column/Rows/Row/Footer blocks. sfl-core rejects them with a message that
// says so, and `Container name { kind: table … }` is an ordinary Container.
describe('Table (removed)', () => {
  it.each(['Table', 'Columns', 'Column', 'Rows', 'Row', 'Footer'])('rejects a %s block and says it was removed', (kind) => {
    expect(() => parse(`sfl 1.4\n\n${kind} t {\n  text: "T"\n}\n`)).toThrow(/no longer supported by stickyflow\.js/);
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
});
