// Figma links: a URL yields a file key and a node id, which address a node in an already loaded scene.
// Nothing is downloaded from the link — that would need the REST API, which this project deliberately avoids.

/** Pulls the file key and node id out of a link: node-id=641-38302 becomes 641:38302. */
export function parseFigmaUrl(url) {
  const fileKey = (url.match(/\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,})/) || [])[1];
  if (!fileKey) {
    throw new Error(`This does not look like a Figma link: ${url}`);
  }

  const rawNode = (url.match(/[?&]node-id=([^&]+)/) || [])[1];
  const nodeId = rawNode ? decodeURIComponent(rawNode).replace('-', ':') : null;
  return { fileKey, nodeId };
}
