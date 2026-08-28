// Mappers from a raw .fig node to flat styles: geometry, paints, typography, effects.
// Each returns undefined when there is nothing to report, so the key stays out of the answer.

import { assetKey, hex } from './scene.js';

const num = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : undefined);

/** Auto layout: direction, gap, padding, alignment, sizing mode. */
export function layoutOf(node) {
  if (!node.stackMode || node.stackMode === 'NONE') return undefined;

  // Figma keeps left and top padding in *Horizontal/*Vertical, right and bottom in fields of their own.
  const top = node.stackVerticalPadding || 0;
  const left = node.stackHorizontalPadding || 0;
  const bottom = node.stackPaddingBottom || 0;
  const right = node.stackPaddingRight || 0;

  const layout = { mode: node.stackMode };
  if (node.stackSpacing) layout.gap = num(node.stackSpacing);
  if (top || right || bottom || left) {
    layout.padding =
      top === right && right === bottom && bottom === left
        ? num(top)
        : [top, right, bottom, left].map(num).join(' ');
  }
  if (node.stackPrimaryAlignItems) layout.align_main = node.stackPrimaryAlignItems;
  if (node.stackCounterAlignItems) layout.align_cross = node.stackCounterAlignItems;
  if (node.stackPrimarySizing) layout.sizing_main = node.stackPrimarySizing;
  if (node.stackCounterSizing) layout.sizing_cross = node.stackCounterSizing;
  if (node.stackWrap && node.stackWrap !== 'NO_WRAP') layout.wrap = node.stackWrap;
  return layout;
}

/** Corner radii: a single number, or four corners clockwise from the top left. */
export function radiusOf(node) {
  const corners = [
    node.rectangleTopLeftCornerRadius,
    node.rectangleTopRightCornerRadius,
    node.rectangleBottomRightCornerRadius,
    node.rectangleBottomLeftCornerRadius,
  ];
  if (corners.some((c) => typeof c === 'number')) {
    const values = corners.map((c) => num(c) || 0);
    if (values.every((v) => v === values[0])) return values[0] || undefined;
    return values.join(' ');
  }
  return node.cornerRadius ? num(node.cornerRadius) : undefined;
}

/** Name of the variable a paint value is bound to. */
function variableName(scene, ref) {
  const alias = ref && ref.value && ref.value.alias;
  const variable = alias && scene.variablesByKey.get(assetKey(alias));
  return variable ? variable.name : undefined;
}

function paint(scene, p) {
  const entry = { type: p.type };
  if (p.color) entry.color = hex(p.color);

  const bound = variableName(scene, p.colorVar);
  if (bound) entry.var = bound;

  if (p.opacity !== undefined && p.opacity < 1) entry.opacity = num(p.opacity);
  if (p.stops) {
    entry.stops = p.stops.map((s) => ({
      at: num(s.position),
      color: s.color ? hex(s.color) : undefined,
    }));
  }
  if (p.image) entry.image = { scale_mode: p.imageScaleMode, alt: p.altText || undefined };
  return entry;
}

const visiblePaints = (scene, paints) => {
  const list = (paints || []).filter((p) => p.visible !== false).map((p) => paint(scene, p));
  return list.length ? list : undefined;
};

export const fillsOf = (node, scene) => visiblePaints(scene, node.fillPaints);

/** Stroke: paints, weight, alignment, and per-side weights when they differ. */
export function strokeOf(node, scene) {
  const paints = visiblePaints(scene, node.strokePaints);
  if (!paints) return undefined;

  const stroke = { paints };
  if (node.strokeWeight) stroke.weight = num(node.strokeWeight);
  if (node.strokeAlign) stroke.align = node.strokeAlign;

  const sides = [node.borderTopWeight, node.borderRightWeight, node.borderBottomWeight, node.borderLeftWeight];
  if (sides.some((w) => typeof w === 'number') && !sides.every((w) => w === sides[0])) {
    stroke.sides = sides.map((w) => num(w) || 0).join(' ');
  }
  return stroke;
}

/** Typography plus the text style name, where design systems tend to spell out the target component. */
export function typographyOf(node, scene) {
  if (node.type !== 'TEXT' && !node.fontName) return undefined;

  const typography = {};
  if (node.fontName) typography.font = `${node.fontName.family} ${node.fontName.style}`.trim();
  if (node.fontSize) typography.size = num(node.fontSize);
  if (node.lineHeight) {
    typography.line_height =
      node.lineHeight.units === 'PERCENT'
        ? `${num(node.lineHeight.value)}%`
        : num(node.lineHeight.value);
  }
  if (node.letterSpacing && node.letterSpacing.value) {
    typography.letter_spacing = num(node.letterSpacing.value);
  }
  if (node.textAlignHorizontal) typography.align = node.textAlignHorizontal;
  if (node.textAutoResize) typography.resize = node.textAutoResize;

  const style = scene.stylesByKey.get(assetKey(node.styleIdForText));
  if (style) typography.style = style.name;

  return Object.keys(typography).length ? typography : undefined;
}

/** Size limits and how the node is pinned to its parent's edges. */
export function sizingOf(node) {
  const sizing = {};
  if (node.minSize) sizing.min = { w: num(node.minSize.x), h: num(node.minSize.y) };
  if (node.maxSize) sizing.max = { w: num(node.maxSize.x), h: num(node.maxSize.y) };
  if (node.horizontalConstraint && node.horizontalConstraint !== 'MIN') {
    sizing.constraint_x = node.horizontalConstraint;
  }
  if (node.verticalConstraint && node.verticalConstraint !== 'MIN') {
    sizing.constraint_y = node.verticalConstraint;
  }
  return Object.keys(sizing).length ? sizing : undefined;
}

/** Shadows and blurs. */
export function effectsOf(node) {
  const effects = (node.effects || [])
    .filter((e) => e.visible !== false)
    .map((e) => {
      const entry = { type: e.type };
      if (e.offset && (e.offset.x || e.offset.y)) entry.offset = [num(e.offset.x), num(e.offset.y)];
      if (e.radius) entry.blur = num(e.radius);
      if (e.spread) entry.spread = num(e.spread);
      if (e.color) entry.color = hex(e.color);
      return entry;
    });
  return effects.length ? effects : undefined;
}

const put = (target, field, value) => {
  if (value !== undefined) target[field] = value;
};

/**
 * Node styles at a given detail level:
 * layout covers geometry (auto layout, radii, limits), full adds paints, typography and effects.
 */
export function stylesOf(node, scene, level = 'layout') {
  const styles = {};
  put(styles, 'layout', layoutOf(node));
  put(styles, 'radius', radiusOf(node));
  put(styles, 'sizing', sizingOf(node));

  if (level === 'full') {
    put(styles, 'fills', fillsOf(node, scene));
    put(styles, 'stroke', strokeOf(node, scene));
    put(styles, 'typography', typographyOf(node, scene));
    put(styles, 'effects', effectsOf(node));
  }
  return styles;
}
