// packages/vscode-sfl/src/server/features/completion.ts
//
// Vocabulary lists ported from
// frontend/src/features/sfl-language/sfl/editor/sflAutocomplete.ts
// (BLOCK_KEYWORDS/PROPERTY_KEYS/VALUE_SUGGESTIONS). Things the sidepanel
// version doesn't do, added here: composition-ref completion after ':' or
// '&' in a block header (Style *and* Layout names, §8), and in-document
// block-name completion inside from:/to: endpoints. Filtering-by-typed-
// prefix is left to the LSP client (VS Code matches CompletionItem labels
// against the current word automatically via the language's wordPattern),
// unlike the sidepanel's manual prefix filter.

import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import {
  allBlocks, BLOCK_KINDS, collectBlockNames, compositionParentRef, effectiveLayoutProperties, effectiveStyleProperties,
  templateParameters, valueToDisplayString, type BlockKind,
} from '../sfl-core';
import { BLOCK_KIND_DOCS, PROPERTY_DOCS } from './sflDocs';

export const BLOCK_KEYWORDS = [...BLOCK_KINDS, 'layout', 'style'];
export const PROPERTY_KEYS = [
  'id', 'kind', 'text', 'tags', 'caption', 'shape', 'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'textColor',
  'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'verticalAlign', 'cornerRadius',
  'opacity', 'dash', 'lineHeight', 'letterSpacing', 'shadow', 'orientation', 'lanes',
  'from', 'to', 'condition', 'weight', 'segments', 'route', 'marker', 'markerStart', 'markerEnd',
  'color', 'icon', 'asset', 'parent', 'position', 'size', 'rotation', 'order',
  'rowHeight', 'width', 'showHeader', 'headerFill', 'headerRuleStyle', 'gridColor', 'gridWidth', 'borderStyle', 'cellType',
  'type', 'stacked', 'categories', 'min', 'max', 'step', 'unit', 'label', 'values', 'error', 'at',
  'points', 'closed', 'value', 'tension', 'members',
  'fromFace', 'toFace', 'labelOffsetX', 'labelOffsetY', 'labelBackground',
  'columns', 'rows', 'count', 'origin', 'seed', 'jitter', 'chance', 'where', 'start', 'end', 'offset',
];
export const VALUE_SUGGESTIONS: Record<string, string[]> = {
  kind: ['process', 'decision', 'start', 'end', 'note', 'frame', 'swimlane', 'input', 'output', 'yes', 'no', 'highlight'],
  shape: ['rectangle', 'rounded_rectangle', 'pill', 'diamond', 'circle', 'ellipse'],
  route: ['orthogonal', 'straight', 'curved'],
  fontWeight: ['normal', 'bold'],
  textAlign: ['left', 'center', 'right'],
  verticalAlign: ['top', 'middle', 'bottom'],
  markerStart: ['none', 'arrow', 'circle', 'diamond'],
  markerEnd: ['none', 'arrow', 'circle', 'diamond'],
  // Chart `type:` vocabulary (SFL 1.4 §5.4) — mirrors stickyflow.js's CHART_TYPES.
  type: ['bar', 'line', 'scatter', 'radar', 'radial', 'field', 'heatmap', 'boxplot', 'sankey', 'treemap', 'mekko', 'hexbin', 'pie', 'matrix', 'grid', 'custom'],
  closed: ['true', 'false'],
  // Isometric cube faces a `Connection` attaches to; stickyflow.js falls back to `front`.
  fromFace: ['"top"', '"bottom"', '"front"', '"back"', '"left"', '"right"'],
  toFace: ['"top"', '"bottom"', '"front"', '"back"', '"left"', '"right"'],
};

// Kinds whose names a `from:`/`to:` endpoint (or dot-path) can target. `Path`
// (SFL 1.4 §3.3) is a freeform shape and, like an Entity, linkable; so is an
// `Isometric` object, the endpoint of a `Connection`. `Text`, `Widget` and
// `Chart` are canvas objects in stickyflow.js and can be linked as well.
const REFERENCEABLE_KINDS: readonly BlockKind[] = [
  'Project', 'Model', 'Group', 'Container', 'Shape', 'Entity', 'Path', 'Isometric', 'Text', 'Widget', 'Chart',
];

// Matches a block header up through ':' plus zero or more already-typed
// `Ref & ` groups, i.e. the cursor sits right where the next composition
// reference belongs (`Entity foo : `, `Entity foo : StyleA & `, …).
const HEADER_COMPOSITION_RE = new RegExp(
  `^\\s*(${BLOCK_KINDS.join('|')})\\s+[A-Za-z_][A-Za-z0-9_]*\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*\\s*&\\s*)*$`,
);
const PROPERTY_VALUE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/;
const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*$/;

export function computeCompletions(model: DocumentModel, docText: string, position: Position): CompletionItem[] {
  const lines = docText.split('\n');
  const line = lines[position.line] ?? '';
  const before = line.slice(0, position.character);
  const word = before.match(WORD_RE)?.[0] ?? '';
  const linePrefix = before.slice(0, before.length - word.length);

  if (HEADER_COMPOSITION_RE.test(linePrefix)) {
    // `Use oak : ` names a Template, every other header a Style or Layout.
    return /^\s*Use\s/.test(linePrefix) ? templateItems(model) : compositionRefItems(model);
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
    ...BLOCK_KEYWORDS.map(k => ({
      label: k,
      kind: CompletionItemKind.Keyword,
      documentation: BLOCK_KIND_DOCS[k as keyof typeof BLOCK_KIND_DOCS],
    })),
    ...PROPERTY_KEYS.map(k => ({
      label: k,
      kind: CompletionItemKind.Property,
      documentation: PROPERTY_DOCS[k]?.description,
    })),
  ];
}

function compositionRefItems(model: DocumentModel): CompletionItem[] {
  if (!model.doc) return [];
  const doc = model.doc;
  return allBlocks(doc).filter(b => b.kind === 'Style' || b.kind === 'Layout').map((target) => {
    const props = target.kind === 'Style' ? effectiveStyleProperties(doc, target) : effectiveLayoutProperties(doc, target);
    const preview = [...props.entries()].map(([k, v]) => `${k}: ${valueToDisplayString(v)}`).join('\n');
    const parentRef = compositionParentRef(doc, target);
    return {
      label: target.name,
      kind: target.kind === 'Style' ? CompletionItemKind.Class : CompletionItemKind.Struct,
      detail: parentRef ? `${target.kind}, extends ${parentRef}` : target.kind,
      documentation: preview || undefined,
    };
  });
}

function templateItems(model: DocumentModel): CompletionItem[] {
  if (!model.doc) return [];
  return allBlocks(model.doc).filter(b => b.kind === 'Template').map(template => ({
    label: template.name,
    kind: CompletionItemKind.Class,
    detail: 'Template',
    documentation: templateParameters(template) || undefined,
  }));
}

function referenceableBlockItems(model: DocumentModel): CompletionItem[] {
  if (!model.doc) return [];
  return collectBlockNames(model.doc, REFERENCEABLE_KINDS).map(({ name, kind }) => ({
    label: name,
    kind: CompletionItemKind.Reference,
    detail: kind,
  }));
}
