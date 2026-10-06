// The style templates "SFL: Apply Style Template" offers. A template is a set
// of SFL Style blocks, one per role (see applyStyleTemplate.ts for which
// blocks get which role). Values are written into the document verbatim, so
// they are SFL value syntax: strings quoted, idents and numbers bare.
//
// `tpl_canvas` is not referenced by any block. It carries the canvas color
// for hosts that can paint a background (the preview reads it); renderers
// that don't know the convention just ignore an unused Style.

/** Roles every template defines. */
type CoreRole = 'canvas' | 'node' | 'accent' | 'frame' | 'table' | 'flow' | 'iso';
/** Roles picked by a shape's `kind:`. A template without one styles those
 *  shapes as `node`. `yes` / `no` are the small branch nodes right after a
 *  decision; every built-in template has them (yes filled in the accent
 *  color, no outlined), so applying any template creates them. Every
 *  built-in template also has `end` (the accent inverted, so start and end
 *  read as a pair) and `note` (muted and dashed, so an annotation doesn't
 *  look like a step of the flow). */
export const KIND_ROLES = ['decision', 'input', 'output', 'end', 'note', 'yes', 'no'] as const;
type KindRole = (typeof KIND_ROLES)[number];
export type TemplateRole = CoreRole | KindRole;

export interface StyleTemplate {
  id: string;
  label: string;
  description: string;
  styles: Record<CoreRole, Record<string, string>> & Partial<Record<KindRole, Record<string, string>>>;
}

/** Style block name for each role. Re-applying a template replaces every
 *  Style whose name starts with TEMPLATE_PREFIX. */
export const TEMPLATE_PREFIX = 'tpl_';
export const roleStyleName = (role: TemplateRole): string => `${TEMPLATE_PREFIX}${role}`;

/** A block may reference only one Style, so a block with its own Style
 *  (`: ClientN`) gets a derived one instead of the bare role Style:
 *  `Style tpl_node__ClientN : tpl_node { }`. It looks exactly like
 *  `tpl_node`, and its name remembers `ClientN` so removing the template
 *  can restore it. */
export const derivedStyleName = (role: TemplateRole, own: string): string => `${roleStyleName(role)}__${own}`;

/** The block's own Style a derived template Style name remembers, if any. */
export function ownStyleOf(styleName: string): string | undefined {
  return /^tpl_[a-z]+__(.+)$/.exec(styleName)?.[1];
}

const INTER = `"'Inter', sans-serif"`;
const MONO = `"ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace"`;

