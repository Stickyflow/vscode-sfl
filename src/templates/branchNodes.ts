// Turns a decision's labelled links into small yes/no branch nodes, the way
// user-flow diagrams draw them:
//
//   Link l2 { from: nuevo; to: sesion; text: "No" }
//
// becomes
//
//   Shape nuevo_no { kind: no; shape: oval; text: "No"; layout { ... } }
//   Link l2 { from: nuevo; to: nuevo_no, left }
//   Link l2_b { from: nuevo_no, right; to: sesion }
//
// Only links leaving a `kind: decision` shape whose label is a yes or no word
// are split, and only when the decision and the target sit in the same block,
// so the circle can be placed in the same coordinates. The link itself may
// live elsewhere (e.g. at Model level while the shapes sit in a Container);
// the circle then goes into the shapes' block, right after the decision. The
// circle lands in the gap between the two, lined up with the target. Applying a
// template runs this first; the restyle that follows styles the new blocks
// like any other (`kind: yes` / `kind: no` pick the template's branch styles).

import { parse, type SflBlock, type SflProperty, type SflValue } from '../server/sfl-core';
import { applyEdits, eolOf, indentAt, isShape, kindOf, offsetMapper, propertyRemoval, propertyValue, walk, type Edit } from './sflText';

const YES_WORDS = new Set(['yes', 'y', 'si', 'sí', 'ja', 'oui', 'sim', 'ok', 'true']);
const NO_WORDS = new Set(['no', 'n', 'nein', 'non', 'não', 'nao', 'false']);
const SIZE = 28;

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function addBranchNodes(source: string): { text: string; added: number } {
  const doc = parse(source);
  const at = offsetMapper(source);
  const eol = eolOf(source);
  const all = walk(doc.blocks);
  const taken = new Set(all.map((b) => b.block.name));
  const byName = new Map(all.map((entry) => [entry.block.name, entry]));
  const edits: Edit[] = [];
  let added = 0;

  for (const { block: link, parent } of all) {
    if (link.kind !== 'Link' || !link.range) continue;
    const label = property(link, 'text');
    const answer = label?.value.type === 'string' ? classify(label.value.value) : undefined;
    const from = endpointName(property(link, 'from')?.value);
    const toProperty = property(link, 'to');
    const to = endpointName(toProperty?.value);
    if (!label || !answer || !from || !to || !toProperty?.keyRange || !label.keyRange) continue;

    // Prefer the link's siblings (the common case), then fall back to the
    // whole document; either way the two shapes must share a parent.
    const siblings = new Map(childBlocks(parent, doc.blocks).map((b) => [b.name, { block: b, parent }]));
    const found = siblings.has(from) && siblings.has(to) ? siblings : byName;
    const decisionEntry = found.get(from);
    const targetEntry = found.get(to);
    if (!decisionEntry || !targetEntry || decisionEntry.parent !== targetEntry.parent) continue;
    const decision = decisionEntry.block;
    const target = targetEntry.block;
    if (!isShape(decision) || kindOf(decision) !== 'decision' || !decision.range) continue;
    const a = boxOf(decision);
    const b = boxOf(target);
    if (!a || !b) continue;

    const { box, inSide, outSide } = place(a, b);
    const name = unique(`${decision.name}_${answer}`, taken);
    const linkStart = at(link.range.start);
    const indent = indentAt(source, linkStart);
    const text = JSON.stringify((label.value as { value: string }).value);
    const toValue = propertyValue(source, at(toProperty.keyRange.start));
    const originalTo = source.slice(toValue.start, toValue.end);
    const secondLink = unique(`${link.name}_b`, taken);

    if (decisionEntry.parent === parent) {
      // Same block as the link: the circle goes on the line above it.
      const lineStart = source.lastIndexOf('\n', linkStart - 1) + 1;
      edits.push({ start: lineStart, end: lineStart, text: `${indent}${circle(name, answer, text, box)}${eol}` });
    } else {
      // The link lives elsewhere: the circle joins the decision's block so
      // its position is in the same coordinates as the decision's.
      const decisionEnd = at(decision.range.end);
      const shapeIndent = indentAt(source, at(decision.range.start));
      edits.push({ start: decisionEnd, end: decisionEnd, text: `${eol}${shapeIndent}${circle(name, answer, text, box)}` });
    }
    edits.push({ start: toValue.start, end: toValue.end, text: `${name}, ${inSide}` });
    edits.push(propertyRemoval(source, at(label.keyRange.start)));
    const linkEnd = at(link.range.end);
    edits.push({ start: linkEnd, end: linkEnd, text: `${eol}${indent}Link ${secondLink} { from: ${name}, ${outSide}; to: ${originalTo} }` });
    added++;
  }

  return { text: applyEdits(source, edits), added };
}

function circle(name: string, answer: 'yes' | 'no', text: string, box: { x: number; y: number }): string {
  return `Shape ${name} { kind: ${answer}; shape: oval; text: ${text}; layout { position: ${box.x}, ${box.y}; size: ${SIZE}, ${SIZE} } }`;
}

function classify(label: string): 'yes' | 'no' | undefined {
  const word = label.trim().toLowerCase().replace(/[.!?¡¿]/g, '');
  if (YES_WORDS.has(word)) return 'yes';
  if (NO_WORDS.has(word)) return 'no';
  return undefined;
}

function property(block: SflBlock, key: string): SflProperty | undefined {
  for (const entry of block.entries) if (entry.type === 'property' && entry.property.key === key) return entry.property;
  return undefined;
}

/** A single-segment endpoint's block name; dot paths into other blocks are skipped. */
function endpointName(value: SflValue | undefined): string | undefined {
  if (!value || (value.type !== 'endpoint' && value.type !== 'ident') || value.segments.length !== 1) return undefined;
  return value.segments[0];
}

function childBlocks(parent: SflBlock | undefined, topLevel: SflBlock[]): SflBlock[] {
  if (!parent) return topLevel;
  return parent.entries.flatMap((e) => (e.type === 'block' ? [e.block] : []));
}

function boxOf(block: SflBlock): Box | undefined {
  let position: number[] | undefined;
  let size: number[] | undefined;
  for (const entry of block.entries) {
    if (entry.type !== 'layout') continue;
    for (const p of entry.layout.properties) {
      if (p.value.type !== 'tuple') continue;
      if (p.key === 'position') position = p.value.values;
      else if (p.key === 'size') size = p.value.values;
    }
  }
  if (!position || !size) return undefined;
  return { x: position[0], y: position[1], w: size[0], h: size[1] };
}

/** The circle sits halfway across the gap from the decision to the target,
 *  on the target's center line. */
function place(from: Box, to: Box): { box: { x: number; y: number }; inSide: Side; outSide: Side } {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  let cx: number;
  let cy: number;
  let inSide: Side;
  let outSide: Side;
  if (Math.abs(dx) >= Math.abs(dy)) {
    cx = dx >= 0 ? (from.x + from.w + to.x) / 2 : (to.x + to.w + from.x) / 2;
    cy = to.y + to.h / 2;
    [inSide, outSide] = dx >= 0 ? ['left', 'right'] : ['right', 'left'];
  } else {
    cx = to.x + to.w / 2;
    cy = dy >= 0 ? (from.y + from.h + to.y) / 2 : (to.y + to.h + from.y) / 2;
    [inSide, outSide] = dy >= 0 ? ['top', 'bottom'] : ['bottom', 'top'];
  }
  return { box: { x: Math.round(cx - SIZE / 2), y: Math.round(cy - SIZE / 2) }, inSide, outSide };
}

function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  taken.add(name);
  return name;
}
