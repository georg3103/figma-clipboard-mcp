# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-08-28

### Fixed

- The server now introduces itself over MCP with the package's own name and version, so client
  logs match what is installed.

## [0.1.0] - 2026-08-28

First public release.

### Added

- Reading Figma selections from the macOS clipboard (`⌘C`) and from `.fig` files saved through
  `File → Save local copy`, with no REST API, access token or paid seat involved.
- Decoding of the `fig-kiwi` container: deflate-compressed kiwi schema plus a zstd-compressed scene.
- Scene model rebuilt from each node's parent reference and fractional order index.
- Tools: `load_clipboard`, `load_fig_file`, `list_frames`, `get_layer_tree`, `get_node_styles`,
  `get_component_tree`, `get_component_definition`, `list_variables`, `resolve_link`,
  `get_clipboard_png`.
- Styles with three detail levels: structure, layout, and full paints, typography and effects.
- Paints resolved to the variable they are bound to, and text resolved to its text style name.

### Notes

- The package installs on any platform: clipboard reading needs macOS and says so at call time,
  while `.fig` files are parsed anywhere.

[Unreleased]: https://github.com/georg3103/figma-clipboard-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/georg3103/figma-clipboard-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/georg3103/figma-clipboard-mcp/releases/tag/v0.1.0
