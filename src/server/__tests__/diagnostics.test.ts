import { describe, expect, it } from 'vitest';
import { buildDocumentModel } from '../documentModel';
import { computeDiagnostics } from '../features/diagnostics';

describe('diagnostics', () => {
  it('is empty for a valid minimal document', () => {
    const text = `sfl 1.1

Entity a {
  text: "A"
}
`;
    const model = buildDocumentModel(text);
    expect(computeDiagnostics(model)).toEqual([]);
  });

  it('flags a duplicate name in the same scope', () => {
    const text = `sfl 1.1

Entity dup {
  text: "First"
}

Entity dup {
  text: "Second"
}
`;
    const model = buildDocumentModel(text);
    const diags = computeDiagnostics(model);
    expect(diags.some(d => /duplicate name 'dup'/.test(d.message))).toBe(true);
  });

  it('flags a dangling from: endpoint', () => {
    const text = `sfl 1.1

Entity a {
  text: "A"
}

Link a_to_nowhere {
  from: a
  to: does_not_exist
}
`;
    const model = buildDocumentModel(text);
    const diags = computeDiagnostics(model);
    expect(diags.some(d => /does not resolve/.test(d.message))).toBe(true);
  });

  it('reports a syntax error with a usable range', () => {
    const text = `sfl 1.1

Entity a {
  text "A"
}
`; // missing ':' after the property key
    const model = buildDocumentModel(text);
    const diags = computeDiagnostics(model);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].range.start.line).toBeGreaterThanOrEqual(0);
  });
});
