# figma-clipboard-mcp

[![npm](https://img.shields.io/npm/v/figma-clipboard-mcp?color=0f6f66)](https://www.npmjs.com/package/figma-clipboard-mcp)
[![CI](https://github.com/georg3103/figma-clipboard-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/georg3103/figma-clipboard-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a.svg)](package.json)
[![Clipboard](https://img.shields.io/badge/clipboard-macOS-000000.svg)](#limitations)
[![MCP](https://img.shields.io/badge/MCP-stdio%20server-6b4fbb.svg)](https://modelcontextprotocol.io)

**Read Figma designs from your AI assistant — screens, layer trees with styles, design-system components
with their variants, and variables. No REST API, no access token, no paid Figma seat.**

Figma's official MCP server and REST API need a Dev or Full seat, and lesser seats get a handful of API
calls per month. This server takes a different route: when you press `⌘C`, Figma itself puts a complete
binary dump of the selection on your clipboard. That is what gets parsed.

```
AI assistant ──stdio/MCP──▶ figma-clipboard-mcp ──▶ clipboard (⌘C) or a local .fig file
```

![Select a design in Figma and press command C; the server parses the fig-kiwi container out of the clipboard's HTML flavor; the assistant loads the scene and reads trees, styles and variables](https://raw.githubusercontent.com/georg3103/figma-clipboard-mcp/main/docs/how-it-works.png)

## Why this exists

| | Official Figma MCP / REST | figma-clipboard-mcp |
|---|---|---|
| Figma seat | Dev or Full | any, including View |
| Credentials | personal access token | none |
| Rate limits | yes | no requests are made at all |
| Source of truth | the file on Figma's servers | what you copied, or a saved `.fig` |
| Platform | any | macOS for the clipboard, any for .fig files |

It reads what Figma places on your own clipboard, from a file you already have open. Nothing is
downloaded, and nothing is sent anywhere.

## What you get back

Component instances arrive as design-system names with their variants and assigned properties:

```
Section [Preset=Default]
    Show Indicator = false
    TopPadding     = Size=20
↔ SpacingHorizontal [Size=20]
↕ SpacingVertical [Size=12]
```

Styles arrive as tokens, not as raw values — a color comes back as the variable it is bound to, and text
comes back with the style name, which is where design systems usually spell out the target component:

```json
{
  "fills": [{ "type": "SOLID", "color": "#0e0e0e", "var": "text/primary" }],
  "typography": {
    "font": "SF Pro Text Regular",
    "size": 16,
    "line_height": 24,
    "style": "Paragraph/16–24 Primary Medium (Typography.Text view='primary-medium')"
  }
}
```

## Install

```bash
claude mcp add figma-clipboard --scope user -- npx -y figma-clipboard-mcp
```

Or, for any MCP client, in its config:

```json
{
  "mcpServers": {
    "figma-clipboard": {
      "command": "npx",
      "args": ["-y", "figma-clipboard-mcp"]
    }
  }
}
```

## Use

1. In Figma, select a screen, a frame or a component and press `⌘C`. Only what you selected ends up in
   the dump, so select generously.
2. Ask your assistant to read the design. Call `load_clipboard` again after every new copy.
3. For a whole file at once, use `File → Save local copy` in Figma and load that `.fig` — a snapshot taken
   at export time, with no live sync.

## Tools

| Tool | What it does |
|---|---|
| `load_clipboard` | Parse what you copied in Figma and make it the current scene |
| `load_fig_file(path)` | Same from a saved `.fig` — the whole file, all pages |
| `list_frames` | Top-level nodes with their `node_id` |
| `get_layer_tree(node_id, max_depth=4, style='layout')` | Layers with types, sizes, text and styles. `style`: `none` — structure only, `layout` — auto layout, gaps, padding, radii, `full` — plus fills, strokes, typography, effects |
| `get_node_styles(node_id)` | Every style of a single node at once |
| `get_component_tree(node_id, max_depth=6)` | Component instances only: component, variant, assigned properties |
| `get_component_definition(node_id \| component_key)` | A component's properties, variants and layers |
| `list_variables` | Variables: collection, type, per-mode values, aliases |
| `resolve_link(url)` | Locate a node in the current scene from a Figma URL |
| `get_clipboard_png` | PNG from the clipboard (`⌘⇧C` — Copy as PNG) |

The scene loads from the clipboard automatically when nothing is loaded yet.

Colors come back as the variable they are bound to (`text/primary`), with the hex alongside. Typography
comes back with the text style's name — where designers usually spell out the target code component:
`Paragraph/16–24 Primary Medium (Typography.Text view='primary-medium')`.

Working order for building a screen: `style: 'layout'` with `max_depth` 2–3 for the whole screen, then
`full` on the one block you are working on, or `get_node_styles` on a single node.

## How the format works

Figma's clipboard HTML carries a base64 `fig-kiwi` container: a signature, a version, then two blocks —
the schema and the scene. The schema block is deflate-compressed; the scene block is **zstd**. That second
detail is why older parsers fail: they were written when both blocks used deflate. Once decompressed, the
schema (a [kiwi](https://github.com/evanw/kiwi) binary schema) describes how to decode the scene into a
flat list of nodes, and this server rebuilds the hierarchy from each node's `parentIndex`.

| File | Responsibility |
|---|---|
| `src/index.js` | MCP tools and the current scene |
| `src/lib/figparse.js` | `fig-kiwi` container, clipboard HTML and PNG flavors |
| `src/lib/scene.js` | Node hierarchy, layer and component trees, variables |
| `src/lib/style.js` | Auto layout, radii, paints, typography, effects |
| `src/lib/link.js` | Figma URLs to `node_id` |

## Limitations

- A Figma URL is an address, not a source: nothing can be downloaded from it without the REST API. Copy
  first, then reference by link.
- Figma does not put the internals of library instances on the clipboard, so the component tree follows
  visible nesting only. Copy a component separately to look inside it.
- A library component's definition is available only if that component itself made it into the copy.
- Instance property names stay as ids when the component definition is outside the scene.
- Raster assets are not extracted: image fills expose a hash, the bytes sit in the scene's blobs.
- Clipboard reading is macOS only. On Linux and Windows, use `load_fig_file` with a saved `.fig`.
- The scene is a snapshot. Copy again after the design changes.

The format is undocumented and Figma can change it at any time — this reads what Figma places on your own
clipboard from a file you already have open. Prior art on the container format:
[fig-kiwi](https://www.npmjs.com/package/fig-kiwi) by Alex Fitzpatrick.

## Development

```bash
npm install
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout of the code and the house rules — chiefly: never
write to stdout, treat every raw Figma field as optional, and keep answers small enough for a model's
context.

## Checking it without an MCP client

```bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  sleep 1
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"load_clipboard","arguments":{}}}'
  sleep 3
} | npx figma-clipboard-mcp
```

The server logs to stderr only: stdout belongs to the MCP protocol.

## License

[MIT](LICENSE) © georg3103

Русская версия: [README.ru.md](README.ru.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)
