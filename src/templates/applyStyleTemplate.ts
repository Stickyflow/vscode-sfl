// Applies a style template to SFL text. Pure: text in, text out, no VS Code.
//
// What changes:
//  - Every Style whose name starts with `tpl_` is removed, and the template's
//    Style blocks are inserted in place of the first one (or, the first time,
//    before the first top-level block that isn't a Style or Layout).
//  - Each styleable block points at its role's Style: its existing Style
//    reference is replaced, or one is added. Layout references stay. A shape
//    with `kind: decision`, `input`, `yes` or `no` gets that role when the
//    template has one; `kind: start`, or a shape a flow starts from, gets the accent.
//  - Local properties the role's Style sets (`fill`, `stroke`, `route`, ...)
//    are removed from the block and its `style { }`, so the template actually
//    shows. `shape` is the exception: a decision diamond or a database
//    cylinder carries meaning, so a block's own `shape:` is kept, and a shape
//    that came from the Style being replaced is moved onto the block.
//  - A template with `yes` / `no` styles first turns a decision's links
//    labelled yes or no into small branch nodes (see branchNodes.ts).
//
// Everything else (comments, formatting, other properties, blocks the
// template doesn't style) is left byte for byte. The result is parsed again
// before it's returned, so a bad patch never reaches the document.

import { parse, SflParseError, type SflBlock, type SflProperty, type SflRange } from '../server/sfl-core';
import { addBranchNodes } from './branchNodes';
import { applyEdits, eolOf, expandToLine, isShape, kindOf, mergeOverlaps, offsetMapper, propertyRemoval, walk, type Edit } from './sflText';
import { roleStyleName, TEMPLATE_PREFIX, type StyleTemplate, type TemplateRole } from './styleTemplates';

export type ApplyResult =
  | { ok: true; text: string; restyled: number; branches: number }
  | { ok: false; reason: string };

/** Properties a template never removes from a block, even when its Style sets them. */
const KEPT_LOCAL_PROPERTIES = new Set(['shape']);

export function applyStyleTemplate(original: string, template: StyleTemplate): ApplyResult {
  try {
    parse(original);
  } catch (e) {
    if (e instanceof SflParseError) return { ok: false, reason: `Fix the syntax error on line ${e.line} first.` };
    throw e;
  }

  let source = original;
  let branches = 0;
  if (template.styles.yes && template.styles.no) {
    const result = addBranchNodes(original);
    source = result.text;
    branches = result.added;
  }

  let doc;
  try {
    doc = parse(source);
  } catch {
    return { ok: false, reason: 'Adding the yes/no branch nodes produced invalid SFL, so nothing was changed. Please report this file.' };
  }

  const at = offsetMapper(source);
  const blocks = walk(doc.blocks).map((b) => b.block);
  const styles = new Map(blocks.filter((b) => b.kind === 'Style').map((b) => [b.name, b]));
  const styleNames = new Set(styles.keys());
  // An explicit `kind: start` says where flows start; only guess without one.
  const explicitStart = blocks.some((b) => isShape(b) && kindOf(b) === 'start');
  const accentNames = explicitStart ? new Set<string>() : startNodes(blocks);

  const edits: Edit[] = [];
  let restyled = 0;

  for (const block of blocks) {
    const role = roleOf(block, accentNames, template);
    if (!role) continue;
    const reference = setStyleReference(block, roleStyleName(role), styleNames, at);
    if (!reference) continue;
    edits.push(reference);
    const local = localProperties(block);
    const roleStyle = template.styles[role] ?? {};
    const keys = Object.keys(roleStyle).filter((k) => !KEPT_LOCAL_PROPERTIES.has(k));
    for (const property of local) {
      if (keys.includes(property.key) && property.keyRange) edits.push(propertyRemoval(source, at(property.keyRange.start)));
    }
    const carried = role === 'node' || role === 'accent' ? inheritedShape(block, styles) : undefined;
    if (carried && carried !== roleStyle.shape && !local.some((p) => p.key === 'shape')) {
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
  return { ok: true, text, restyled, branches };
}

/** The template whose canvas color the document carries, if any. */
export function detectTemplateId(source: string, templates: readonly StyleTemplate[]): string | undefined {
  const match = /\bStyle\s+tpl_canvas\b[^{]*\{[^}]*\bfill\s*:\s*"([^"]+)"/.exec(source);
  if (!match) return undefined;
  return templates.find((t) => t.styles.canvas.fill === `"${match[1]}"`)?.id;
}

function roleOf(block: SflBlock, accentNames: Set<string>, template: StyleTemplate): TemplateRole | undefined {
  switch (block.kind) {
    case 'Shape':
    case 'Entity': {
      const kind = kindOf(block);
      if (kind === 'start') return 'accent';
      if ((kind === 'decision' || kind === 'input' || kind === 'yes' || kind === 'no') && template.styles[kind]) return kind;
      return accentNames.has(block.name) ? 'accent' : 'node';
    }
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
  const firstLine = /^[ \t]*\r?\n([ \t]*)\S/.exec(source.slice(brace + 1));
  if (!firstLine) return { start: brace + 1, end: brace + 1, text: ` shape: ${shape};` };
  return { start: brace + 1, end: brace + 1, text: `${eolOf(source)}${firstLine[1]}shape: ${shape}` };
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
  const eol = eolOf(source);
  const styleText = (Object.keys(template.styles) as TemplateRole[])
    .map((role) => {
      const body = Object.entries(template.styles[role] ?? {}).map(([key, value]) => `${key}: ${value}`).join('; ');
      return `Style ${roleStyleName(role)} { ${body} }`;
    })
    .join(eol);

  const previous = all.filter((b) => b.kind === 'Style' && b.name.startsWith(TEMPLATE_PREFIX) && b.range);
  if (previous.length > 0) {
    const [first, ...rest] = previous.map((b) => expandToLine(source, at(b.range!.start), at(b.range!.end)));
    return [{ start: first.start, end: first.end, text: styleText + eol }, ...rest.map((r) => ({ ...r, text: '' }))];
  }

  const anchor = topLevel.find((b) => b.kind !== 'Style' && b.kind !== 'Layout' && b.range);
  if (anchor) {
    const start = at(anchor.range!.start);
    return [{ start, end: start, text: `${styleText}${eol}${eol}` }];
  }
  const end = source.length;
  return [{ start: end, end, text: `${source.endsWith('\n') ? '' : eol}${eol}${styleText}${eol}` }];
}

/** `style { }` sub-blocks the removals emptied out. */
function removeEmptyStyleBlocks(text: string): string {
  return text
    .replace(/^[ \t]*style[ \t]*\{\s*\}[ \t]*;?[ \t]*\r?\n/gm, '')
    .replace(/;?[ \t]*\bstyle[ \t]*\{[ \t]*\}/g, '');
}
