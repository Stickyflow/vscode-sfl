import { describe, expect, it } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { buildDocumentModel } from '../documentModel';
import { computeDocumentSymbols } from '../features/documentSymbols';

const SAMPLE = `sfl 1.2

Model checkout {
  text: "Checkout"

  Group cart {
    text: "Cart"

    Entity add_products {
      kind: process
      text: "Add products"
    }
  }
}
`;

describe('documentSymbols', () => {
  it('builds a nested symbol tree matching the block tree', () => {
    const model = buildDocumentModel(SAMPLE);
    const symbols = computeDocumentSymbols(model);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('checkout');
    expect(symbols[0].kind).toBe(SymbolKind.Module);
    expect(symbols[0].children).toHaveLength(1);
    expect(symbols[0].children![0].name).toBe('cart');
    expect(symbols[0].children![0].children![0].name).toBe('add_products');
  });

  it("uses the Entity's kind: property as detail", () => {
    const model = buildDocumentModel(SAMPLE);
    const symbols = computeDocumentSymbols(model);
    const entity = symbols[0].children![0].children![0];
    expect(entity.detail).toBe('process');
  });

  it("each symbol's range spans the whole block, not just the name", () => {
    const model = buildDocumentModel(SAMPLE);
    const symbols = computeDocumentSymbols(model);
    const model_ = symbols[0];
    // "Model checkout {" — kind and name share a line with the selectionRange, but the
    // full range extends down to the block's closing '}', well past that line.
    expect(model_.range.start.line).toBe(model_.selectionRange.start.line);
    expect(model_.range.end.line).toBeGreaterThan(model_.selectionRange.start.line);
  });

  it('returns an empty list for an unparseable document', () => {
    const model = buildDocumentModel('sfl 1.2\n\nEntity {');
    expect(computeDocumentSymbols(model)).toEqual([]);
  });
});
