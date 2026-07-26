import { describe, expect, it } from 'vitest';
import { buildDocumentModel } from '../documentModel';
import { computeReferences } from '../features/references';
import { allBlocks } from '../sfl-core';

const SAMPLE = `sfl 1.2

Style BasePill { shape: pill }

Entity add_products : BasePill {
  kind: process
  text: "Add products"
}

Entity load_cart {
  kind: process
  text: "Load cart"
}

Link add_to_load {
  from: add_products
  to: load_cart
}
`;

const URI = 'file:///sample.sfl';

describe('references (Find All References)', () => {
  it('finds the from: reference to an Entity, excluding its own declaration by default', () => {
    const model = buildDocumentModel(SAMPLE);
    const target = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const refs = computeReferences(model, URI, {
      textDocument: { uri: URI },
      position: target.nameRange!.start,
      context: { includeDeclaration: false },
    });
    expect(refs).toHaveLength(1);
  });

  it('includes the declaration when includeDeclaration is true', () => {
    const model = buildDocumentModel(SAMPLE);
    const target = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const refs = computeReferences(model, URI, {
      textDocument: { uri: URI },
      position: target.nameRange!.start,
      context: { includeDeclaration: true },
    });
    expect(refs).toHaveLength(2);
  });

  it('finds the composition reference to a Style', () => {
    const model = buildDocumentModel(SAMPLE);
    const target = allBlocks(model.doc!).find(b => b.name === 'BasePill')!;
    const refs = computeReferences(model, URI, {
      textDocument: { uri: URI },
      position: target.nameRange!.start,
      context: { includeDeclaration: false },
    });
    expect(refs).toHaveLength(1);
  });

  it('returns undefined when the position is not on anything resolvable', () => {
    const model = buildDocumentModel(SAMPLE);
    const refs = computeReferences(model, URI, {
      textDocument: { uri: URI },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: false },
    });
    expect(refs).toBeUndefined();
  });
});
