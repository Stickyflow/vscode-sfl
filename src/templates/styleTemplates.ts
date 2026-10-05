// The style templates "SFL: Apply Style Template" offers. A template is a set
// of SFL Style blocks, one per role (see applyStyleTemplate.ts for which
// blocks get which role). Values are written into the document verbatim, so
// they are SFL value syntax: strings quoted, idents and numbers bare.
//
// `tpl_canvas` is not referenced by any block. It carries the canvas color
// for hosts that can paint a background (the preview reads it); renderers
// that don't know the convention just ignore an unused Style.

export type TemplateRole = 'canvas' | 'node' | 'accent' | 'frame' | 'table' | 'flow' | 'iso';

export interface StyleTemplate {
  id: string;
  label: string;
  description: string;
  styles: Record<TemplateRole, Record<string, string>>;
}

/** Style block name for each role. Re-applying a template replaces every
 *  Style whose name starts with TEMPLATE_PREFIX. */
export const TEMPLATE_PREFIX = 'tpl_';
export const roleStyleName = (role: TemplateRole): string => `${TEMPLATE_PREFIX}${role}`;

const INTER = `"'Inter', sans-serif"`;

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
      iso: { fill: '"#2a3990"' },
    },
  },
];
