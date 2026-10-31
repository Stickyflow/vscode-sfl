// packages/vscode-sfl/src/server/features/sflDocs.ts
//
// Hover/completion documentation content for SFL 1.2 — what each block kind
// and property key means and how it's used. Sourced from
// StickyFlow-Web/src/pages/SFLLanguage.tsx (the canonical, currently-1.2
// SFL language reference rendered on the landing page), specifically §6
// (layout properties, Table 5), §8 (block types), §9 (styles), §11
// (endpoints), and §12 (the kind axis, Table 7). Properties without a direct
// spec table entry (most `style {}` fields, plus renderer-specific ones like
// `orientation`/`lanes`/`weight`/`segments`) are described from the spec's
// prose plus this extension's own STYLE_ORDER/PROPERTY_KEYS vocabulary —
// keep this in sync if the spec adds a dedicated table for them later.

import type { BlockKind } from '../sfl-core';

export const BLOCK_KIND_DOCS: Record<BlockKind, string> = {
  Project: 'The top-level wrapper for a complete SFL document. May contain Models and global, reusable Layout/Style definitions.',
  Model: 'One coherent information visualization — a model section, diagram, knowledge structure, process view, or board-level unit. A Project may contain several.',
  Group: 'A semantic structure for scoping and analysis. Collects related Entities, Links, and nested Groups as one logical unit — not positioned or styled directly. Use a Container instead when the collection needs geometry or appearance.',
  Container: 'A spatial structure (frame, swimlane, region, board area) with visible appearance or concrete placement. Use Container instead of Group whenever the block itself needs a `layout`/`style`.',
  Shape: 'The universal domain element (the current keyword; `Entity` is an equivalent alias). A step, decision, note, input, output, component, asset, or other information carrier. Its precise semantic role is expressed through `kind`, independent of its visual `shape`.',
  Entity: 'Legacy alias for `Shape`, still accepted and treated identically. The universal domain element — a step, decision, note, input, output, component, asset, or other information carrier. Its precise semantic role is expressed through `kind`, independent of its visual `shape`.',
  Link: 'Connects two endpoints (`from`/`to`) through stable name references, making the relationship analyzable. May carry `text`, a `condition`, and route/marker styling.',
  Layout: 'A reusable, named bundle of spatial properties (size, rotation, order, …) that other blocks can inherit through their composition list (`: MyLayout`). At most one direct Layout per block.',
  Style: 'A reusable, named bundle of visual properties (shape, fill, stroke, typography, …) that other blocks can inherit through their composition list (`: MyStyle`). At most one direct Style per block; single-parent inheritance via its own composition list.',
  Chart: "A data chart (SFL 1.4 §5.4): its own geometry (`layout`/`style`) like a Container, but a fixed schema of `Axis`, `Series`, and `Rule` child blocks instead of freely placeable content. `type:` picks the chart form (`bar`, `line`, `pie`, `scatter`, …); `stacked: true` stacks a bar/area chart's series.",
  Axis: "An axis of a `Chart` (SFL 1.4), conventionally named `x` / `y`. Carries either `categories` (an ordered label list) or a numeric range (`min`, `max`, `step`), plus an optional `unit` and `label`.",
  Series: "One data series of a `Chart` (SFL 1.4): `values` (a number list, one per category), a `label`, an optional `color`, and optional per-point `error` magnitudes.",
  Rule: "A reference line on a `Chart` (SFL 1.4 §5.4.8) — a labelled threshold drawn `at:` a given axis value. A distinct leaf kind from `Axis` and `Series`.",
  Path: "A freeform named shape (SFL 1.4 §3.3): an explicit `points` polyline, optionally `closed`, with an optional scalar `value` (choropleth regions). A leaf like `Entity`, and a valid `from:`/`to:` endpoint.",
  Symbol: "A reusable named shape (SFL 1.4 §5.5): normalized `points` (0..1 of the referencing instance's box) plus optional `Port` children. Referenced as the *value* of `shape:` (e.g. `Entity amp { shape: OpAmp }`), not through a `:` composition list.",
  Port: "A named connection point of a `Symbol` (SFL 1.4 §3.5): `at:` a normalized (0..1) position. Addressed as `entity.portName` on a Link endpoint, where the entity's `shape:` points at the owning Symbol.",
  Net: 'A multi-terminal net (SFL 1.4 §3.5, "pattern C") — authored once via a `members` list instead of N-1 hand-written Links. Parse-only: the renderer star-decomposes it (first member = hub) into ordinary links.',
  Isometric: "A 3D box drawn in isometric projection. `layout { size: width, height, depth }` takes a third value for its depth (default 24). Only `fill` is set: the side faces are derived shades of it. Carries `text` and an optional `icon`, and is a valid `from:`/`to:` endpoint.",
  Connection: "Connects two `Isometric` objects (`from`/`to`), attached to a cube face (`fromFace` / `toFace`: `top`, `bottom`, `front`, `back`, `left`, `right`; default `front`) instead of a 2D side. Takes the same line styling as a Link (`route`, `stroke`, `strokeWidth`, `strokeStyle`, `opacity`).",
  Image: 'A picture on the canvas: `src` is the address of the file, `fit` is `cover`, `contain` or `fill`, and `imageSize` with `crop` show only a part of it. It moves, scales and layers like a shape.',
  Text: 'A free text label on the canvas with no shape around it. Carries `text`, a `layout` and typography in `style` (`fontSize`, `fontWeight`, `textColor`, `textAlign`). A valid `from:`/`to:` endpoint.',
  Widget: 'A live control on the canvas, picked by `type:` (`rollingNumber`, `tickScale`, `ruler`). Its value can be bound to a DataSource field (`value: <- source.field`).',
  Shader: 'A reusable shader surface: `program:` plus its parameters. Referenced by name from a style\'s `shader:` property.',
  DataSource: 'Typed data a document can bind to: a `fields { }` block with one `name: type` per field, and optional `data { }` rows. Bindings and handlers read it as `source.field`.',
  Dimension: 'A measure line (SFL 1.6) with an arrow at each end, extension lines and a label. `start` and `end` are the measured points, `offset` the distance of the line (positive to the left of the direction). Without `text` the label is the measured length, rounded to one decimal, followed by `unit`.',
  Repeat: 'Puts the blocks in it on a grid, once for every cell (SFL 1.6). `columns` and `rows` (or `count`) set the grid, `step` the distance between cells, `origin` where it starts. Inside, a value can be computed from `col`, `row`, `index`, `x` and `y`, as in `position: x, y + row * 4`, with `+ - * /`, comparisons and functions like `floor`, `round`, `min`, `max`, `sin`, `cos`, `when(c, a, b)`, `random(lo, hi)`, `pick(a, b)`, `mix(c1, c2, t)`, `shade(c, f)`. `seed`, `jitter`, `chance`, `where` and `order: diagonal` shape the cells. Any other computed property is a name for the blocks inside. The blocks made are named `name_col` or `name_col_row`.',
  Template: 'Describes blocks once (SFL 1.6), so every `Use` of it makes them again at another place. Its own properties are the parameters with their default values; in its blocks, `x` and `y` are the place of the Use and the parameters are names for computed values.',
  Use: 'Makes the blocks of a Template again (SFL 1.6): `Use oak : tree { at: 120, 80; height: 40 }`. `at` is the place, `seed` the random seed, and any other property gives a value to the Template parameter of that name. The blocks made are named after the Use, as `oak_trunk`. A Use can sit in a Repeat.',
};

