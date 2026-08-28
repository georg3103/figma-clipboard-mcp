import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fillsOf, layoutOf, radiusOf, typographyOf } from '../src/lib/style.js';

/** A minimal scene: the mappers only need the variable and style indexes. */
const sceneWith = ({ variables = [], styles = [] } = {}) => ({
  variablesByKey: new Map(variables.map((v) => [v.key, v])),
  stylesByKey: new Map(styles.map((s) => [s.key, s])),
});

test('ignores nodes without auto layout', () => {
  assert.equal(layoutOf({ stackMode: 'NONE' }), undefined);
  assert.equal(layoutOf({}), undefined);
});

test('collapses equal padding into a single number', () => {
  const layout = layoutOf({
    stackMode: 'VERTICAL',
    stackSpacing: 40,
    stackVerticalPadding: 40,
    stackHorizontalPadding: 40,
    stackPaddingBottom: 40,
    stackPaddingRight: 40,
  });
  assert.equal(layout.gap, 40);
  assert.equal(layout.padding, 40);
});

test('spells out padding when the sides differ', () => {
  const layout = layoutOf({
    stackMode: 'HORIZONTAL',
    stackVerticalPadding: 8,
    stackPaddingRight: 16,
    stackPaddingBottom: 8,
    stackHorizontalPadding: 12,
  });
  assert.equal(layout.padding, '8 16 8 12');
});

test('reports corner radii, uniform or per corner', () => {
  assert.equal(radiusOf({ cornerRadius: 12 }), 12);
  assert.equal(
    radiusOf({
      rectangleTopLeftCornerRadius: 8,
      rectangleTopRightCornerRadius: 8,
      rectangleBottomRightCornerRadius: 0,
      rectangleBottomLeftCornerRadius: 0,
    }),
    '8 8 0 0'
  );
});

test('names the variable a paint is bound to', () => {
  const scene = sceneWith({ variables: [{ key: 'abc123', name: 'text/primary' }] });
  const node = {
    fillPaints: [
      {
        type: 'SOLID',
        color: { r: 0.05, g: 0.05, b: 0.05, a: 1 },
        colorVar: { value: { alias: { assetRef: { key: 'abc123' } } } },
      },
    ],
  };
  assert.deepEqual(fillsOf(node, scene), [{ type: 'SOLID', color: '#0d0d0d', var: 'text/primary' }]);
});

test('skips hidden paints', () => {
  const node = { fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, visible: false }] };
  assert.equal(fillsOf(node, sceneWith()), undefined);
});

test('carries the text style name alongside the font', () => {
  const scene = sceneWith({ styles: [{ key: 'style1', name: "Paragraph/16 (Typography.Text view='primary')" }] });
  const node = {
    type: 'TEXT',
    fontName: { family: 'SF Pro Text', style: 'Regular' },
    fontSize: 16,
    lineHeight: { value: 24, units: 'PIXELS' },
    styleIdForText: { assetRef: { key: 'style1' } },
  };
  const typography = typographyOf(node, scene);
  assert.equal(typography.font, 'SF Pro Text Regular');
  assert.equal(typography.line_height, 24);
  assert.equal(typography.style, "Paragraph/16 (Typography.Text view='primary')");
});
