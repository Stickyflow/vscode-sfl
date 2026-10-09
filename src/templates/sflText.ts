// Small, offset-based text edits on SFL source, shared by the template
// transforms. Everything works on the raw text plus sfl-core's ranges, so
// comments and formatting outside an edit stay byte for byte.

import type { SflBlock, SflRange } from '../server/sfl-core';

export interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Maps sfl-core positions (0-based line + character) to string offsets. */
export function offsetMapper(source: string): (pos: SflRange['start']) => number {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return (pos) => offsets[pos.line] + pos.character;
}

export const eolOf = (source: string): string => (source.includes('\r\n') ? '\r\n' : '\n');

export const isShape = (block: SflBlock): boolean => block.kind === 'Shape' || block.kind === 'Entity';

export function kindOf(block: SflBlock): string | undefined {
  for (const entry of block.entries) {
    if (entry.type === 'property' && entry.property.key === 'kind' && entry.property.value.type === 'ident') {
      return entry.property.value.segments.join('.');
    }
  }
  return undefined;
}

/** Every block, depth first, with its parent block (undefined at top level). */
export function walk(blocks: SflBlock[], parent?: SflBlock): Array<{ block: SflBlock; parent?: SflBlock }> {
  const out: Array<{ block: SflBlock; parent?: SflBlock }> = [];
  for (const block of blocks) {
    out.push({ block, parent });
    for (const entry of block.entries) if (entry.type === 'block') out.push(...walk([entry.block], block));
  }
  return out;
}

/** Where a property's value ends: the `;`, line break or `}` after it, at
 *  bracket depth 0 and outside strings. */
export function propertyEnd(source: string, keyStart: number): number {
  let depth = 0;
  for (let i = keyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      i = skipString(source, i);
      continue;
    }
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (depth === 0 && (ch === ';' || ch === '\n' || ch === '}')) return i;
  }
  return source.length;
}

/** The value text of the property whose key starts at `keyStart`, as offsets. */
export function propertyValue(source: string, keyStart: number): { start: number; end: number } {
  let start = source.indexOf(':', keyStart) + 1;
  while (source[start] === ' ' || source[start] === '\t') start++;
  let end = propertyEnd(source, keyStart);
  while (end > start && /\s/.test(source[end - 1])) end--;
  return { start, end };
}

/** The text of one `key: value` property, plus the separator that goes with it. */
export function propertyRemoval(source: string, keyStart: number): Edit {
  const i = propertyEnd(source, keyStart);
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
  return { ...expandToLine(source, start, end), text: '' };
}

/** Widens [start, end) to whole lines when only whitespace surrounds it. */
export function expandToLine(source: string, start: number, end: number): { start: number; end: number } {
  let lineStart = start;
  while (lineStart > 0 && (source[lineStart - 1] === ' ' || source[lineStart - 1] === '\t')) lineStart--;
  if (lineStart > 0 && source[lineStart - 1] !== '\n') return { start, end };
  let lineEnd = end;
  while (lineEnd < source.length && (source[lineEnd] === ' ' || source[lineEnd] === '\t' || source[lineEnd] === '\r')) lineEnd++;
  if (lineEnd < source.length && source[lineEnd] !== '\n') return { start, end };
  return { start: lineStart, end: Math.min(lineEnd + 1, source.length) };
}

/** The leading whitespace of the line `offset` is on. */
export function indentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))![0];
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

/** Merges overlapping deletions (two removals on one line). */
export function mergeOverlaps(edits: Edit[]): Edit[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Edit[] = [];
  for (const edit of sorted) {
    const last = merged[merged.length - 1];
    if (last && edit.start < last.end && last.text === '' && edit.text === '') {
      last.end = Math.max(last.end, edit.end);
    } else {
      merged.push({ ...edit });
    }
  }
  return merged;
}

export function applyEdits(source: string, edits: Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}
