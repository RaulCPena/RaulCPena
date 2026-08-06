#!/usr/bin/env node
/**
 * update-readme.js
 *
 * Pulls the latest posts from raulcpena.com/blog and rewrites the
 * "Latest from the blog" section of README.md, between the markers:
 *
 *   <!-- BLOG-POST-LIST:START -->
 *   <!-- BLOG-POST-LIST:END -->
 *
 * Run manually:   node scripts/update-readme.js
 * Run in CI:      see .github/workflows/update-readme.yml (runs on a
 *                 schedule and commits the change if the README moved).
 *
 * NOTE: raulcpena.com doesn't expose an RSS/Atom feed today. If one
 * gets added later (e.g. /rss.xml), swap fetchFromRSS() in as the
 * primary source instead of scraping the HTML, since it's more robust.
 * The HTML scrape below is a heuristic: it looks for links to
 * "/blog/<slug>" and a nearby date-looking string. If the site's
 * markup changes, adjust POST_LINK_RE / DATE_RE accordingly.
 */

const README_PATH = new URL("../README.md", import.meta.url);
const BLOG_URL = "https://www.raulcpena.com/blog";
const POST_COUNT = 5;

const START_MARKER = "<!-- BLOG-POST-LIST:START -->";
const END_MARKER = "<!-- BLOG-POST-LIST:END -->";

// Matches <a href="https://raulcpena.com/blog/some-post-slug">Title</a>
const POST_LINK_RE =
  /<a[^>]+href="(https?:\/\/(?:www\.)?raulcpena\.com\/blog\/[a-z0-9-]+)"[^>]*>([^<]+)<\/a>/gi;

// Very loose date matcher, e.g. "Aug 4, 2026" or "August 4, 2026"
const DATE_RE =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/;

async function fetchLatestPosts() {
  const res = await fetch(BLOG_URL, {
    headers: { "User-Agent": "readme-blog-sync-bot" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${BLOG_URL}: ${res.status}`);
  }
  const html = await res.text();

  const posts = [];
  const seen = new Set();
  let match;

  while ((match = POST_LINK_RE.exec(html)) !== null) {
    const [, url, title] = match;
    if (seen.has(url)) continue;
    seen.add(url);

    // Look at a small window of HTML right after the link for a date.
    const windowText = html.slice(match.index, match.index + 400);
    const dateMatch = windowText.match(DATE_RE);

    posts.push({
      title: title.trim(),
      url,
      date: dateMatch ? dateMatch[0] : null,
    });

    if (posts.length >= POST_COUNT) break;
  }

  return posts;
}

function formatList(posts) {
  return posts
    .map((p) => {
      const dateSuffix = p.date ? ` · ${p.date}` : "";
      return `- [${p.title}](${p.url})${dateSuffix}`;
    })
    .join("\n");
}

async function main() {
  const fs = await import("node:fs/promises");

  const posts = await fetchLatestPosts();
  if (posts.length === 0) {
    console.error("No posts found. Leaving README untouched.");
    process.exit(1);
  }

  const readme = await fs.readFile(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found in README.md. Add them first.");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const updated = `${before}\n${formatList(posts)}\n${after}`;

  if (updated === readme) {
    console.log("Blog list already up to date.");
    return;
  }

  await fs.writeFile(README_PATH, updated, "utf8");
  console.log(`Updated README.md with ${posts.length} posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
