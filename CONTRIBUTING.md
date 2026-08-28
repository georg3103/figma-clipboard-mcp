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

Releases happen on their own. Land a change on `main`, and the release workflow works out the next
version from the commit messages, writes the changelog, publishes to npm and opens a GitHub release.

What a commit type does:

| Type | Effect |
|---|---|
| `fix:` | patch release |
| `feat:` | minor release |
| `BREAKING CHANGE:` in the body | major release |
| `chore:`, `ci:`, `docs:`, `test:`, `refactor:` | no release |

So the message is the version decision — worth a second of thought before committing.

One trap worth knowing: the words *breaking change* anywhere in a commit body mark the release as
major, even mid-sentence. Describing the convention inside a commit message is enough to trigger it.

Publishing authenticates through GitHub's OIDC token — npm's trusted publishing — so there is no
secret to store or rotate, and provenance is attached automatically. It is configured once on
npmjs.com, under the package's Settings, by naming this repository and `release.yml` as a trusted
publisher; renaming that workflow file means reconfiguring it there.

After a release the bot pushes a `chore(release):` commit with the new version and changelog, so
pull before starting the next change.
