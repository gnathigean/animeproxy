function rewritePlaylistUrls(playlistText, baseUrl) {
  const base = new URL(baseUrl);
  return playlistText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed === "") return line;

      try {
        const resolvedUrl = new URL(trimmed, base).href;
        return `/api/v1/streamingProxy?url=${encodeURIComponent(resolvedUrl)}`;
      } catch (e) {
        console.warn('Failed to resolve URL:', trimmed);
        return line; // Return original line if URL resolution fails
      }
    })
    .join("\n");
}

module.exports = { rewritePlaylistUrls };
