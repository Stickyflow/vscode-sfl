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
  {
    id: 'neon-dispatch',
    label: 'Neon Dispatch',
    description: 'Black canvas, light grey cards, blue start card, dotted neon green connectors, magenta and orange by kind',
    styles: {
      canvas: { fill: '"#0b0b0c"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#e8e8e4"', stroke: '"#e8e8e4"', strokeWidth: '1', textColor: '"#2a2a2a"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      accent: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#1f6fe5"', stroke: '"#1f6fe5"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      decision: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#e8e8e4"', stroke: '"#1f6fe5"', strokeWidth: '2.5', textColor: '"#1f3f8f"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      input: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#e8e8e4"', stroke: '"#ff8a1f"', strokeWidth: '2.5', textColor: '"#2a2a2a"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      output: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#e8e8e4"', stroke: '"#a64bf4"', strokeWidth: '2.5', textColor: '"#2a2a2a"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      end: { shape: 'rounded_rectangle', cornerRadius: '4', fill: '"#e23be6"', stroke: '"#e23be6"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#f2f2f2"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      yes: { shape: 'oval', fill: '"#2ee86a"', stroke: '"#2ee86a"', strokeWidth: '1', textColor: '"#0b0b0c"', fontFamily: INTER, fontSize: '10', fontWeight: 'bold' },
      no: { shape: 'oval', fill: '"#e23be6"', stroke: '"#e23be6"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '10', fontWeight: 'bold' },
      frame: { fill: '"#111113"', stroke: '"#2a2a2e"', strokeWidth: '1', textColor: '"#e8e8e4"', cornerRadius: '8', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#e8e8e4"', stroke: '"#e8e8e4"', textColor: '"#2a2a2a"', headerFill: '"#cfcfca"', gridColor: '"#bdbdb8"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#2ee86a"', strokeWidth: '2', strokeStyle: 'dotted', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#1f6fe5"' },
    },
  },
  {
    id: 'calm-sage',
    label: 'Calm Sage',
    description: 'Ivory canvas, soft ivory cards, sage start pill, outlined decision pills, moss end, gentle curved lines',
    styles: {
      canvas: { fill: '"#f4efe8"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '12', fill: '"#faf7f2"', stroke: '"#e3dcd2"', strokeWidth: '1', textColor: '"#1f2a24"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#6b7f6e"', stroke: '"#6b7f6e"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      decision: { shape: 'pill', fill: '"#faf7f2"', stroke: '"#8f9a8f"', strokeWidth: '1', textColor: '"#1f2a24"', fontFamily: INTER, fontSize: '12' },
      input: { shape: 'pill', fill: '"#fbf9f5"', stroke: '"#e3dcd2"', strokeWidth: '1', textColor: '"#7a746c"', fontFamily: INTER, fontSize: '12' },
      output: { shape: 'rounded_rectangle', cornerRadius: '12', fill: '"#e6ece4"', stroke: '"#d9e1d9"', strokeWidth: '1', textColor: '"#1f2a24"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#a7b8a7"', stroke: '"#a7b8a7"', strokeWidth: '1', textColor: '"#1f2a24"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#7a746c"', fontFamily: INTER, fontSize: '10', letterSpacing: '2' },
      yes: { shape: 'oval', fill: '"#6b7f6e"', stroke: '"#6b7f6e"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#faf7f2"', stroke: '"#c9bdaf"', strokeWidth: '1', textColor: '"#1f2a24"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#f8f4ee"', stroke: '"#e6dfd5"', strokeWidth: '1', textColor: '"#5f5a53"', cornerRadius: '18', shadow: 'false', fontFamily: INTER, letterSpacing: '2' },
      table: { fill: '"#faf7f2"', stroke: '"#e3dcd2"', textColor: '"#1f2a24"', headerFill: '"#e6ece4"', gridColor: '"#e6dfd5"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#a7b8a7"', strokeWidth: '1.5', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#6b7f6e"' },
    },
  },
  {
    id: 'ember-noir',
    label: 'Ember Noir',
    description: 'Black canvas, white pills, orange highlighted path (start and kind: highlight), thin white connectors',
    styles: {
      canvas: { fill: '"#000000"' },
      node: { shape: 'pill', fill: '"#ffffff"', stroke: '"#ffffff"', strokeWidth: '1', textColor: '"#111111"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#ff6224"', stroke: '"#ff6224"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12' },
      decision: { shape: 'pill', fill: '"#000000"', stroke: '"#ff6224"', strokeWidth: '1.5', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#000000"', stroke: '"#ffffff"', strokeWidth: '1.5', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#e6e6e6"', fontFamily: INTER, fontSize: '16', textAlign: 'left' },
      yes: { shape: 'oval', fill: '"#ff6224"', stroke: '"#ff6224"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#000000"', stroke: '"#ffffff"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#0b0b0b"', stroke: '"#262626"', strokeWidth: '1', textColor: '"#ffffff"', cornerRadius: '20', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#ffffff"', stroke: '"#ffffff"', textColor: '"#111111"', headerFill: '"#ffe2d6"', gridColor: '"#e5e5e5"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#ffffff"', strokeWidth: '1', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#ff6224"' },
    },
  },
  {
    id: 'studio-light',
    label: 'Studio Light',
    description: 'Light grey canvas, white hairline pills, black start pill, grey decision pills, thin curved grey lines with dot ends',
    styles: {
      canvas: { fill: '"#f7f7f7"' },
      node: { shape: 'pill', fill: '"#ffffff"', stroke: '"#ebebeb"', strokeWidth: '1', textColor: '"#1a1a1a"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#0a0a0a"', stroke: '"#0a0a0a"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '13', fontWeight: 'bold' },
      decision: { shape: 'pill', fill: '"#e3e3e3"', stroke: '"#d6d6d6"', strokeWidth: '1', textColor: '"#1a1a1a"', fontFamily: INTER, fontSize: '13' },
      end: { shape: 'pill', fill: '"#ffffff"', stroke: '"#0a0a0a"', strokeWidth: '1.5', textColor: '"#0a0a0a"', fontFamily: INTER, fontSize: '13', fontWeight: 'bold' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#111111"', fontFamily: INTER, fontSize: '32', textAlign: 'left' },
      yes: { shape: 'oval', fill: '"#0a0a0a"', stroke: '"#0a0a0a"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#ffffff"', stroke: '"#bdbdbd"', strokeWidth: '1', textColor: '"#1a1a1a"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#fbfbfb"', stroke: '"#e6e6e6"', strokeWidth: '1', textColor: '"#1a1a1a"', cornerRadius: '20', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#ffffff"', stroke: '"#e6e6e6"', textColor: '"#1a1a1a"', headerFill: '"#efefef"', gridColor: '"#ebebeb"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#c4c4c4"', strokeWidth: '1', markerStart: 'filled_circle', markerEnd: 'filled_circle' },
      iso: { fill: '"#0a0a0a"' },
    },
  },
  {
    id: 'violet-circuit',
    label: 'Violet Circuit',
    description: 'Near-black canvas, dark rounded cards, violet start card, right-angled violet lines with dot ends',
    styles: {
      canvas: { fill: '"#14151b"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '8', fill: '"#1f2029"', stroke: '"#1f2029"', strokeWidth: '1', textColor: '"#e8e8f0"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'rounded_rectangle', cornerRadius: '8', fill: '"#7c2ae8"', stroke: '"#7c2ae8"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12' },
      decision: { shape: 'rounded_rectangle', cornerRadius: '8', fill: '"#1f2029"', stroke: '"#7c2ae8"', strokeWidth: '1.5', textColor: '"#e8e8f0"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'rounded_rectangle', cornerRadius: '8', fill: '"#14151b"', stroke: '"#7c2ae8"', strokeWidth: '1.5', textColor: '"#b794ff"', fontFamily: INTER, fontSize: '12' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#8b8b98"', fontFamily: INTER, fontSize: '12', textAlign: 'left' },
      yes: { shape: 'oval', fill: '"#7c2ae8"', stroke: '"#7c2ae8"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#1f2029"', stroke: '"#6b6b78"', strokeWidth: '1', textColor: '"#e8e8f0"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#181920"', stroke: '"#26272f"', strokeWidth: '1', textColor: '"#e8e8f0"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#1f2029"', stroke: '"#2a2b36"', textColor: '"#e8e8f0"', headerFill: '"#2b2240"', gridColor: '"#2a2b36"', fontFamily: INTER },
      flow: { route: 'orthogonal', stroke: '"#5b21b6"', strokeWidth: '1.5', markerStart: 'filled_circle', markerEnd: 'filled_circle' },
      iso: { fill: '"#7c2ae8"' },
    },
  },
  {
    id: 'deep-sea',
    label: 'Deep Sea',
    description: 'Dark teal canvas, boxless white labels, outlined cyan start pill, cyan decisions, thin curved cyan lines',
    styles: {
      canvas: { fill: '"#0f1b21"' },
      node: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold', textAlign: 'left' },
      accent: { shape: 'pill', fill: '"#0f1b21"', stroke: '"#4fd8e8"', strokeWidth: '1.5', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      decision: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#4fd8e8"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold', textAlign: 'left' },
      end: { shape: 'pill', fill: '"#0f1b21"', stroke: '"#4fd8e8"', strokeWidth: '1', textColor: '"#4fd8e8"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#8fa3ad"', fontFamily: INTER, fontSize: '12', textAlign: 'left' },
      yes: { shape: 'oval', fill: '"#4fd8e8"', stroke: '"#4fd8e8"', strokeWidth: '1', textColor: '"#0f1b21"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      no: { shape: 'oval', fill: '"#0f1b21"', stroke: '"#4fd8e8"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#13232a"', stroke: '"#1f3a44"', strokeWidth: '1', textColor: '"#ffffff"', cornerRadius: '12', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#13232a"', stroke: '"#2a4a55"', textColor: '"#ffffff"', headerFill: '"#18343d"', gridColor: '"#2a4a55"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#3fc9d9"', strokeWidth: '1.25', markerStart: 'none', markerEnd: 'none' },
      iso: { fill: '"#4fd8e8"' },
    },
  },
  {
    id: 'prism',
    label: 'Prism',
    description: 'Charcoal canvas, small outlined pills, a lime-outlined hub card, thin curved grey lines',
    styles: {
      canvas: { fill: '"#121212"' },
      node: { shape: 'pill', fill: '"#1a1a1a"', stroke: '"#4a4a4a"', strokeWidth: '1', textColor: '"#ececec"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'rounded_rectangle', cornerRadius: '14', fill: '"#1d1f1c"', stroke: '"#9be15d"', strokeWidth: '2', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '14', fontWeight: 'bold' },
      decision: { shape: 'pill', fill: '"#1a1a1a"', stroke: '"#f5a524"', strokeWidth: '1', textColor: '"#ececec"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#ececec"', stroke: '"#ececec"', strokeWidth: '1', textColor: '"#121212"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#8a8a8a"', fontFamily: INTER, fontSize: '12', textAlign: 'left' },
      yes: { shape: 'oval', fill: '"#9be15d"', stroke: '"#9be15d"', strokeWidth: '1', textColor: '"#121212"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#1a1a1a"', stroke: '"#ff5a5f"', strokeWidth: '1', textColor: '"#ececec"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#161616"', stroke: '"#2e2e2e"', strokeWidth: '1', textColor: '"#8a8a8a"', cornerRadius: '24', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#1a1a1a"', stroke: '"#3a3a3a"', textColor: '"#ececec"', headerFill: '"#232323"', gridColor: '"#2e2e2e"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#6b6b6b"', strokeWidth: '1.25', markerStart: 'none', markerEnd: 'none' },
      iso: { fill: '"#9be15d"' },
    },
  },
  {
    id: 'indigo-wire',
    label: 'Indigo Wire',
    description: 'Black canvas, sharp outlined indigo boxes, pink outputs, dimmed end, curved indigo lines with dot ends',
    styles: {
      canvas: { fill: '"#0a0a0a"' },
      node: { shape: 'rectangle', fill: '"#0a0a0a"', stroke: '"#5b5fd6"', strokeWidth: '1.25', textColor: '"#ececec"', fontFamily: INTER, fontSize: '14' },
      accent: { shape: 'rectangle', fill: '"#10112a"', stroke: '"#7b7ff2"', strokeWidth: '1.5', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '14' },
      decision: { shape: 'rectangle', fill: '"#0a0a0a"', stroke: '"#7b7ff2"', strokeWidth: '2', textColor: '"#ececec"', fontFamily: INTER, fontSize: '14' },
      output: { shape: 'rectangle', fill: '"#0a0a0a"', stroke: '"#d0607a"', strokeWidth: '1.25', textColor: '"#ececec"', fontFamily: INTER, fontSize: '14' },
      end: { shape: 'rectangle', fill: '"#0a0a0a"', stroke: '"#4a4a4a"', strokeWidth: '1.25', textColor: '"#6a6a6a"', fontFamily: INTER, fontSize: '14' },
      note: { shape: 'rectangle', fill: 'none', stroke: 'none', textColor: '"#bdbdbd"', fontFamily: INTER, fontSize: '14' },
      yes: { shape: 'oval', fill: '"#5b5fd6"', stroke: '"#5b5fd6"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '11' },
      no: { shape: 'oval', fill: '"#0a0a0a"', stroke: '"#d0607a"', strokeWidth: '1', textColor: '"#ececec"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#0f0f12"', stroke: '"#26263a"', strokeWidth: '1', textColor: '"#bdbdbd"', cornerRadius: '0', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#0a0a0a"', stroke: '"#5b5fd6"', textColor: '"#ececec"', headerFill: '"#15163a"', gridColor: '"#2a2b55"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#5b5fd6"', strokeWidth: '1.25', markerStart: 'filled_circle', markerEnd: 'filled_circle' },
      iso: { fill: '"#5b5fd6"' },
    },
  },
  {
    id: 'poolside',
    label: 'Poolside',
    description: 'Almond canvas, soft almond cards, cinnabar start pill, keppel decisions, dim gray end, curved gray lines',
    styles: {
      canvas: { fill: '"#e9dacd"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#f5ede5"', stroke: '"#d3c2b3"', strokeWidth: '1', textColor: '"#4d443d"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#ec5d3d"', stroke: '"#ec5d3d"', strokeWidth: '1', textColor: '"#ffffff"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      decision: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#6cc2b1"', stroke: '"#6cc2b1"', strokeWidth: '1', textColor: '"#1f3a35"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      input: { shape: 'pill', fill: '"#f5ede5"', stroke: '"#6cc2b1"', strokeWidth: '1.5', textColor: '"#4d443d"', fontFamily: INTER, fontSize: '12' },
      output: { shape: 'rounded_rectangle', cornerRadius: '10', fill: '"#f5ede5"', stroke: '"#ec5d3d"', strokeWidth: '1.5', textColor: '"#4d443d"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#72665c"', stroke: '"#72665c"', strokeWidth: '1', textColor: '"#f5ede5"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#efe4da"', stroke: '"#b3a596"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#72665c"', fontFamily: INTER, fontSize: '11' },
      yes: { shape: 'oval', fill: '"#6cc2b1"', stroke: '"#6cc2b1"', strokeWidth: '1', textColor: '"#1f3a35"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      no: { shape: 'oval', fill: '"#f5ede5"', stroke: '"#ec5d3d"', strokeWidth: '1', textColor: '"#c2452a"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#efe2d6"', stroke: '"#d3c2b3"', strokeWidth: '1', textColor: '"#72665c"', cornerRadius: '16', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#f5ede5"', stroke: '"#d3c2b3"', textColor: '"#4d443d"', headerFill: '"#cdebe4"', gridColor: '"#e0d1c3"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#72665c"', strokeWidth: '1.25', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#6cc2b1"' },
    },
  },
  {
    id: 'mint-lemonade',
    label: 'Mint Lemonade',
    description: 'Pale mint canvas, white cards, mint start pill, lemonade decisions, verbena end, curved mint lines',
    styles: {
      canvas: { fill: '"#eefaf5"' },
      node: { shape: 'rounded_rectangle', cornerRadius: '12', fill: '"#ffffff"', stroke: '"#c2f2e4"', strokeWidth: '1.5', textColor: '"#12312c"', fontFamily: INTER, fontSize: '12' },
      accent: { shape: 'pill', fill: '"#35c8b4"', stroke: '"#35c8b4"', strokeWidth: '1', textColor: '"#0b2e29"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      decision: { shape: 'rounded_rectangle', cornerRadius: '12', fill: '"#edf7be"', stroke: '"#a4cf4a"', strokeWidth: '1.5', textColor: '"#2f3d12"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      input: { shape: 'pill', fill: '"#ffffff"', stroke: '"#35c8b4"', strokeWidth: '1.5', textColor: '"#12312c"', fontFamily: INTER, fontSize: '12' },
      output: { shape: 'rounded_rectangle', cornerRadius: '12', fill: '"#ffffff"', stroke: '"#a4cf4a"', strokeWidth: '1.5', textColor: '"#12312c"', fontFamily: INTER, fontSize: '12' },
      end: { shape: 'pill', fill: '"#a4cf4a"', stroke: '"#a4cf4a"', strokeWidth: '1', textColor: '"#1f2a0c"', fontFamily: INTER, fontSize: '12', fontWeight: 'bold' },
      note: { shape: 'rectangle', cornerRadius: '4', fill: '"#f7fce4"', stroke: '"#c9dd8c"', strokeWidth: '1', strokeStyle: 'dashed', textColor: '"#5a6b3a"', fontFamily: INTER, fontSize: '11' },
      yes: { shape: 'oval', fill: '"#35c8b4"', stroke: '"#35c8b4"', strokeWidth: '1', textColor: '"#0b2e29"', fontFamily: INTER, fontSize: '11', fontWeight: 'bold' },
      no: { shape: 'oval', fill: '"#ffffff"', stroke: '"#a4cf4a"', strokeWidth: '1', textColor: '"#2f3d12"', fontFamily: INTER, fontSize: '11' },
      frame: { fill: '"#e0f7ef"', stroke: '"#c2f2e4"', strokeWidth: '1', textColor: '"#1f6e63"', cornerRadius: '18', shadow: 'false', fontFamily: INTER },
      table: { fill: '"#ffffff"', stroke: '"#c2f2e4"', textColor: '"#12312c"', headerFill: '"#edf7be"', gridColor: '"#d9f4ea"', fontFamily: INTER },
      flow: { route: 'curved', stroke: '"#2bb3a0"', strokeWidth: '1.25', markerStart: 'none', markerEnd: 'arrow' },
      iso: { fill: '"#35c8b4"' },
    },
  },
];
