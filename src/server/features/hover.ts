// packages/vscode-sfl/src/server/features/hover.ts
//
// On a Style reference (block-header `: StyleName` or a Style block's own
// name): the resolved effective style, merging the §9.2 inheritance chain, as
// a markdown fenced block. On an Entity/Group/Container/Flow/Project
// reference (from/to endpoint, or any resolvable bare path): its kind + text.
// On a `kind:` value that isn't a reference: the semantic meaning from §12 of
// the spec, so hovering `kind: decision` explains what that means without
// leaving the editor.

import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import type { DocumentModel } from '../documentModel';
import { findAtPosition, effectiveStyleProperties, valueToDisplayString, type SflBlock } from '../sfl-core';

// §12 kind axis — mirrors the descriptions in docs/sfl-1.1-spezifikation.md / SFLLanguage.tsx Table 7.
const KIND_DESCRIPTIONS: Record<string, string> = {
  start: 'Model entry point — no incoming links expected.',
  end: 'Model exit point — no outgoing links expected.',
  decision: 'Branching point — at least two outgoing links; conditions should be set.',
  process: 'Processing step.',
  input: 'Data input.',
  output: 'Data output.',
  note: 'Free text note — not part of the model graph.',
  frame: 'Bounded board section — an addressable container area.',
  swimlane: 'Bounded, oriented lane container.',
  component: 'Reusable building block.',
  custom: 'User-defined meaning — no predefined constraint.',
};

function styleHoverMarkdown(model: DocumentModel, style: SflBlock): string {
  const props = effectiveStyleProperties(model.doc!, style);
  const lines = [...props.entries()].map(([k, v]) => `${k}: ${valueToDisplayString(v)}`);
  const chain = style.style ? `\n\n_extends ${style.style}_` : '';
  return `**Style** \`${style.name}\`${chain}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

function blockHoverMarkdown(block: SflBlock): string {
  const textProp = block.entries.find(e => e.type === 'property' && e.property.key === 'text');
  const kindProp = block.entries.find(e => e.type === 'property' && e.property.key === 'kind');
  const text = textProp && textProp.type === 'property' ? valueToDisplayString(textProp.property.value) : undefined;
  const kind = kindProp && kindProp.type === 'property' ? valueToDisplayString(kindProp.property.value) : undefined;
  let md = `**${block.kind}** \`${block.name}\``;
  if (kind) md += `  \nkind: ${kind}`;
  if (text) md += `  \ntext: ${text}`;
  if (block.style) md += `  \nstyle: ${block.style}`;
  return md;
}

export function computeHover(model: DocumentModel, position: Position): Hover | undefined {
  if (!model.doc || !model.resolveResult) return undefined;
  const hit = findAtPosition(model.doc, { line: position.line, character: position.character });
  if (!hit) return undefined;

  if (hit.type === 'blockName') {
    const md = hit.block.kind === 'Style' ? styleHoverMarkdown(model, hit.block) : blockHoverMarkdown(hit.block);
    return { contents: { kind: MarkupKind.Markdown, value: md }, range: hit.block.nameRange };
  }

  if (hit.type === 'styleRef') {
    const target = model.resolveResult.resolveStyleRef(hit.block, hit.name);
    if (!target) return undefined;
    return { contents: { kind: MarkupKind.Markdown, value: styleHoverMarkdown(model, target) }, range: hit.range };
  }

  if (hit.type === 'pathSegment') {
    const partial = hit.segments.slice(0, hit.segmentIndex + 1);
    const target = model.resolveResult.resolve(hit.block, partial);
    if (target) {
      return { contents: { kind: MarkupKind.Markdown, value: blockHoverMarkdown(target) }, range: hit.range };
    }
    // Not a reference — fall back to a static description for well-known `kind` values.
    if (hit.property.key === 'kind' && hit.segments.length === 1) {
      const desc = KIND_DESCRIPTIONS[hit.segments[0]];
      if (desc) return { contents: { kind: MarkupKind.Markdown, value: `**kind: ${hit.segments[0]}**\n\n${desc}` }, range: hit.range };
    }
  }

  return undefined;
}
