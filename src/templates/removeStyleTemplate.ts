// Removes a style template from SFL text. Pure: text in, text out, no VS Code.
//
// Every Style whose name starts with `tpl_` is deleted, and so is every
// reference to one. A block pointing at a derived template Style
// (`tpl_node__ClientN`) gets its own Style back; the others fall back to the
// renderer's defaults (and the preview to the VS Code theme). Files from
// before derived Styles (`: ClientN & tpl_node`) just lose the template
// reference. What applying a template changed for good
// stays: the local properties it removed, a shape it moved onto a block, and
// the yes/no branch nodes it added. The result is parsed again before it's
// returned, so a bad patch never reaches the document.

import { parse, SflParseError, type SflRange } from '../server/sfl-core';
import { applyEdits, expandToLine, mergeOverlaps, offsetMapper, walk, type Edit } from './sflText';
import { ownStyleOf, TEMPLATE_PREFIX } from './styleTemplates';

export type RemoveResult =
  | { ok: true; text: string; unstyled: number }
  | { ok: false; reason: string };

export function removeStyleTemplate(original: string): RemoveResult {
  let doc;
  try {
    doc = parse(original);
  } catch (e) {
    if (e instanceof SflParseError) return { ok: false, reason: `Fix the syntax error on line ${e.line} first.` };
    throw e;
  }

  const at = offsetMapper(original);
  const blocks = walk(doc.blocks).map((b) => b.block);
  const templateStyles = blocks.filter((b) => b.kind === 'Style' && b.name.startsWith(TEMPLATE_PREFIX) && b.range);
  const names = new Set(templateStyles.map((b) => b.name));

  const ownStyles = new Set(blocks.filter((b) => b.kind === 'Style' && !names.has(b.name)).map((b) => b.name));
  // A derived template Style (`tpl_node__ClientN`) gives the block its own back.
  const restored = (ref: string): string[] => {
    if (!names.has(ref)) return [ref];
    const own = ownStyleOf(ref);
    return own && ownStyles.has(own) ? [own] : [];
  };

  const edits: Edit[] = [];
  let unstyled = 0;
  for (const block of blocks) {
    const ranges = block.compositionRanges ?? [];
    if (!block.composition.some((ref, i) => names.has(ref) && ranges[i])) continue;
    const kept = [...new Set(block.composition.flatMap(restored))];
    const first = ranges[0];
    const last = ranges[block.composition.length - 1];
    if (!first || !last) continue;
    if (kept.length === 0) {
      // `Shape a : tpl_node {` -> `Shape a {`
      if (!block.nameRange) continue;
      edits.push({ start: at(block.nameRange.end), end: at(last.end), text: '' });
    } else {
      edits.push({ start: at(first.start), end: at(last.end), text: kept.join(' & ') });
    }
    unstyled++;
  }
  edits.push(...styleRemovals(original, templateStyles.map((b) => b.range!), at));

  const text = applyEdits(original, mergeOverlaps(edits));
  try {
    parse(text);
  } catch {
    return { ok: false, reason: 'Removing the template produced invalid SFL, so nothing was changed. Please report this file.' };
  }
  return { ok: true, text, unstyled };
}

/** Deletes the template's Style blocks as whole lines. A run of them that sat
 *  between two blank lines (where applying a template puts them) also takes
 *  one blank line with it, so no double gap is left behind. */
function styleRemovals(source: string, ranges: SflRange[], at: (pos: SflRange['start']) => number): Edit[] {
  const lines = ranges
    .map((r) => expandToLine(source, at(r.start), at(r.end)))
    .sort((a, b) => a.start - b.start);
  const runs: Array<{ start: number; end: number }> = [];
  for (const line of lines) {
    const run = runs[runs.length - 1];
    if (run && line.start <= run.end) run.end = Math.max(run.end, line.end);
    else runs.push({ ...line });
  }
  for (const run of runs) {
    const blankAfter = /^[ \t]*\r?\n/.exec(source.slice(run.end));
    const blankBefore = run.start === 0 || /\n[ \t]*\r?\n$/.test(source.slice(0, run.start));
    if (blankAfter && blankBefore) run.end += blankAfter[0].length;
  }
  return runs.map((run) => ({ ...run, text: '' }));
}
