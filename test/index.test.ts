import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
// The plugin is imported from the built artifact: its runtime `./options.js` /
// `./utils.js` specifiers are the TS `.js`-import convention, which Node's native
// type-stripping does not resolve to the `.ts` sources. `pretest` runs `tsc` first.
import { satteriRelativeMarkdownLinks, type Options } from "../dist/index.js";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const SRC = path.join(FIXTURES, "src");
const CONTENT = path.join(SRC, "content");
/** Location used as the compiled document's `fileURL`; relative links resolve against its dir. */
const BLOG_POST = path.join(CONTENT, "blog", "post.md");
const STANDALONE = path.join(FIXTURES, "standalone");

type RenderOptions = Options & {
    /** On-disk path used as the source document's `fileURL`. Defaults to the blog post. */
    from?: string;
    /** Set false to omit `fileURL` entirely (simulates a compile with no document URL). */
    withFileURL?: boolean;
};

/** Compile `source` through satteri with the plugin registered, returning the HTML. */
function render(source: string, options: RenderOptions = {}): string {
    const { from = BLOG_POST, withFileURL = true, ...pluginOptions } = options;
    const compileOptions: Parameters<typeof markdownToHtml>[1] = {
        mdastPlugins: [satteriRelativeMarkdownLinks({ srcDir: SRC, ...pluginOptions })],
    };
    if (withFileURL) {
        compileOptions.fileURL = pathToFileURL(from);
    }
    return markdownToHtml(source, compileOptions).html;
}

describe("satteriRelativeMarkdownLinks (factory)", () => {
    test("returns a plugin definition with link and definition visitors", () => {
        const plugin = satteriRelativeMarkdownLinks();
        assert.equal(plugin.name, "satteri-relative-markdown-links");
        assert.equal(typeof plugin.link, "function");
        assert.equal(typeof plugin.definition, "function");
    });

    test("throws on invalid options (delegates to validateOptions)", () => {
        // @ts-expect-error — exercising runtime validation with a bad value
        assert.throws(() => satteriRelativeMarkdownLinks({ trailingSlash: "sometimes" }));
    });
});

describe("rewriting relative markdown links", () => {
    test("rewrites a relative link to its collection page path", () => {
        const html = render("[other](./other.md)");
        assert.match(html, /href="\/blog\/other"/);
    });

    test("preserves a query string and fragment", () => {
        const html = render("[q](./other.md?tab=2#top)");
        assert.match(html, /href="\/blog\/other\?tab=2#top"/);
    });

    test("strips a trailing `/index` from a directory index target", () => {
        const html = render("[nested](./nested/index.md)");
        assert.match(html, /href="\/blog\/nested"/);
    });

    test("rewrites a reference-style link via its definition", () => {
        const html = render("[other][ref]\n\n[ref]: ./other.md");
        assert.match(html, /href="\/blog\/other"/);
    });
});

describe("links left untouched", () => {
    test("absolute URLs", () => {
        const html = render("[x](https://example.com/y.md)");
        assert.match(html, /href="https:\/\/example\.com\/y\.md"/);
    });

    test("mailto: links", () => {
        const html = render("[mail](mailto:a@b.md)");
        assert.match(html, /href="mailto:a@b\.md"/);
    });

    test("absolute filesystem paths", () => {
        const html = render("[abs](/docs/other.md)");
        assert.match(html, /href="\/docs\/other\.md"/);
    });

    test("non-markdown files", () => {
        const html = render("[data](./data.json)");
        assert.match(html, /href="\.\/data\.json"/);
    });

    test("links to files that do not exist", () => {
        const html = render("[missing](./nope.md)");
        assert.match(html, /href="\.\/nope\.md"/);
    });

    test("targets under a `_`-prefixed directory", () => {
        const html = render("[draft](./_drafts/hidden.md)");
        assert.match(html, /href="\.\/_drafts\/hidden\.md"/);
    });

    test("targets that escape the content directory", () => {
        const html = render("[outside](../../outside.md)");
        assert.match(html, /href="\.\.\/\.\.\/outside\.md"/);
    });

    test("targets in the content root when collectionBase is 'name'", () => {
        const html = render("[root](../root.md)");
        assert.match(html, /href="\.\.\/root\.md"/);
    });

    test("all links when no fileURL is supplied", () => {
        const html = render("[other](./other.md)", { withFileURL: false });
        assert.match(html, /href="\.\/other\.md"/);
    });
});

describe("frontmatter slug", () => {
    test("a YAML slug wins over the generated slug", () => {
        const html = render("[custom](./custom-slug.md)");
        assert.match(html, /href="\/blog\/custom-path"/);
    });

    test("a TOML slug wins over the generated slug", () => {
        const html = render("[toml](./toml-slug.md)");
        assert.match(html, /href="\/blog\/toml-path"/);
    });
});

describe("collection base handling", () => {
    test("collectionBase: false drops the collection prefix", () => {
        const html = render("[other](./other.md)", { collectionBase: false });
        assert.match(html, /href="\/other"/);
    });

    test("a per-collection `name` override renames the URL segment", () => {
        const html = render("[ref](../docs/ref.md)", {
            collections: { docs: { name: "documentation" } },
        });
        assert.match(html, /href="\/documentation\/ref"/);
    });

    test("a per-collection `base: false` override routes at the site root", () => {
        const html = render("[about](../pages/about.md)", {
            collections: { pages: { base: false } },
        });
        assert.match(html, /href="\/about"/);
    });
});

describe("trailing-slash policy", () => {
    test("`always` appends a trailing slash", () => {
        const html = render("[other](./other.md)", { trailingSlash: "always" });
        assert.match(html, /href="\/blog\/other\/"/);
    });

    test("`never` removes a trailing slash from the source link", () => {
        const html = render("[other](./other.md/)", { trailingSlash: "never" });
        assert.match(html, /href="\/blog\/other"/);
    });

    test("`ignore` mirrors the source link's trailing slash", () => {
        const html = render("[other](./other.md/)", { trailingSlash: "ignore" });
        assert.match(html, /href="\/blog\/other\/"/);
    });
});

describe("site base path", () => {
    test("prepends the configured base", () => {
        const html = render("[other](./other.md)", { base: "/docs" });
        assert.match(html, /href="\/docs\/blog\/other"/);
    });
});

describe("standalone layout (contentDir + collectionBase: false)", () => {
    test("resolves against a custom content root with no collection prefix", () => {
        const html = render("[other](./other.md)", {
            from: path.join(STANDALONE, "api.md"),
            contentDir: STANDALONE,
            collectionBase: false,
        });
        assert.match(html, /href="\/other"/);
    });
});
