import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expandHome } from '../src/lib/figparse.js';

test('expands a leading tilde to the home directory', () => {
  assert.equal(expandHome('~/Downloads/design.fig', '/Users/me'), '/Users/me/Downloads/design.fig');
  assert.equal(expandHome('~', '/Users/me'), '/Users/me');
});

test('leaves absolute and relative paths alone', () => {
  assert.equal(expandHome('/tmp/design.fig', '/Users/me'), '/tmp/design.fig');
  assert.equal(expandHome('designs/design.fig', '/Users/me'), 'designs/design.fig');
});

test('does not touch another user\'s home shorthand', () => {
  assert.equal(expandHome('~someone/design.fig', '/Users/me'), '~someone/design.fig');
});
