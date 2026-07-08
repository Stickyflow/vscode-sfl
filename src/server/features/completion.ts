// packages/vscode-sfl/src/server/features/completion.ts
//
// Vocabulary lists ported from
// frontend/src/features/sidepanels/right/components/sfl/sflAutocomplete.ts
// (BLOCK_KEYWORDS/PROPERTY_KEYS/VALUE_SUGGESTIONS). Two things the sidepanel
// version doesn't do, added here: style-name completion after ':' in a block
// header, and in-document block-name completion inside from:/to: endpoints.
// Filtering-by-typed-prefix is left to the LSP client (VS Code matches
// CompletionItem labels against the current word automatically via the
// language's wordPattern), unlike the sidepanel's manual prefix filter.

import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { allBlocks, collectBlockNames, effectiveStyleProperties, valueToDisplayString } from '../sfl-core';

export const BLOCK_KEYWORDS = ['Project', 'Flow', 'Group', 'Container', 'Entity', 'Link', 'Style', 'layout'];
export const PROPERTY_KEYS = [
  'id', 'kind', 'text', 'shape', 'fill', 'stroke', 'strokeWidth', 'textColor',
  'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'verticalAlign', 'cornerRadius',
  'opacity', 'dash', 'lineHeight', 'letterSpacing', 'shadow', 'orientation', 'lanes',
  'from', 'to', 'condition', 'weight', 'segments', 'route', 'markerStart', 'markerEnd',
  'color', 'icon', 'parent', 'position', 'size', 'rotation', 'order',
];
export const VALUE_SUGGESTIONS: Record<string, string[]> = {
  kind: ['process', 'decision', 'start', 'end', 'note', 'frame', 'swimlane', 'input', 'output'],
  shape: ['rectangle', 'rounded_rectangle', 'pill', 'diamond', 'circle', 'ellipse'],
  route: ['orthogonal', 'straight', 'curved'],
  fontWeight: ['normal', 'bold'],
  textAlign: ['left', 'center', 'right'],
  verticalAlign: ['top', 'middle', 'bottom'],
  markerStart: ['none', 'arrow', 'circle', 'diamond'],
  markerEnd: ['none', 'arrow', 'circle', 'diamond'],
};

const REFERENCEABLE_KINDS = ['Project', 'Flow', 'Group', 'Container', 'Entity'] as const;

const HEADER_STYLE_RE = /^\s*(Project|Flow|Group|Container|Entity|Link|Style)\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*$/;
const PROPERTY_VALUE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/;
const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*$/;

export function computeCompletions(model: DocumentModel, docText: string, position: Position): CompletionItem[] {
  const lines = docText.split('\n');
  const line = lines[position.line] ?? '';
  const before = line.slice(0, position.character);
  const word = before.match(WORD_RE)?.[0] ?? '';
  const linePrefix = before.slice(0, before.length - word.length);

  if (HEADER_STYLE_RE.test(linePrefix)) {
    return styleNameItems(model);
  }

  const propMatch = linePrefix.match(PROPERTY_VALUE_RE);
  if (propMatch) {
    const key = propMatch[1];
    if (key === 'from' || key === 'to') return referenceableBlockItems(model);
    const values = VALUE_SUGGESTIONS[key];
    if (values) return values.map(v => ({ label: v, kind: CompletionItemKind.EnumMember }));
    return [];
  }

  return [
    ...BLOCK_KEYWORDS.map(k => ({ label: k, kind: CompletionItemKind.Keyword })),
    ...PROPERTY_KEYS.map(k => ({ label: k, kind: CompletionItemKind.Property })),
  ];
}

function styleNameItems(model: DocumentModel): CompletionItem[] {
  if (!model.doc) return [];
  const doc = model.doc;
  return allBlocks(doc).filter(b => b.kind === 'Style').map((target) => {
    const props = effectiveStyleProperties(doc, target);
    const preview = [...props.entries()].map(([k, v]) => `${k}: ${valueToDisplayString(v)}`).join('\n');
    return {
      label: target.name,
      kind: CompletionItemKind.Class,
      detail: target.style ? `extends ${target.style}` : undefined,
      documentation: preview || undefined,
    };
  });
}

function referenceableBlockItems(model: DocumentModel): CompletionItem[] {
  if (!model.doc) return [];
  return collectBlockNames(model.doc, REFERENCEABLE_KINDS).map(({ name, kind }) => ({
    label: name,
    kind: CompletionItemKind.Reference,
    detail: kind,
  }));
}
