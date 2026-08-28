#!/usr/bin/env node
// MCP server that reads Figma designs without a plugin and without the REST API —
// from the clipboard (⌘C in Figma) or from a locally saved .fig file.
// Works on any Figma seat, View included: copying is available to everyone.
//
// Note: stdout carries the MCP protocol, so all logging goes through console.error.

import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { readClipboard, readClipboardPng, readFigFile } from './lib/figparse.js';
import { parseFigmaUrl } from './lib/link.js';
import {
  buildScene,
  componentDefinition,
  componentTree,
  layerTree,
  listFrames,
  listVariables,
  nodeStyles,
} from './lib/scene.js';

/** The currently loaded scene, shared by every tool. */
let scene = null;

function summary(loaded) {
  const frames = listFrames(loaded);
  return {
    source: loaded.source,
    nodes: loaded.nodes.size,
    top_level: frames.slice(0, 40),
    top_level_total: frames.length,
  };
}

/** Every tool needs a scene: when none is loaded, read the clipboard. */
function ensureScene() {
  if (!scene) scene = buildScene(readClipboard());
  return scene;
}

const asText = (result) => ({
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
});

// The server introduces itself with the package's own name and version, so client logs
// match what is installed.
const { name, version } = createRequire(import.meta.url)('../package.json');

const server = new McpServer({ name, version });

server.registerTool(
  'load_clipboard',
  {
    title: 'Load the Figma selection',
    description:
      'Reads whatever was copied in Figma with ⌘C and makes it the current scene. ' +
      'The user selects a screen, frame or component in Figma and copies it; this parses the full ' +
      'node dump: hierarchy, text, auto layout, component instances, variables. ' +
      'Call it again after every new copy. Returns the top-level nodes with their node_id.',
    inputSchema: {},
  },
  async () => {
    scene = buildScene(readClipboard());
    return asText(summary(scene));
  }
);

server.registerTool(
  'load_fig_file',
  {
    title: 'Load a .fig file',
    description:
      'Reads a .fig file saved from Figma through File - Save local copy and makes it the current scene. ' +
      'Unlike the clipboard it carries the whole file, every page included. ' +
      'It is a snapshot taken at export time: after the design changes, the file has to be saved again.',
    inputSchema: {
      path: z.string().describe('Path to the .fig file; a leading ~ means the home directory'),
    },
  },
  async ({ path }) => {
    scene = buildScene(readFigFile(path));
    return asText(summary(scene));
  }
);

server.registerTool(
  'resolve_link',
  {
    title: 'Locate a node from a Figma link',
    description:
      'Parses a Figma link and finds that node in the current scene: the URL yields a file key and a ' +
      'node id (node-id=641-38302 becomes 641:38302). Nothing can be downloaded from a link — that is ' +
      'the REST API, which this server does not use — so the design has to be copied in Figma first. ' +
      'Says so plainly when the loaded scene comes from a different file.',
    inputSchema: {
      url: z.string().describe('A link such as https://www.figma.com/design/<key>/...?node-id=641-38302'),
    },
  },
  async ({ url }) => {
    const { fileKey, nodeId } = parseFigmaUrl(url);
    const loaded = ensureScene();
    const loadedKey = loaded.meta && loaded.meta.fileKey;

    if (loadedKey && loadedKey !== fileKey) {
      throw new Error(
        `The link points at file ${fileKey}, but the loaded scene comes from ${loadedKey}. ` +
          'Open that file in Figma, select the node, press ⌘C and call load_clipboard.'
      );
    }
    if (!nodeId) throw new Error('The link carries no node-id, so there is nothing to look up.');

    const node = loaded.nodes.get(nodeId);
    if (!node) {
      throw new Error(
        `Node ${nodeId} is not in the current scene (${loaded.source}). ` +
          (loadedKey
            ? 'It was not part of the copied selection: select it in Figma, press ⌘C and call load_clipboard.'
            : 'A scene loaded from a .fig file carries no file key, so it may come from a different file. ' +
              'Check the file, or copy the node with ⌘C and call load_clipboard.')
      );
    }
    return asText({ node_id: nodeId, name: node.name, type: node.type, file: fileKey });
  }
);

