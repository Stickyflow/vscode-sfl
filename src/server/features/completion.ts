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

import { CHART_TYPES, SHAPE_TYPES, componentTypes } from 'stickyflow';
import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import {
  allBlocks, BLOCK_KINDS, collectBlockNames, compositionParentRef, effectiveLayoutProperties, effectiveStyleProperties,
  templateParameters, valueToDisplayString, type BlockKind, type SflBlock, type SflDocument,
} from '../sfl-core';
import { BLOCK_KIND_DOCS, PROPERTY_DOCS } from './sflDocs';

export const BLOCK_KEYWORDS = [...BLOCK_KINDS, 'layout', 'style'];

// Event handlers of a block (`onTap: target <- expr`), as stickyflow.js reads them.
export const HANDLER_EVENTS = [
  'onPress', 'onRelease', 'onTap', 'onDrag', 'onChange', 'onFocus', 'onBlur', 'onSubmit', 'onTick',
] as const;

export const PROPERTY_KEYS = [
  'id', 'kind', 'text', 'tags', 'caption', 'shape', 'symbol', 'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'textColor',
  'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'verticalAlign', 'cornerRadius',
  'opacity', 'dash', 'lineHeight', 'letterSpacing', 'shadow', 'orientation', 'lanes',
  'from', 'to', 'condition', 'weight', 'segments', 'route', 'marker', 'markerStart', 'markerEnd',
  'color', 'icon', 'asset', 'parent', 'position', 'size', 'rotation', 'order',
  'rowHeight', 'width', 'showHeader', 'headerFill', 'headerRuleStyle', 'gridColor', 'gridWidth', 'borderStyle', 'cellType',
  'type', 'stacked', 'categories', 'min', 'max', 'step', 'unit', 'label', 'values', 'error', 'at',
  'points', 'closed', 'value', 'tension', 'members',
  'fromFace', 'toFace', 'labelOffsetX', 'labelOffsetY', 'labelBackground',
  'columns', 'rows', 'count', 'origin', 'seed', 'jitter', 'chance', 'where', 'start', 'end', 'offset',
  // Repeat, Scene and 3D blocks (stickyflow.js 0.20 to 0.23)
  'each', 'sequence', 'elevation', 'height', 'chamfer', 'fillet', 'chamferEdges', 'filletEdges',
  'chamferTop', 'chamferBottom', 'filletTop', 'filletBottom', 'mirror', 'taper', 'shift', 'loft', 'walls',
  'thickness', 'bevel', 'symmetry', 'faces', 'heights', 'picture', 'base', 'detail', 'sketch', 'pick', 'on',
  'glow', 'writable', 'mode',
];

// The values the library reads for a key. `shape` and the chart and component `type` come from stickyflow.js itself,
// so a new form in the library is offered without a change here. `type` is picked by the block it stands in (see kindAt).
export const VALUE_SUGGESTIONS: Record<string, string[]> = {
  kind: ['process', 'decision', 'start', 'end', 'note', 'frame', 'swimlane', 'input', 'output', 'yes', 'no', 'highlight'],
  shape: [...SHAPE_TYPES],
  route: ['orthogonal', 'straight', 'curved'],
  fontWeight: ['normal', 'bold'],
  textAlign: ['left', 'center', 'right'],
  verticalAlign: ['top', 'middle', 'bottom'],
  markerStart: ['none', 'arrow', 'circle', 'diamond'],
  markerEnd: ['none', 'arrow', 'circle', 'diamond'],
  // Outside a Chart or a Component the `type:` of either kind is offered; see typeValues.
  type: [...CHART_TYPES, ...componentTypes()],
  sequence: ['diagonal'],
  mode: ['record', 'table'],
  closed: ['true', 'false'],
  // Isometric cube faces a `Connection` attaches to; stickyflow.js falls back to `front`.
  fromFace: ['"top"', '"bottom"', '"front"', '"back"', '"left"', '"right"'],
  toFace: ['"top"', '"bottom"', '"front"', '"back"', '"left"', '"right"'],
};

// Kinds whose names a `from:`/`to:` endpoint (or dot-path) can target. `Path`
// (SFL 1.4 §3.3) is a freeform shape and, like an Entity, linkable; so is an
// `Isometric` object, the endpoint of a `Connection`. `Text`, `Widget`, `Component`, `Screen` and
// `Chart` are canvas objects in stickyflow.js and can be linked as well.
const REFERENCEABLE_KINDS: readonly BlockKind[] = [
  'Project', 'Model', 'Group', 'Container', 'Screen', 'Shape', 'Entity', 'Path', 'Isometric', 'Text', 'Image', 'Widget', 'Component', 'Chart',
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
    const values = key === 'type' ? typeValues(model.doc, position) : VALUE_SUGGESTIONS[key];
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
    ...HANDLER_EVENTS.map(k => ({
      label: k,
      kind: CompletionItemKind.Event,
      documentation: PROPERTY_DOCS[k]?.description,
    })),
  ];
}

/** The `type:` values for the block the position stands in: chart forms in a Chart, component types in a Component or Widget. */
function typeValues(doc: SflDocument | null, position: Position): string[] {
  const kind = kindAt(doc, position);
  if (kind === 'Chart') return [...CHART_TYPES];
  if (kind === 'Component' || kind === 'Widget') return componentTypes();
  return VALUE_SUGGESTIONS.type;
}

/** The kind of the innermost block whose span holds the position. */
function kindAt(doc: SflDocument | null, position: Position): BlockKind | undefined {
  if (!doc) return undefined;
  const at = (p: { line: number; character: number }) => [p.line, p.character] as const;
  const before = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
  const here = at(position);
  let found: SflBlock | undefined;
  for (const block of allBlocks(doc)) {
    if (!block.range) continue;
    const inside = before(at(block.range.start), here) && before(here, at(block.range.end));
    if (inside && (!found || before(at(found.range!.start), at(block.range.start)))) found = block;
  }
  return found?.kind;
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
