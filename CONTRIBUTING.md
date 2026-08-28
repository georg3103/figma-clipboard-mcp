# Contributing

Thanks for looking. This is a small project with a narrow job: turn what Figma puts on your clipboard
into something an assistant can build a screen from.

## Getting set up

```bash
git clone git@github.com:georg3103/figma-clipboard-mcp.git
cd figma-clipboard-mcp
npm install
npm test
```

To try the server against a real design, copy something in Figma (`⌘C`) and run:

```bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  sleep 1
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"load_clipboard","arguments":{}}}'
  sleep 3
} | node src/index.js
```

A saved `.fig` file (Figma: `File → Save local copy`) makes a stable fixture — handy when you want to
re-run the same scene while changing a mapper.

## Where things live

| File | Responsibility |
|---|---|
| `src/index.js` | MCP tools and the current scene |
| `src/lib/figparse.js` | `fig-kiwi` container, clipboard flavors |
| `src/lib/scene.js` | Node hierarchy, layer and component trees, variables |
| `src/lib/style.js` | Auto layout, radii, paints, typography, effects |
| `src/lib/link.js` | Figma URLs to node ids |

Adding a new piece of design data usually means: find the field on a raw node, write a mapper in
`style.js` or `scene.js`, surface it from a tool in `index.js`, and cover the mapper with a test.

## House rules

- **Never write to stdout.** It carries the MCP protocol. Diagnostics go to `console.error`.
- **Treat every raw field as optional.** Figma omits defaults, and the format changes without notice.
  A missing field means the key is left out of the answer, not `null` or a thrown error.
- **Keep answers small.** These outputs are read by a language model with a limited context. Prefer
  names over ids, skip what is at its default, and put anything verbose behind a detail level.
- **Errors are instructions.** "Copy the node in Figma and try again" beats "unexpected token".

## Pull requests

Run `npm test` and say in the description what you checked against a real design. Small, focused
changes get merged faster than large ones.

## Releasing

Releases run off tags. Bumping the version, tagging and pushing is the whole ceremony:

```bash
# edit CHANGELOG.md: move Unreleased items under the new version
npm version patch     # or minor / major - commits and tags for you
git push --follow-tags
```

Pushing a `v*` tag runs the release workflow, which checks the tag against the version in
`package.json`, runs the tests, publishes to npm with provenance, and opens a GitHub release
with the notes taken from that version's section of the changelog.

Publishing authenticates through GitHub's OIDC token — npm's trusted publishing — so there is no
secret to store or rotate, and provenance is attached automatically. It is configured once on
npmjs.com, under the package's Settings, by naming this repository and `release.yml` as a trusted
publisher. Re-pushing a tag is safe: the publish step is skipped when that version already exists
on the registry.
