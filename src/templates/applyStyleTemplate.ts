// Applies a style template to SFL text. Pure: text in, text out, no VS Code.
//
// What changes:
//  - Every Style whose name starts with `tpl_` is removed, and the template's
//    Style blocks are inserted in place of the first one (or, the first time,
//    before the first top-level block that isn't a Style or Layout).
//  - Each styleable block points at its role's Style: its existing Style
//    reference is replaced, or one is added. Layout references stay.
//  - Local properties the role's Style sets (`fill`, `stroke`, `route`, ...)
//    are removed from the block and its `style { }`, so the template actually
//    shows. `shape` is the exception: a decision diamond or a database
//    cylinder carries meaning, so a block's own `shape:` is kept, and a shape
//    that came from the Style being replaced is moved onto the block.
//
// Everything else (comments, formatting, other properties, blocks the
// template doesn't style) is left byte for byte. The result is parsed again
// before it's returned, so a bad patch never reaches the document.

import { parse, SflParseError, type SflBlock, type SflProperty, type SflRange } from '../server/sfl-core';
import { roleStyleName, TEMPLATE_PREFIX, type StyleTemplate, type TemplateRole } from './styleTemplates';

export type ApplyResult =
  | { ok: true; text: string; restyled: number }
  | { ok: false; reason: string };

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Properties a template never removes from a block, even when its Style sets them. */
const KEPT_LOCAL_PROPERTIES = new Set(['shape']);

export function applyStyleTemplate(source: string, template: StyleTemplate): ApplyResult {
  let doc;
  try {
    doc = parse(source);
  } catch (e) {
    if (e instanceof SflParseError) return { ok: false, reason: `Fix the syntax error on line ${e.line} first.` };
    throw e;
  }

  const offsets = lineOffsets(source);
  const at = (pos: SflRange['start']) => offsets[pos.line] + pos.character;
  const blocks = walk(doc.blocks);
  const styles = new Map(blocks.filter((b) => b.kind === 'Style').map((b) => [b.name, b]));
  const styleNames = new Set(styles.keys());
  const accentNames = startNodes(blocks);

  const edits: Edit[] = [];
  let restyled = 0;

  for (const block of blocks) {
    const role = roleOf(block, accentNames);
    if (!role) continue;
    const reference = setStyleReference(block, roleStyleName(role), styleNames, at);
    if (!reference) continue;
    edits.push(reference);
    const local = localProperties(block);
    const keys = Object.keys(template.styles[role]).filter((k) => !KEPT_LOCAL_PROPERTIES.has(k));
    for (const property of local) {
      if (keys.includes(property.key) && property.keyRange) edits.push(propertyRemoval(source, at(property.keyRange.start)));
    }
    const carried = role === 'node' || role === 'accent' ? inheritedShape(block, styles) : undefined;
    if (carried && carried !== template.styles[role].shape && !local.some((p) => p.key === 'shape')) {
      const insert = shapeInsertion(source, block, carried, at);
      if (insert) edits.push(insert);
    }
    restyled++;
  }

  edits.push(...templateStyleEdits(source, doc.blocks, blocks, template, at));

  let text = applyEdits(source, mergeOverlaps(edits));
  text = removeEmptyStyleBlocks(text);

  try {
    parse(text);
  } catch {
    return { ok: false, reason: 'Applying the template produced invalid SFL, so nothing was changed. Please report this file.' };
  }
  return { ok: true, text, restyled };
}

/** The template whose canvas color the document carries, if any. */
export function detectTemplateId(source: string, templates: readonly StyleTemplate[]): string | undefined {
  const match = /\bStyle\s+tpl_canvas\b[^{]*\{[^}]*\bfill\s*:\s*"([^"]+)"/.exec(source);
  if (!match) return undefined;
  return templates.find((t) => t.styles.canvas.fill === `"${match[1]}"`)?.id;
}