server.registerTool(
  'list_frames',
  {
    title: 'Top-level nodes of the scene',
    description:
      'Lists the screens, frames and components at the top level of the current scene with their node_id. ' +
      'This is the entry point: layer and component trees take their node_id from here. ' +
      'When no scene is loaded yet, the clipboard is read automatically.',
    inputSchema: {},
  },
  async () => asText(listFrames(ensureScene()))
);

server.registerTool(
  'get_layer_tree',
  {
    title: 'Layer tree',
    description:
      'Layer tree of a node: names, types, sizes, text and styles. Take node_id from list_frames. ' +
      'Detail levels: none is structure only; layout, the default, adds auto layout, gaps, padding, ' +
      'alignment and corner radii; full adds fills, strokes, typography and effects. ' +
      'When building a screen: start with layout at max_depth 2-3, then full on the one block being ' +
      'worked on — full over a whole screen runs to tens of kilobytes.',
    inputSchema: {
      node_id: z.string().describe('Node id, for example 2210:1370'),
      max_depth: z.number().int().min(1).max(20).default(4),
      style: z.enum(['none', 'layout', 'full']).default('layout'),
    },
  },
  async ({ node_id, max_depth, style }) =>
    asText(layerTree(ensureScene(), node_id, max_depth, style))
);

server.registerTool(
  'get_node_styles',
  {
    title: 'Styles of a single node',
    description:
      'Every style of one node at once: auto layout with padding and gap, corner radii, size limits, ' +
      'fills and strokes, typography, effects. A color comes back as the variable it is bound to, ' +
      'such as text/primary, and typography carries the text style name, where design systems usually ' +
      'spell out the target code component. ' +
      'A cheap call: reach for it when one block is in question rather than a whole screen.',
    inputSchema: { node_id: z.string().describe('Node id taken from a layer tree') },
  },
  async ({ node_id }) => asText(nodeStyles(ensureScene(), node_id))
);

server.registerTool(
  'get_component_tree',
  {
    title: 'Tree of component instances',
    description:
      'A tree of nothing but component instances inside a node: which design-system component is used, ' +
      'which variant, whether it comes from a library, and how they nest. Plain layers are skipped, ' +
      'though the walk goes through them. This is the tool for seeing what a screen is actually built from.',
    inputSchema: {
      node_id: z.string().describe('Node id, for example 2210:1370'),
      max_depth: z.number().int().min(1).max(20).default(6),
    },
  },
  async ({ node_id, max_depth }) => asText(componentTree(ensureScene(), node_id, max_depth))
);

server.registerTool(
  'get_component_definition',
  {
    title: 'Component definition',
    description:
      'Properties, variants and inner layers of a component. Looks it up by node_id or component_key, ' +
      'both of which come from get_component_tree. The definition is available only when the component ' +
      'itself made it into the copied selection or the loaded .fig file.',
    inputSchema: {
      node_id: z.string().optional().describe('Node id of the component or one of its variants'),
      component_key: z.string().optional().describe('Component key from get_component_tree'),
    },
  },
  async ({ node_id, component_key }) =>
    asText(componentDefinition(ensureScene(), { node_id, component_key }))
);

server.registerTool(
  'list_variables',
  {
    title: 'Variables (design tokens)',
    description:
      'Figma variables present in the scene: name, collection, type and per-mode values, colors in hex. ' +
      'Useful for checking the design against the tokens that exist in code.',
    inputSchema: {},
  },
  async () => asText(listVariables(ensureScene()))
);

server.registerTool(
  'get_clipboard_png',
  {
    title: 'Image from the clipboard',
    description:
      'Returns the PNG copied in Figma with ⌘⇧C (Copy as PNG). ' +
      'For when appearance matters rather than structure. The loaded scene is left untouched.',
    inputSchema: {},
  },
  async () => ({
    content: [
      { type: 'image', data: readClipboardPng().toString('base64'), mimeType: 'image/png' },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[figma-clipboard-mcp] server ready on stdio');

// The MCP client closed stdin, so the process has nothing left to do.
process.stdin.on('close', () => process.exit(0));