interface PropertyDoc {
  description: string;
  /** Rendered as a short "in: A, B, C" line when set — where this property is meaningful. */
  appliesTo?: string;
}

export const PROPERTY_DOCS: Record<string, PropertyDoc> = {
  // Identity / semantic (§3, §12, §14)
  id: { description: 'Optional stable identifier for the block, independent of its (renameable) name.' },
  kind: { description: 'The semantic role of the block (§12) — e.g. `decision`, `process`, `start`, `end`. Drives analyzable graph behavior (link-count checks, defaults), deliberately independent of the visual `shape`.' },
  text: { description: "The block's visible label." },
  asset: { description: 'A reference to an external asset (e.g. an icon or image path). Counts toward an Entity\'s "needs content" requirement in place of `text`/`kind`.' },
  tags: { description: 'A free-form, order-preserving list of labels for grouping or searching.', appliesTo: 'Group, Entity' },
  caption: { description: "A longer descriptive text for a Model, separate from its short `text` label.", appliesTo: 'Model' },
  condition: { description: "The machine-readable branch meaning of a Link (e.g. `\"valid\"`), separate from its visible `text` label — what a validator checks for a decision's outgoing links." },
  parent: { description: "Fallback reference to a containing block, for a block that isn't structurally nested under it in the document (round-trips orthogonal containment)." },

  // Endpoints (§11)
  from: { description: 'The source endpoint of a Link (§11): `path`, or `path, side (fraction)` to attach to a specific point — `side` is one of top/bottom/left/right, `fraction` (in parentheses) defaults to 0.5.' },
  to: { description: 'The target endpoint of a Link (§11) — same syntax as `from`.' },

  // layout {} / Layout (§6, Table 5)
  position: { description: 'x, y relative to the parent scope. If missing, the renderer may auto-place the element.', appliesTo: 'layout {}, Layout' },
  size: { description: 'width, height. If missing, the renderer may auto-size from content. An `Isometric` object takes a third value, its depth.', appliesTo: 'layout {}, Layout' },
  rotation: { description: 'Rotation in degrees. Defaults to 0.', appliesTo: 'layout {}, Layout' },
  order: { description: 'Global stack rank — a higher value renders above a lower one. Falls back to document order when unset. Presentational only; never encodes semantic priority (§13).', appliesTo: 'layout {}, Layout' },

  // style {} / Style — presentational appearance (§9)
  shape: { description: 'The visual base form, e.g. `pill`, `diamond`, `rectangle`, `circle`. Independent of `kind` — a decision can be drawn as any shape.', appliesTo: 'style {}, Style' },
  fill: { description: "Fill color, or `none` to leave the shape unfilled.", appliesTo: 'style {}, Style' },
  stroke: { description: 'Border/outline color.', appliesTo: 'style {}, Style' },
  strokeWidth: { description: 'Border/outline thickness.', appliesTo: 'style {}, Style' },
  strokeStyle: { description: 'Border/outline pattern (e.g. solid, dashed) — distinct from `dash`, which sets the concrete dash pattern.', appliesTo: 'style {}, Style' },
  textColor: { description: "Color of the block's text label.", appliesTo: 'style {}, Style' },
  color: { description: 'General-purpose accent color, e.g. for a Group icon.', appliesTo: 'style {}, Style' },
  fontSize: { description: "Font size of the text label.", appliesTo: 'style {}, Style' },
  fontWeight: { description: "Font weight of the text label.", appliesTo: 'style {}, Style' },
  fontFamily: { description: "Font family of the text label.", appliesTo: 'style {}, Style' },
  textAlign: { description: 'Horizontal alignment of the text label.', appliesTo: 'style {}, Style' },
  verticalAlign: { description: 'Vertical alignment of the text label.', appliesTo: 'style {}, Style' },
  cornerRadius: { description: 'Corner rounding for rectangle-like shapes.', appliesTo: 'style {}, Style' },
  dash: { description: 'Dash pattern for the stroke/line.', appliesTo: 'style {}, Style' },
  lineHeight: { description: 'Line height of the text label.', appliesTo: 'style {}, Style' },
  letterSpacing: { description: 'Letter spacing of the text label.', appliesTo: 'style {}, Style' },
  shadow: { description: 'Drop shadow, or `none` to disable.', appliesTo: 'style {}, Style' },
  opacity: { description: 'Overall opacity of the element.', appliesTo: 'style {}, Style' },
  icon: { description: 'Icon identifier shown alongside the block.', appliesTo: 'style {}, Style' },
  route: { description: 'Routing style of a Link\'s path, e.g. `orthogonal`, `straight`, `curved`.', appliesTo: 'style {}, Style on a Link' },
  marker: { description: "A Link's marker style, when start and end share the same marker." },
  markerStart: { description: "Arrowhead/marker shown at a Link's source end." },
  markerEnd: { description: "Arrowhead/marker shown at a Link's target end." },
  weight: { description: "A Link line's visual thickness." },
  segments: { description: "Explicit routing waypoints/offsets for a Link's path, for manual route overrides." },
  orientation: { description: 'Axis orientation for a Container acting as a swimlane (e.g. horizontal/vertical).', appliesTo: 'Container' },
  lanes: { description: 'Named lane definitions for a swimlane-style Container.', appliesTo: 'Container' },

  // Chart (SFL 1.4 §5.4)
  type: { description: "The chart form for a `Chart` — one of `bar`, `line`, `scatter`, `radar`, `radial`, `field`, `heatmap`, `boxplot`, `sankey`, `treemap`, `mekko`, `hexbin`, `pie`, `matrix`, `grid`, `custom`.", appliesTo: 'Chart' },
  stacked: { description: 'Whether a bar/area `Chart` stacks its series instead of drawing them side by side.', appliesTo: 'Chart' },
  categories: { description: 'The ordered category labels for a categorical `Axis` (e.g. a bar chart\'s x-axis).', appliesTo: 'Axis' },
  min: { description: 'Lower bound of a numeric `Axis`.', appliesTo: 'Axis' },
  max: { description: 'Upper bound of a numeric `Axis`.', appliesTo: 'Axis' },
  step: { description: 'Tick interval of a numeric `Axis`. On a `Repeat`: the distance between cells, `x, y` (one value is used for both).', appliesTo: 'Axis, Repeat' },
  unit: { description: 'Unit suffix shown on a numeric `Axis`\'s tick labels (e.g. `"k€"`), or after the measured length of a `Dimension`.', appliesTo: 'Axis, Dimension' },
  label: { description: 'The visible label of an `Axis` or a `Series`.', appliesTo: 'Axis, Series' },
  values: { description: 'The data points of a `Series` — a list of numbers, one per category.', appliesTo: 'Series' },
  error: { description: 'Per-point error-bar magnitudes for a `Series`, aligned with `values`; `none` skips a point.', appliesTo: 'Series' },
  at: { description: 'A `Rule` reference line: the axis value it is drawn at. A `Port`: its normalized (0..1) position on the owning Symbol. A `Use`: the place `x, y` its Template is made at.', appliesTo: 'Rule, Port, Use' },

  // Repeat / Use / Dimension (SFL 1.6)
  columns: { description: 'Number of cells across the grid of a `Repeat`. Defaults to 1.', appliesTo: 'Repeat' },
  rows: { description: 'Number of cells down the grid of a `Repeat`. Defaults to 1.', appliesTo: 'Repeat' },
  count: { description: 'A one-row `Repeat` of this many cells, in place of `columns` and `rows`.', appliesTo: 'Repeat' },
  origin: { description: 'Where the grid of a `Repeat` starts, `x, y`. The cell at `col`, `row` sits at `origin + step * (col, row)`.', appliesTo: 'Repeat' },
  seed: { description: 'Seed for `random()` and `pick()`, so they give the same result every time.', appliesTo: 'Repeat, Use' },
  jitter: { description: 'Shifts every cell of a `Repeat` by up to this many units in x and y.', appliesTo: 'Repeat' },
  chance: { description: 'The share (0..1) of the cells of a `Repeat` that are kept, picked at random.', appliesTo: 'Repeat' },
  where: { description: 'A computed condition: a `Repeat` keeps only the cells for which it is true, as in `where: dist(col, row, 4, 4) < 4`.', appliesTo: 'Repeat' },
  start: { description: 'The first measured point of a `Dimension`, `x, y`.', appliesTo: 'Dimension' },
  end: { description: 'The second measured point of a `Dimension`, `x, y`.', appliesTo: 'Dimension' },
  offset: { description: 'Distance of the measure line of a `Dimension` from the measured points, positive to the left of the direction from `start` to `end`.', appliesTo: 'Dimension' },

  // Path / Symbol / Net (SFL 1.4 §3.3 / §5.5 / §3.5)
  points: { description: 'An explicit list of `[x, y]` coordinate pairs — the polyline of a `Path` (diagram units) or of a `Symbol` (normalized 0..1 of the referencing instance\'s box).', appliesTo: 'Path, Symbol' },
  closed: { description: 'Whether a `Path` polyline is closed into a filled region.', appliesTo: 'Path' },
  value: { description: 'An optional scalar carried by a `Path` — e.g. the magnitude behind a choropleth region\'s fill.', appliesTo: 'Path' },
  tension: { description: 'Optional curve smoothing for a `Symbol` outline (0 = straight segments).', appliesTo: 'Symbol' },
  // Isometric / Connection
  fromFace: { description: 'The cube face of the `from` Isometric object a `Connection` attaches to: `top`, `bottom`, `front`, `back`, `left` or `right`. Defaults to `front`.', appliesTo: 'Connection' },
  toFace: { description: 'The cube face of the `to` Isometric object a `Connection` attaches to. Same values as `fromFace`.', appliesTo: 'Connection' },
  labelOffsetX: { description: "Horizontal offset of an `Isometric` object's label from its default anchor. Written by dragging the label in the preview.", appliesTo: 'style {}, Style on an Isometric' },
  labelOffsetY: { description: "Vertical offset of an `Isometric` object's label from its default anchor.", appliesTo: 'style {}, Style on an Isometric' },
  labelBackground: { description: "Background color behind an `Isometric` object's label.", appliesTo: 'style {}, Style on an Isometric' },
  members: { description: 'The ordered member list of a `Net` — bare entity names. The first is the hub; every other member connects to it.', appliesTo: 'Net' },

  // Table (§12.1a)
  rowHeight: { description: 'Row height for a Table.', appliesTo: 'layout {} on a Table' },
  width: { description: 'Column width, in the same units as `size`.', appliesTo: 'Column' },
  showHeader: { description: 'Whether a Table draws its header row.', appliesTo: 'style {}, Style on a Table' },
  headerFill: { description: "A Table header row's background fill.", appliesTo: 'style {}, Style on a Table' },
  headerRuleStyle: { description: "The rule line style under a Table's header row (e.g. `solid`, `double`).", appliesTo: 'style {}, Style on a Table' },
  gridColor: { description: "A Table's cell grid line color.", appliesTo: 'style {}, Style on a Table' },
  gridWidth: { description: "A Table's cell grid line thickness.", appliesTo: 'style {}, Style on a Table' },
  borderStyle: { description: "A Table's outer border style (e.g. `solid`, `double`).", appliesTo: 'style {}, Style on a Table' },
  cellType: { description: 'Legacy: marks a boolean checkbox column. Only read for older Column definitions — new tables use plain text cells and can omit this.', appliesTo: 'Column (legacy)' },
};

// §12 kind axis (Table 7) — the analytical meaning of each predefined `kind:` value.
export const KIND_VALUE_DOCS: Record<string, string> = {
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
  // Not in the spec's Table 7: used by the style templates, which can color
  // a decision's outcome nodes.
  yes: 'Positive outcome of a decision, drawn as a small branch node (not yet in the SFL spec; style templates can color it).',
  no: 'Negative outcome of a decision, drawn as a small branch node (not yet in the SFL spec; style templates can color it).',
  highlight: 'A step to draw attention to, e.g. the main path through a flow (not yet in the SFL spec; style templates give it their accent style).',
};