function roleOf(block: SflBlock, accentNames: Set<string>): TemplateRole | undefined {
  switch (block.kind) {
    case 'Shape':
    case 'Entity':
      return accentNames.has(block.name) ? 'accent' : 'node';
    case 'Container':
      return 'frame';
    case 'Table':
      return 'table';
    case 'Link':
    case 'Connection':
      return 'flow';
    case 'Isometric':
      return 'iso';
    default:
      return undefined;
  }
}

/** Shapes where a flow starts: at least one outgoing link and no incoming one.
 *  These get the template's accent, like the highlighted start node in a
 *  user-flow diagram. */
function startNodes(blocks: SflBlock[]): Set<string> {
  const from = new Set<string>();
  const to = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'Link' && block.kind !== 'Connection') continue;
    for (const entry of block.entries) {
      if (entry.type !== 'property') continue;
      const { key, value } = entry.property;
      if ((key !== 'from' && key !== 'to') || (value.type !== 'endpoint' && value.type !== 'ident')) continue;
      const target = value.segments[value.segments.length - 1];
      (key === 'from' ? from : to).add(target);
    }
  }
  return new Set([...from].filter((name) => !to.has(name)));
}

function setStyleReference(
  block: SflBlock,
  styleName: string,
  styleNames: Set<string>,
  at: (pos: SflRange['start']) => number,
): Edit | undefined {
  const ranges = block.compositionRanges ?? [];
  const index = block.composition.findIndex((ref) => styleNames.has(ref));
  if (index >= 0 && ranges[index]) {
    return { start: at(ranges[index].start), end: at(ranges[index].end), text: styleName };
  }
  if (block.composition.length > 0 && ranges[0]) {
    const start = at(ranges[0].start);
    return { start, end: start, text: `${styleName} & ` };
  }
  if (!block.nameRange) return undefined;
  const end = at(block.nameRange.end);
  return { start: end, end, text: ` : ${styleName}` };
}

/** The `shape` a block gets from its current (non-template) Style chain. */
function inheritedShape(block: SflBlock, styles: Map<string, SflBlock>): string | undefined {
  let name = block.composition.find((ref) => styles.has(ref));
  const seen = new Set<string>();
  while (name && !name.startsWith(TEMPLATE_PREFIX) && !seen.has(name)) {
    seen.add(name);
    const style = styles.get(name)!;
    const shape = localProperties(style).find((p) => p.key === 'shape');
    if (shape) return shape.value.type === 'ident' ? shape.value.segments.join('.') : undefined;
    name = style.composition.find((ref) => styles.has(ref));
  }
  return undefined;
}

/** `shape: <value>` as the block's first property, matching its layout. */
function shapeInsertion(source: string, block: SflBlock, shape: string, at: (pos: SflRange['start']) => number): Edit | undefined {
  if (!block.range || !block.nameRange) return undefined;
  const brace = source.indexOf('{', at(block.nameRange.end));
  if (brace < 0 || brace >= at(block.range.end)) return undefined;
  const afterBrace = source.slice(brace + 1);
  const firstLine = /^[ \t]*\r?\n([ \t]*)\S/.exec(afterBrace);
  if (!firstLine) return { start: brace + 1, end: brace + 1, text: ` shape: ${shape};` };
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return { start: brace + 1, end: brace + 1, text: `${eol}${firstLine[1]}shape: ${shape}` };
}

function localProperties(block: SflBlock): SflProperty[] {
  const properties: SflProperty[] = [];
  for (const entry of block.entries) {
    if (entry.type === 'property') properties.push(entry.property);
    else if (entry.type === 'style') properties.push(...entry.style.properties);
  }
  return properties;
}

