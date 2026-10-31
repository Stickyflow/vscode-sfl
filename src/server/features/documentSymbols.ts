// packages/vscode-sfl/src/server/features/documentSymbols.ts
//
// Populates the Outline panel / Ctrl+Shift+O breadcrumbs from the block
// tree. New code — the in-app sidepanel editor never needed this (its
// minimap (sflMinimap.ts) is a different, line-based overview). `detail`
// prefers a `kind:` property when present (so "Cart valid? — decision"
// reads at a glance), falling back to the composition list.

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import type { BlockKind, SflBlock } from '../sfl-core';

const SYMBOL_KIND: Record<BlockKind, SymbolKind> = {
  Project: SymbolKind.Namespace,
  Model: SymbolKind.Module,
  Group: SymbolKind.Package,
  Container: SymbolKind.Struct,
  Shape: SymbolKind.Object,
  Entity: SymbolKind.Object,
  Link: SymbolKind.Interface,
  Layout: SymbolKind.Struct,
  Style: SymbolKind.Class,
  Chart: SymbolKind.Struct,
  Axis: SymbolKind.Field,
  Series: SymbolKind.Array,
  Rule: SymbolKind.Field,
  Path: SymbolKind.Object,
  Symbol: SymbolKind.Class,
  Port: SymbolKind.Field,
  Net: SymbolKind.Interface,
  Isometric: SymbolKind.Object,
  Connection: SymbolKind.Interface,
  Text: SymbolKind.String,
  Image: SymbolKind.File,
  Widget: SymbolKind.Object,
  Shader: SymbolKind.Class,
  DataSource: SymbolKind.Variable,
  Dimension: SymbolKind.Field,
  Repeat: SymbolKind.Array,
  Template: SymbolKind.Class,
  Use: SymbolKind.Object,
};

function detailFor(block: SflBlock): string | undefined {
  const kindProp = block.entries.find(e => e.type === 'property' && e.property.key === 'kind');
  if (kindProp && kindProp.type === 'property' && kindProp.property.value.type === 'ident') {
    return kindProp.property.value.segments.join('.');
  }
  return block.composition.length ? `: ${block.composition.join(' & ')}` : undefined;
}

function toSymbol(block: SflBlock): DocumentSymbol | undefined {
  if (!block.range || !block.nameRange) return undefined;
  const nested = block.entries
    .filter((e): e is Extract<typeof e, { type: 'block' }> => e.type === 'block')
    .map(e => toSymbol(e.block))
    .filter((s): s is DocumentSymbol => s !== undefined);

  return {
    name: block.name,
    detail: detailFor(block),
    kind: SYMBOL_KIND[block.kind] ?? SymbolKind.Object,
    range: block.range,
    selectionRange: block.nameRange,
    children: nested.length ? nested : undefined,
  };
}

export function computeDocumentSymbols(model: DocumentModel): DocumentSymbol[] {
  if (!model.doc) return [];
  return model.doc.blocks
    .map(toSymbol)
    .filter((s): s is DocumentSymbol => s !== undefined);
}
