import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFigmaUrl } from '../src/lib/link.js';

test('reads the file key and node id from a design link', () => {
  const url = 'https://www.figma.com/design/cBfAvOxe1PJTFbfoNpcO1h/Product?node-id=641-38302&t=abc';
  assert.deepEqual(parseFigmaUrl(url), {
    fileKey: 'cBfAvOxe1PJTFbfoNpcO1h',
    nodeId: '641:38302',
  });
});

test('accepts the older /file/ links', () => {
  const { fileKey, nodeId } = parseFigmaUrl('https://www.figma.com/file/AbCdEfGhIjKlMnOpQr/Draft');
  assert.equal(fileKey, 'AbCdEfGhIjKlMnOpQr');
  assert.equal(nodeId, null);
});

test('keeps only the first dash of a node id', () => {
  const { nodeId } = parseFigmaUrl('https://figma.com/design/AbCdEfGhIjKlMnOpQr/x?node-id=15252-4844');
  assert.equal(nodeId, '15252:4844');
});

test('rejects anything that is not a Figma link', () => {
  assert.throws(() => parseFigmaUrl('https://example.com/design/whatever'), /does not look like a Figma link/);
});