/** Removes the template's previous Style blocks and inserts the new ones. */
function templateStyleEdits(
  source: string,
  topLevel: SflBlock[],
  all: SflBlock[],
  template: StyleTemplate,
  at: (pos: SflRange['start']) => number,
): Edit[] {
  const styleText = (Object.keys(template.styles) as TemplateRole[])
    .map((role) => {
      const body = Object.entries(template.styles[role]).map(([key, value]) => `${key}: ${value}`).join('; ');
      return `Style ${roleStyleName(role)} { ${body} }`;
    })
    .join('\n');

  const previous = all.filter((b) => b.kind === 'Style' && b.name.startsWith(TEMPLATE_PREFIX) && b.range);
  if (previous.length > 0) {
    const [first, ...rest] = previous.map((b) => blockRemoval(source, at(b.range!.start), at(b.range!.end)));
    return [{ start: first.start, end: first.end, text: styleText + '\n' }, ...rest.map((r) => ({ ...r, text: '' }))];
  }

  const anchor = topLevel.find((b) => b.kind !== 'Style' && b.kind !== 'Layout' && b.range);
  if (anchor) {
    const start = at(anchor.range!.start);
    return [{ start, end: start, text: `${styleText}\n\n` }];
  }
  const end = source.length;
  return [{ start: end, end, text: `${source.endsWith('\n') ? '' : '\n'}\n${styleText}\n` }];
}

/** A whole block, plus its line if nothing else is on it. */
function blockRemoval(source: string, start: number, end: number): { start: number; end: number } {
  return expandToLine(source, start, end);
}

/** The text of one `key: value` property, plus the separator that goes with it. */
function propertyRemoval(source: string, keyStart: number): Edit {
  let i = keyStart;
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      i = skipString(source, i);
      continue;
    }
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (depth === 0 && (ch === ';' || ch === '\n' || ch === '}')) break;
  }

  let start = keyStart;
  let end = i;
  if (source[i] === ';') {
    end = i + 1;
    while (source[end] === ' ' || source[end] === '\t') end++;
  } else {
    while (end > start && (source[end - 1] === ' ' || source[end - 1] === '\t' || source[end - 1] === '\r')) end--;
    if (source[i] === '}') {
      // Last property on a one-line block: take the `; ` before it instead.
      let j = start;
      while (j > 0 && (source[j - 1] === ' ' || source[j - 1] === '\t')) j--;
      if (source[j - 1] === ';') start = j - 1;
    }
  }
  const line = expandToLine(source, start, end);
  return { ...line, text: '' };
}

/** Widens [start, end) to whole lines when only whitespace surrounds it. */
function expandToLine(source: string, start: number, end: number): { start: number; end: number } {
  let lineStart = start;
  while (lineStart > 0 && (source[lineStart - 1] === ' ' || source[lineStart - 1] === '\t')) lineStart--;
  if (lineStart > 0 && source[lineStart - 1] !== '\n') return { start, end };
  let lineEnd = end;
  while (lineEnd < source.length && (source[lineEnd] === ' ' || source[lineEnd] === '\t' || source[lineEnd] === '\r')) lineEnd++;
  if (lineEnd < source.length && source[lineEnd] !== '\n') return { start, end };
  return { start: lineStart, end: Math.min(lineEnd + 1, source.length) };
}

function skipString(source: string, quote: number): number {
  if (source.startsWith('"""', quote)) {
    const close = source.indexOf('"""', quote + 3);
    return close < 0 ? source.length : close + 2;
  }
  for (let i = quote + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === '"') return i;
  }
  return source.length;
}

function mergeOverlaps(edits: Edit[]): Edit[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Edit[] = [];
  for (const edit of sorted) {
    const last = merged[merged.length - 1];
    // Only pure deletions can overlap (two removals on one line); inserts
    // and replacements sit on block headers and never touch a removal.
    if (last && edit.start < last.end && last.text === '' && edit.text === '') {
      last.end = Math.max(last.end, edit.end);
    } else {
      merged.push({ ...edit });
    }
  }
  return merged;
}

function applyEdits(source: string, edits: Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

/** `style { }` sub-blocks the removals emptied out. */
function removeEmptyStyleBlocks(text: string): string {
  return text
    .replace(/^[ \t]*style[ \t]*\{\s*\}[ \t]*;?[ \t]*\r?\n/gm, '')
    .replace(/;?[ \t]*\bstyle[ \t]*\{[ \t]*\}/g, '');
}

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function walk(blocks: SflBlock[]): SflBlock[] {
  const out: SflBlock[] = [];
  for (const block of blocks) {
    out.push(block);
    for (const entry of block.entries) if (entry.type === 'block') out.push(...walk([entry.block]));
  }
  return out;
}
