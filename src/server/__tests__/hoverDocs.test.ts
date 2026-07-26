import { describe, expect, it } from 'vitest';
import { MarkupContent } from 'vscode-languageserver/node';
import { buildDocumentModel } from '../documentModel';
import { computeHover } from '../features/hover';
import { computeCompletions } from '../features/completion';
import { allBlocks } from '../sfl-core';

const SAMPLE = `sfl 1.2

Style BasePill {
  shape: pill
}

Entity add_products : BasePill {
  kind: process
  text: "Add products"

  layout {
    position: 100, 100
  }
}
`;

function text(hover: ReturnType<typeof computeHover>): string {
  return (hover!.contents as MarkupContent).value;
}

describe('hover documentation', () => {
  it('documents a bare block keyword (Entity)', () => {
    const model = buildDocumentModel(SAMPLE);
    const entity = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const hover = computeHover(model, entity.kindRange!.start);
    expect(hover).toBeDefined();
    expect(text(hover)).toContain('Entity');
    expect(text(hover)).toContain('universal domain element');
  });

  it('documents a property key (kind) including its accepted values', () => {
    const model = buildDocumentModel(SAMPLE);
    const entity = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const kindEntry = entity.entries.find(e => e.type === 'property' && e.property.key === 'kind') as any;
    const hover = computeHover(model, kindEntry.property.keyRange.start);
    expect(hover).toBeDefined();
    expect(text(hover)).toContain('semantic role');
    expect(text(hover)).toContain('`decision`'); // one of the accepted values, listed
  });

  it('documents a layout property (position) with its `on:` context', () => {
    const model = buildDocumentModel(SAMPLE);
    const entity = allBlocks(model.doc!).find(b => b.name === 'add_products')!;
    const layoutEntry = entity.entries.find(e => e.type === 'layout') as any;
    const positionProp = layoutEntry.layout.properties[0];
    const hover = computeHover(model, positionProp.keyRange.start);
    expect(hover).toBeDefined();
    expect(text(hover)).toContain('relative to the parent');
    expect(text(hover)).toContain('layout {}');
  });

  it('does not throw and returns undefined for a property with no documentation', () => {
    const model = buildDocumentModel('sfl 1.2\n\nEntity a {\n  notARealProperty: 1\n}\n');
    const entity = allBlocks(model.doc!).find(b => b.name === 'a')!;
    const prop = entity.entries.find(e => e.type === 'property') as any;
    const hover = computeHover(model, prop.property.keyRange.start);
    expect(hover).toBeUndefined();
  });

  it('carries documentation through to completion items too', () => {
    const partialDoc = 'sfl 1.2\n\nEntity a {\n  ki';
    const model = buildDocumentModel(partialDoc);
    const items = computeCompletions(model, partialDoc, { line: 3, character: 4 });
    const kindItem = items.find(i => i.label === 'kind');
    expect(kindItem?.documentation).toContain('semantic role');
  });
});
