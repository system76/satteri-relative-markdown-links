# @system76/satteri-relative-markdown-links

A [satteri](https://satteri.bruits.org) plugin that turns relative links between Markdown
files into the URLs those files actually resolve to.

Designed with [Astro](https://astro.build) in mind. The URLs it produces match what Astro
generates for the same file, so it's a drop-in for an Astro content collection. It only
depends on satteri though, so it works with anything that uses satteri as its Markdown processor,
Astro or not.

If you write a link like `[the other post](./other.md)` in your Markdown, the raw href points
at a file on disk, not at a page. This plugin rewrites it to the real page path at build time:

```
./other.md            ->  /blog/other
./other.md?tab=2#top  ->  /blog/other?tab=2#top
../guides/intro.md    ->  /guides/intro
```

Query strings and fragments are preserved. Frontmatter `slug`, a custom collection layout, a
site base path, and a trailing-slash policy are all taken into account.

It's a port of [`astro-rehype-relative-markdown-links`](https://github.com/vernak2539/astro-rehype-relative-markdown-links)
(a rehype plugin for Astro) to satteri's mdast plugin API.

## Install

```sh
pnpm add @system76/satteri-relative-markdown-links satteri
```

`satteri` is a peer dependency and should be satisfied by @astrojs/markdown-satteri or installing it seperatly.

Supported satteri versions are `^0.9.0 || ^0.10.0 || ^0.11.5`. Versions 0.11.1, 0.11.3 and 0.11.4 are left out because they were published without their native bindings and can't be loaded.

## Usage

### In Astro

Astro runs satteri through the [`@astrojs/markdown-satteri`](https://www.npmjs.com/package/@astrojs/markdown-satteri)
integration, which swaps satteri in as the Markdown processor. Register this plugin in that
processor's `mdastPlugins`:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { satteriRelativeMarkdownLinks } from "@system76/satteri-relative-markdown-links";

export default defineConfig({
    markdown: {
        processor: satteri({
            mdastPlugins: [satteriRelativeMarkdownLinks()],
        }),
    },
});
```

The defaults match Astro's own conventions, so a link `./intro.md` inside
`src/content/guides/setup.md` resolves to `/guides/intro` with no configuration. See
[Options](#options) below for the full list; if you set `base` or `trailingSlash` in
`astro.config.mjs`, pass the same values here so the URLs match:

```js
satteriRelativeMarkdownLinks({ base: "/docs", trailingSlash: "always" });
// ./intro.md in src/content/guides/setup.md -> /docs/guides/intro/
```

When a collection's URL doesn't match its directory name, or you route one at the site root,
use `collections`:

```js
satteriRelativeMarkdownLinks({
    collections: {
        docs: { name: "documentation" }, // src/content/docs/ref.md    -> /documentation/ref
        pages: { base: false },          // src/content/pages/about.md  -> /about
    },
});
```

### Standalone

Nothing here depends on Astro — the `src/content/<collection>` layout is just the default.
Pass the plugin to `markdownToHtml` (or `mdxToJs`), along with the `fileURL` of the file you're
compiling:

```ts
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
import { satteriRelativeMarkdownLinks } from "@system76/satteri-relative-markdown-links";

const path = "src/content/blog/post.md";
const source = await readFile(path, "utf8");

const { html } = markdownToHtml(source, {
    mdastPlugins: [satteriRelativeMarkdownLinks()],
    fileURL: pathToFileURL(path),
});
```

The `fileURL` is required here, outside Astro there's nothing else to hand satteri that file's
URL, so without it the plugin has nothing to resolve links against and leaves them untouched.

If you don't organize content into collections, point `contentDir` at your Markdown root and
drop the collection prefix:

```ts
satteriRelativeMarkdownLinks({
    contentDir: "./docs",
    collectionBase: false,
});
// ./other.md from docs/api.md -> /other
```

The URLs still follow github-slugger by default. If your router slugs paths differently, pass
`slugify` to match it — see [Custom slugs](#custom-slugs) below.

## What gets rewritten

A link is rewritten only when it points at a `.md`/`.mdx` file that exists on disk relative to
the current file. Everything else is left as-is:

- absolute URLs (`https://…`, `mailto:…`)
- absolute paths (`/docs/x.md`)
- links to non-Markdown files (`./data.json`)
- links to files that don't exist
- anything under a `_`-prefixed directory or file (the private-file convention)

Both inline links (`[x](./y.md)`) and reference-style links (`[x][y]` with `[y]: ./z.md`) are
handled. Images are not touched.

## Options

```ts
satteriRelativeMarkdownLinks({
    srcDir: "./src",
    trailingSlash: "never",
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `srcDir` | `string` | `"./src"` | Source directory. Content is resolved at `<srcDir>/content`. Absolute, or relative to the working directory. |
| `contentDir` | `string` | `<srcDir>/content` | Content root, if you don't follow the `src/content` layout. Set this to point at any directory whose subdirectories are your collections. |
| `collectionBase` | `"name" \| false` | `"name"` | `"name"` prefixes the collection directory name onto the URL (`/docs/guide`); `false` treats the collection as the site root (`/guide`). |
| `collections` | `Record<string, { base?, name? }>` | `{}` | Per-collection overrides, keyed by the directory name on disk. `base` overrides `collectionBase`; `name` overrides the name used in the URL. |
| `base` | `string` | — | Site base path prepended to every generated URL (e.g. `/docs`). |
| `trailingSlash` | `"ignore" \| "always" \| "never"` | `"ignore"` | `"always"`/`"never"` force the trailing slash. `"ignore"` keeps whatever the link (or custom slug) already had. |
| `slugify` | `(segment: string) => string` | github-slugger | Slugs a single path segment. See [Custom slugs](#custom-slugs). |

## Custom slugs

By default each path segment is run through [`github-slugger`](https://github.com/Flet/github-slugger),
which is the same thing Astro uses for content collections. If your site's router slugs URLs
some other way, pass your own function:

```ts
satteriRelativeMarkdownLinks({
    slugify: (segment) => segment.toLowerCase().replace(/\s+/g, "_"),
});
```

It's called per segment. Joining the segments with `/` and collapsing a trailing `/index` are
handled for you, so you only need to worry about how one segment becomes a slug.

A target file can also override its own slug from frontmatter (YAML or TOML), which wins over
whatever `slugify` would produce:

```md
---
slug: custom-path
---
```

A link to that file resolves to `/<collection>/custom-path`.

## Environment variables

- `NODE_DEBUG=satteri-relative-markdown-links` prints a trace for each link it processes.
- `SRML_MATTER_CACHE_DISABLE=true` disables the in-memory cache of target-file frontmatter
  (it re-reads every file instead). The cache is fine for a normal build; disable it if you're
  editing files in a long-running process and need fresh reads.

## Credits

Port of [`astro-rehype-relative-markdown-links`](https://github.com/vernak2539/astro-rehype-relative-markdown-links).
The rewrite logic follows that plugin closely.

## License

GPL-3.0
