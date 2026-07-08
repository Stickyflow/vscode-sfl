import { describe, expect, it } from 'vitest';
import { buildDocumentModel } from '../documentModel';
import { computePrepareRename, computeRename } from '../features/rename';
import { allBlocks } from '../sfl-core';

const SAMPLE = `sfl 1.1

Entity add_products {
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

describe('rename', () => {
  it('prepareRename succeeds on a block declaration', () => {
    const model = buildDocumentModel(SAMPLE);
    const target = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const prepared = computePrepareRename(model, target.nameRange!.start);
    expect(prepared?.placeholder).toBe('add_products');
  });

  it('renaming an Entity updates the declaration and every from:/to: reference to it', () => {
    const model = buildDocumentModel(SAMPLE);
    const target = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const edit = computeRename(model, 'file:///sample.sfl', target.nameRange!.start, 'add_items');
    expect(edit).toBeDefined();
    const edits = edit!.changes!['file:///sample.sfl'];
    // declaration + the Link's `from:` endpoint = 2 occurrences; not `to:` (that points at load_cart).
    expect(edits).toHaveLength(2);
    expect(edits.every(e => e.newText === 'add_items')).toBe(true);
  });

  it('renaming via a from:/to: reference renames the same target as renaming the declaration', () => {
    const model = buildDocumentModel(SAMPLE);
    const link = allBlocks(model.doc!).find(b => b.name === 'add_to_load')!;
    const fromEntry = link.entries.find(e => e.type === 'property' && e.property.key === 'from') as any;
    const refRange = fromEntry.property.value.segmentRanges[0];

    const viaReference = computeRename(model, 'file:///sample.sfl', refRange.start, 'add_items');
    const declaration = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const viaDeclaration = computeRename(model, 'file:///sample.sfl', declaration.nameRange!.start, 'add_items');

    expect(viaReference!.changes!['file:///sample.sfl']).toHaveLength(2);
    expect(viaDeclaration!.changes!['file:///sample.sfl']).toHaveLength(2);
  });

  it('does not rename a keyword value like `kind: process` (ident values are not references)', () => {
    const model = buildDocumentModel(SAMPLE);
    const entity = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const kindEntry = entity.entries.find(e => e.type === 'property' && e.property.key === 'kind') as any;
    const valueRange = kindEntry.property.value.segmentRanges[0]; // range of the word "process"
    const result = computePrepareRename(model, valueRange.start);
    expect(result).toBeUndefined();
  });
});