export const STYLE_TEMPLATES: readonly StyleTemplate[] = [
  {
    id: 'night-lime',
    label: 'Night Lime',
    description: 'Black canvas, dark pills, lime start node and curved lime connectors',
    styles: {
      canvas: { fill: '"#050505"' },
      node: { shape: 'pill', fill: '"#0e0e0e"', stroke: '"#343434"', strokeWidth: '1', textColor: '"#b8b8b8"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#dcf05a"', stroke: '"#dcf05a"', strokeWidth: '1', textColor: '"#0a0a0a"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      frame: { fill: '"#0a0a0a"', stroke: '"#2a2a2a"', strokeWidth: '1', textColor: '"#e8e8e8"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#0e0e0e"', stroke: '"#343434"', textColor: '"#d0d0d0"', headerFill: '"#1a1a1a"', gridColor: '"#2a2a2a"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#c9dc4e"', strokeWidth: '1.5', markerStart: 'none', markerEnd: 'filled_circle' },
      yes: { shape: 'oval', fill: '"#dcf05a"', stroke: '"#dcf05a"', strokeWidth: '1', textColor: '"#0a0a0a"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#0e0e0e"', stroke: '"#8a8a8a"', strokeWidth: '1', textColor: '"#d0d0d0"', fontFamily: INTER, fontSize: '11' },
      end: { shape: 'pill', fill: '"#0e0e0e"', stroke: '"#dcf05a"', strokeWidth: '1.5', textColor: '"#dcf05a"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#0a0a0a"', stroke: '"#4a4a4a"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#8a8a8a"', fontFamily: INTER, fontSize: '11' },
      iso: { fill: '"#c9dc4e"' },
    },
  },
  {
    id: 'midnight-violet',
    label: 'Midnight Violet',
    description: 'Near-black canvas, dark pills, violet start node, thin grey tree connectors',
    styles: {
      canvas: { fill: '"#09080f"' },
      node: { shape: 'pill', fill: '"#16151f"', stroke: '"#2c2a3d"', strokeWidth: '1', textColor: '"#dcdaea"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'oval', fill: '"#9a8cff"', stroke: '"#9a8cff"', strokeWidth: '1', textColor: '"#0d0b18"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      frame: { fill: '"#0e0d16"', stroke: '"#2c2a3d"', strokeWidth: '1', textColor: '"#dcdaea"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#16151f"', stroke: '"#2c2a3d"', textColor: '"#dcdaea"', headerFill: '"#211f30"', gridColor: '"#2c2a3d"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#77748c"', strokeWidth: '1', markerStart: 'none', markerEnd: 'arrow' },
      yes: { shape: 'oval', fill: '"#9a8cff"', stroke: '"#9a8cff"', strokeWidth: '1', textColor: '"#0d0b18"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#16151f"', stroke: '"#77748c"', strokeWidth: '1', textColor: '"#dcdaea"', fontFamily: INTER, fontSize: '11' },
      end: { shape: 'oval', fill: '"#16151f"', stroke: '"#9a8cff"', strokeWidth: '1.5', textColor: '"#9a8cff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#0e0d16"', stroke: '"#4a4760"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#8f8ca3"', fontFamily: INTER, fontSize: '11' },
      iso: { fill: '"#9a8cff"' },
    },
  },
  {
    id: 'graphite-mono',
    label: 'Graphite Mono',
    description: 'Graphite canvas, outlined white pills, thin white lines with dot ends',
    styles: {
      canvas: { fill: '"#1d1d1d"' },
      node: { shape: 'pill', fill: '"#1d1d1d"', stroke: '"#cfcfcf"', strokeWidth: '1', textColor: '"#e4e4e4"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#1d1d1d"', stroke: '"#ffffff"', strokeWidth: '2', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      frame: { fill: '"#202020"', stroke: '"#4a4a4a"', strokeWidth: '1', textColor: '"#e4e4e4"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#1d1d1d"', stroke: '"#cfcfcf"', textColor: '"#e4e4e4"', headerFill: '"#2a2a2a"', gridColor: '"#4a4a4a"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#cfcfcf"', strokeWidth: '1', markerStart: 'filled_circle', markerEnd: 'filled_circle' },
      yes: { shape: 'oval', fill: '"#ffffff"', stroke: '"#ffffff"', strokeWidth: '1', textColor: '"#1d1d1d"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#1d1d1d"', stroke: '"#cfcfcf"', strokeWidth: '1', textColor: '"#e4e4e4"', fontFamily: INTER, fontSize: '11' },
      end: { shape: 'pill', fill: '"#ffffff"', stroke: '"#ffffff"', strokeWidth: '2', textColor: '"#1d1d1d"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#1d1d1d"', stroke: '"#6a6a6a"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#9a9a9a"', fontFamily: INTER, fontSize: '11' },
      iso: { fill: '"#9a9a9a"' },
    },
  },
  {
    id: 'paper-navy',
    label: 'Paper Navy',
    description: 'Cream paper, navy outlined boxes, solid navy start node, thin navy lines',
    styles: {
      canvas: { fill: '"#f7f2e3"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '6', fill: '"#fbf8ee"', stroke: '"#2a3990"', strokeWidth: '1.5', textColor: '"#2a3990"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      accent: { shape: 'rounded_rectangle', cornerRadius: '6', fill: '"#2a3990"', stroke: '"#2a3990"', strokeWidth: '1.5', textColor: '"#fbf8ee"', fontFamily: INTER, fontSize: '13', fontWeight: 'bold' },
      frame: { fill: '"#f7f2e3"', stroke: '"#2a3990"', strokeWidth: '1.5', textColor: '"#fbf8ee"', cornerRadius: '10', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#fbf8ee"', stroke: '"#2a3990"', textColor: '"#2a3990"', headerFill: '"#e9e3cf"', gridColor: '"#2a3990"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#2a3990"', strokeWidth: '1.5', markerStart: 'none', markerEnd: 'none' },
      yes: { shape: 'oval', fill: '"#2a3990"', stroke: '"#2a3990"', strokeWidth: '1', textColor: '"#fbf8ee"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#fbf8ee"', stroke: '"#2a3990"', strokeWidth: '1', textColor: '"#2a3990"', fontFamily: INTER, fontSize: '11' },
      end: { shape: 'rounded_rectangle', cornerRadius: '6', fill: '"#fbf8ee"', stroke: '"#2a3990"', strokeWidth: '3', textColor: '"#2a3990"', fontFamily: INTER, fontSize: '13', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '2', fill: '"#f1ead2"', stroke: '"#8a90b8"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#4a5390"', fontFamily: INTER, fontSize: '11' },
      iso: { fill: '"#2a3990"' },
    },
  },
  {
    id: 'charcoal-pastel',
    label: 'Charcoal Pastel',
    description: 'Charcoal canvas, outlined pills colored by kind: yellow start, sage decision, lavender screen, white input, blue output',
    styles: {
      canvas: { fill: '"#1e1e1e"' },
      node: { shape: 'pill', fill: '"#1e1e1e"', stroke: '"#cdb6ee"', strokeWidth: '1.5', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#1e1e1e"', stroke: '"#f1e47c"', strokeWidth: '1.5', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '12' },
      decision: { shape: 'pill', fill: '"#1e1e1e"', stroke: '"#c9cdb8"', strokeWidth: '1.5', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '12' },
      input: { shape: 'pill', fill: '"#1e1e1e"', stroke: '"#ffffff"', strokeWidth: '1.5', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '12' },
      output: { shape: 'pill', fill: '"#1e1e1e"', stroke: '"#9fd3e6"', strokeWidth: '1.5', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#f1e47c"', stroke: '"#f1e47c"', strokeWidth: '1.5', textColor: '"#1e1e1e"', fontFamily: INTER, fontSize: '12' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#262626"', stroke: '"#5a5a5a"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#b0b0b0"', fontFamily: INTER, fontSize: '11' },
      yes: { shape: 'oval', fill: '"#b5ec7c"', stroke: '"#b5ec7c"', strokeWidth: '1', textColor: '"#1e1e1e"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#f0897a"', stroke: '"#f0897a"', strokeWidth: '1', textColor: '"#1e1e1e"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#232323"', stroke: '"#3a3a3a"', strokeWidth: '1', textColor: '"#f2f2f2"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#1e1e1e"', stroke: '"#cdb6ee"', textColor: '"#f2f2f2"', headerFill: '"#2a2630"', gridColor: '"#3a3a3a"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#cdb6ee"', strokeWidth: '1.5', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#cdb6ee"' },
    },
  },
  {
    id: 'evergreen-ledger',
    label: 'Evergreen Ledger',
    description: 'Warm paper canvas, white hairline cards, deep green start card, lime highlights, faint straight lines',
    styles: {
      canvas: { fill: '"#f6f5f2"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#ffffff"', stroke: '"#e6e6e1"', strokeWidth: '1', textColor: '"#0d2b24"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      accent: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#0d2b24"', stroke: '"#0d2b24"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '13', fontWeight: 'bold' },
      decision: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#ffffff"', stroke: '"#0d2b24"', strokeWidth: '1', textColor: '"#0d2b24"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      end: { shape: 'pill', fill: '"#0d2b24"', stroke: '"#0d2b24"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#fbfbf9"', stroke: '"#e6e6e1"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#7a857f"', fontFamily: MONO, fontSize: '10' },
      yes: { shape: 'oval', fill: '"#d9f58f"', stroke: '"#d9f58f"', strokeWidth: '1', textColor: '"#0d2b24"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      no: { shape: 'oval', fill: '"#ffffff"', stroke: '"#0d2b24"', strokeWidth: '1', textColor: '"#0d2b24"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#fdfdfb"', stroke: '"#e6e6e1"', strokeWidth: '1', textColor: '"#0d2b24"', cornerRadius: '16', shadow: 'false', fontFamily: MONO },
      table: { fill: '"#ffffff"', stroke: '"#e6e6e1"', textColor: '"#0d2b24"', headerFill: '"#eef6d6"', gridColor: '"#ecece7"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#cfd3cf"', strokeWidth: '1', markerStart: 'none', markerEnd: 'none' },
      iso: { fill: '"#0d2b24"' },
    },
  },
];
