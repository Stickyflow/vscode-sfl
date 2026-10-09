// Applies a style template to SFL text. Pure: text in, text out, no VS Code.
//
// What changes:
//  - Every Style whose name starts with `tpl_` is removed, and the template's
//    Style blocks are inserted in place of the first one (or, the first time,
//    before the first top-level block that isn't a Style or Layout).
//  - Each styleable block points at its role's Style instead of its own (a
//    block can reference only one Style). A block with its own Style gets a
//    derived one that remembers it (`tpl_node__ClientN`, see
//    derivedStyleName), so removing the template restores it. Layout
//    references stay. A shape
//    whose `kind:` is one of KIND_ROLES (decision, input, output, end, note,
//    yes, no) gets that role when the template has one; `kind: start`,
//    `kind: highlight`, or a shape a flow starts from, gets the accent.
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
import { derivedStyleName, KIND_ROLES, ownStyleOf, roleStyleName, TEMPLATE_PREFIX, type StyleTemplate, type TemplateRole } from './styleTemplates';

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
  // An explicit `kind: start` says where flows start; only guess without one.
  const explicitStart = blocks.some((b) => isShape(b) && kindOf(b) === 'start');
  const accentNames = explicitStart ? new Set<string>() : startNodes(blocks);

  const edits: Edit[] = [];
  // Derived Style name -> role, see derivedStyleName.
  const derived = new Map<string, TemplateRole>();
  let restyled = 0;

  for (const block of blocks) {
    const role = roleOf(block, accentNames, template);
    if (!role) continue;
    const own = ownStyle(block, styles);
    const styleName = own ? derivedStyleName(role, own) : roleStyleName(role);
    const reference = setStyleReference(block, styleName, styles, at);
    if (!reference) continue;
    if (own) derived.set(styleName, role);
    edits.push(reference);
    const local = localProperties(block);
    const roleStyle = template.styles[role] ?? {};
    const keys = Object.keys(roleStyle).filter((k) => !KEPT_LOCAL_PROPERTIES.has(k));
    for (const property of local) {
      if (keys.includes(property.key) && property.keyRange) edits.push(propertyRemoval(source, at(property.keyRange.start)));
    }
    const carried = (role === 'node' || role === 'accent') && own ? inheritedShape(own, styles) : undefined;
    if (carried && carried !== roleStyle.shape && !local.some((p) => p.key === 'shape')) {
      const insert = shapeInsertion(source, block, carried, at);
      if (insert) edits.push(insert);
    }
    restyled++;
  }

  edits.push(...templateStyleEdits(source, doc.blocks, blocks, template, derived, at));

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
      if (kind === 'start' || kind === 'highlight') return 'accent';
      if (isKindRole(kind) && template.styles[kind]) return kind;
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

function isKindRole(kind: string | undefined): kind is (typeof KIND_ROLES)[number] {
  return (KIND_ROLES as readonly string[]).includes(kind ?? '');
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

/** The block's own (non-template) Style: referenced directly, or remembered
 *  by the derived template Style it points at from an earlier application. */
function ownStyle(block: SflBlock, styles: Map<string, SflBlock>): string | undefined {
  const refs = block.composition.filter((ref) => styles.has(ref));
  const own = refs.find((ref) => !ref.startsWith(TEMPLATE_PREFIX)) ?? refs.map(ownStyleOf).find((name) => name !== undefined);
  return own && styles.has(own) && !own.startsWith(TEMPLATE_PREFIX) ? own : undefined;
}

/** Makes `styleName` the block's only Style reference, in front of its Layout
 *  references (which stay). */
function setStyleReference(
  block: SflBlock,
  styleName: string,
  styles: Map<string, SflBlock>,
  at: (pos: SflRange['start']) => number,
): Edit | undefined {
  const ranges = block.compositionRanges ?? [];
  const first = ranges[0];
  const last = ranges[block.composition.length - 1];
  if (block.composition.length > 0 && first && last) {
    const others = block.composition.filter((ref) => !styles.has(ref));
    return { start: at(first.start), end: at(last.end), text: [styleName, ...others].join(' & ') };
  }
  if (!block.nameRange) return undefined;
  const end = at(block.nameRange.end);
  return { start: end, end, text: ` : ${styleName}` };
}

/** The `shape` a block gets from its own Style chain. */
function inheritedShape(own: string, styles: Map<string, SflBlock>): string | undefined {
  let name: string | undefined = own;
  const seen = new Set<string>();
  while (name && !name.startsWith(TEMPLATE_PREFIX) && !seen.has(name)) {
    seen.add(name);
    const style: SflBlock = styles.get(name)!;
    const shape = localProperties(style).find((p) => p.key === 'shape');
    if (shape) return shape.value.type === 'ident' ? shape.value.segments.join('.') : undefined;
    name = style.composition.find((ref: string) => styles.has(ref));
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
  derived: Map<string, TemplateRole>,
  at: (pos: SflRange['start']) => number,
): Edit[] {
  const eol = eolOf(source);
  const roleStyles = (Object.keys(template.styles) as TemplateRole[]).map((role) => {
    const body = Object.entries(template.styles[role] ?? {}).map(([key, value]) => `${key}: ${value}`).join('; ');
    return `Style ${roleStyleName(role)} { ${body} }`;
  });
  const derivedStyles = [...derived.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, role]) => `Style ${name} : ${roleStyleName(role)} { }`);
  const styleText = [...roleStyles, ...derivedStyles].join(eol);

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

/** `style { }` sub-blocks the removals emptied out. One on its own between
 *  two blank lines takes one of them along, so no double gap is left. */
function removeEmptyStyleBlocks(text: string): string {
  return text
    .replace(/(\n[ \t]*\r?\n)[ \t]*style[ \t]*\{\s*\}[ \t]*;?[ \t]*\r?\n[ \t]*\r?\n/g, '$1')
    .replace(/^[ \t]*style[ \t]*\{\s*\}[ \t]*;?[ \t]*\r?\n/gm, '')
    .replace(/;?[ \t]*\bstyle[ \t]*\{[ \t]*\}/g, '');
}
