# @system76/satteri-relative-markdown-links

A [satteri](https://satteri.bruits.org) plugin that turns relative links between Markdown
files into the URLs those files actually resolve to.

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
(a rehype plugin for Astro) to satteri's mdast plugin API. The URL it produces matches what
Astro would generate for the same file, so it's a drop-in for that workflow, but it also works
on its own outside Astro.

## Install

```sh
pnpm add @system76/satteri-relative-markdown-links satteri
```

`satteri` is a peer dependency. This package is ESM only.

## Usage

Pass the plugin to `markdownToHtml` (or `mdxToJs`), and give it the `fileURL` of the file
you're compiling:

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

The `fileURL` is required. The plugin resolves relative links against the directory of that
file, so without it there's nothing to resolve and links are left untouched.

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
| `slugify` | `(segment: string) => string` | github-slugger | Slugs a single path segment. See below. |

### Custom slugs

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

### Frontmatter slug

If a target file sets `slug` in its frontmatter (YAML or TOML), that wins over the generated
slug:

```md
---
slug: custom-path
---
```

A link to that file resolves to `/<collection>/custom-path`.

## Using it in Astro

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

You don't pass `fileURL` here. Astro renders each content file through the processor and hands
satteri that file's URL, which the plugin reads to resolve links.

The defaults line up with Astro's own conventions: content at `src/content/<collection>`, the
collection directory as the first URL segment, and github-slugger for slugs (the same slugger
Astro uses for content entries). So a link `./intro.md` inside `src/content/guides/setup.md`
resolves to `/guides/intro`. If you set `base` or `trailingSlash` in `astro.config.mjs`, pass
the same values to the plugin so the URLs match:

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

## Using it standalone

Nothing here depends on Astro. The `src/content/<collection>` layout is just the default. When
you call satteri yourself, register the plugin in `mdastPlugins` and pass the `fileURL` of the
file you're compiling (see [Usage](#usage) above) — that's the piece the Astro integration
otherwise handles for you.

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
`slugify` to match it.

## Environment variables

- `NODE_DEBUG=satteri-relative-markdown-links` prints a trace for each link it processes.
- `SMRL_MATTER_CACHE_DISABLE=true` disables the in-memory cache of target-file frontmatter
  (it re-reads every file instead). The cache is fine for a normal build; disable it if you're
  editing files in a long-running process and need fresh reads.

## Credits

Port of [`astro-rehype-relative-markdown-links`](https://github.com/vernak2539/astro-rehype-relative-markdown-links).
The rewrite logic follows that plugin closely.

## License

GPL-3.0
