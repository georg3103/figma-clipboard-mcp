import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertClipboardSupport } from '../src/lib/figparse.js';

test('accepts macOS for clipboard reading', () => {
  assert.doesNotThrow(() => assertClipboardSupport('darwin'));
});

test('points elsewhere at a .fig file on other platforms', () => {
  assert.throws(() => assertClipboardSupport('linux'), /needs macOS.*Save local copy/s);
});
