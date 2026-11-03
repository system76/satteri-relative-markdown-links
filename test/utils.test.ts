import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    applyTrailingSlash,
    generateSlug,
    getMatter,
    isValidFile,
    isValidRelativeLink,
    normalizeOutputPath,
    normalizePath,
    replaceExt,
    resolveCollectionBase,
    resolveSlug,
    shouldProcessFile,
    splitPathFromQueryAndFragment,
} from "../src/utils.ts";

/** Absolute path to a file inside the fixture content tree. */
const fixture = (relative: string): string =>
    fileURLToPath(new URL(`./fixtures/${relative}`, import.meta.url));

describe("normalizePath", () => {
    test("collapses `.` and `..` segments (POSIX)", () => {
        assert.equal(normalizePath("a/./b/../c"), "a/c");
    });

    test("normalizes an already-clean path unchanged", () => {
        assert.equal(normalizePath("a/b/c"), "a/b/c");
    });
});

describe("replaceExt", () => {
    test("replaces an existing extension", () => {
        assert.equal(replaceExt("a.md", ".html"), "a.html");
    });

    test("strips the extension when replacing with an empty string", () => {
        assert.equal(replaceExt("dir/file.md", ""), "dir/file");
    });

    test("appends when the path has no extension", () => {
        assert.equal(replaceExt("a", ".md"), "a.md");
    });
});

describe("isValidRelativeLink", () => {
    test("accepts relative .md and .mdx links", () => {
        assert.equal(isValidRelativeLink("./x.md"), true);
        assert.equal(isValidRelativeLink("../a/b.mdx"), true);
        assert.equal(isValidRelativeLink("x.md"), true);
    });

    test("rejects absolute URLs and mailto:", () => {
        assert.equal(isValidRelativeLink("https://example.com/y.md"), false);
        assert.equal(isValidRelativeLink("mailto:a@b.md"), false);
    });

    test("rejects absolute filesystem paths", () => {
        assert.equal(isValidRelativeLink("/docs/x.md"), false);
    });

    test("rejects non-markdown extensions", () => {
        assert.equal(isValidRelativeLink("./data.json"), false);
        assert.equal(isValidRelativeLink("./page.html"), false);
    });

    test("rejects empty, null, and undefined", () => {
        assert.equal(isValidRelativeLink(""), false);
        assert.equal(isValidRelativeLink(null), false);
        assert.equal(isValidRelativeLink(undefined), false);
    });
});

describe("isValidFile", () => {
    test("returns true for an existing file", () => {
        assert.equal(isValidFile(fixture("src/content/blog/other.md")), true);
    });

    test("returns false for a missing file (ENOENT)", () => {
        assert.equal(isValidFile(fixture("src/content/blog/does-not-exist.md")), false);
    });

    test("returns false for a directory", () => {
        assert.equal(isValidFile(fixture("src/content/blog")), false);
    });

    test("returns false for an empty path", () => {
        assert.equal(isValidFile(""), false);
    });

    test("rethrows non-ENOENT errors (e.g. ENOTDIR through a file)", () => {
        // `other.md` is a file, so treating it as a directory yields ENOTDIR, which
        // is not swallowed the way a missing file (ENOENT) is.
        assert.throws(() => isValidFile(fixture("src/content/blog/other.md/nope")), {
            code: "ENOTDIR",
        });
    });

    test(
        "on Windows, returns false (not throws) for a path missing several levels deep",
        // Windows reports ENOENT for both "genuinely missing" and "file treated as
        // a directory" (see ancestorIsFile's doc comment in src/utils.ts), so this
        // exercises the walk-up-multiple-ancestors branch of that disambiguation —
        // a single missing level (the ENOENT test above) only exercises one loop
        // iteration and wouldn't catch a bug in the "keep walking up" logic.
        { skip: process.platform !== "win32" && "ancestorIsFile's walk-up loop is Windows-only" },
        () => {
            assert.equal(
                isValidFile(fixture("src/content/blog/does-not-exist/also-missing/deep.md")),
                false,
            );
        },
    );
});

describe("splitPathFromQueryAndFragment", () => {
    test("returns null when there is no query or fragment", () => {
        assert.deepEqual(splitPathFromQueryAndFragment("a.md"), ["a.md", null]);
    });

    test("splits a query string", () => {
        assert.deepEqual(splitPathFromQueryAndFragment("a.md?tab=2"), ["a.md", "?tab=2"]);
    });

    test("splits a fragment", () => {
        assert.deepEqual(splitPathFromQueryAndFragment("a.md#top"), ["a.md", "#top"]);
    });

    test("splits at the first of query/fragment and keeps the rest together", () => {
        assert.deepEqual(splitPathFromQueryAndFragment("a.md?tab=2#top"), ["a.md", "?tab=2#top"]);
    });

    test("decodeURI-decodes the path part", () => {
        assert.deepEqual(splitPathFromQueryAndFragment("a%20b.md"), ["a b.md", null]);
    });
});

describe("normalizeOutputPath", () => {
    test("passes an empty path through untouched", () => {
        assert.equal(normalizeOutputPath("", { base: undefined }), "");
    });

    test("normalizes without a base", () => {
        assert.equal(normalizeOutputPath("/blog/./other", { base: undefined }), "/blog/other");
    });

    test("prepends and normalizes the site base", () => {
        assert.equal(normalizeOutputPath("/blog/other", { base: "/docs" }), "/docs/blog/other");
    });
});

describe("generateSlug", () => {
    test("slugs each segment and joins with `/` (github-slugger default)", () => {
        assert.equal(generateSlug(["blog", "My First Post"]), "blog/my-first-post");
    });

    test("strips a trailing `/index`", () => {
        assert.equal(generateSlug(["blog", "index"]), "blog");
    });

    test("uses a custom slugify function per segment", () => {
        const slugify = (segment: string): string => segment.replace(/\s+/g, "_");
        assert.equal(generateSlug(["Hello World", "A B"], slugify), "Hello_World/A_B");
    });
});

describe("resolveSlug", () => {
    test("uses the frontmatter slug when it is a string", () => {
        assert.equal(resolveSlug("generated", "custom-path"), "custom-path");
    });

    test("falls back to the generated slug when frontmatter is undefined", () => {
        assert.equal(resolveSlug("generated", undefined), "generated");
    });

    test("throws when the frontmatter slug is a non-string, non-undefined value", () => {
        assert.throws(() => resolveSlug("generated", 123));
    });
});

describe("applyTrailingSlash", () => {
    test("`always` ensures exactly one trailing slash", () => {
        assert.equal(applyTrailingSlash("x", "/b", "always"), "/b/");
        assert.equal(applyTrailingSlash("x", "/b/", "always"), "/b/");
    });

    test("`never` strips a trailing slash", () => {
        assert.equal(applyTrailingSlash("x", "/b/", "never"), "/b");
        assert.equal(applyTrailingSlash("x", "/b", "never"), "/b");
    });

    test("`ignore` mirrors the original URL's trailing slash", () => {
        assert.equal(applyTrailingSlash("a/", "/b", "ignore"), "/b/");
        assert.equal(applyTrailingSlash("a", "/b/", "ignore"), "/b");
        assert.equal(applyTrailingSlash("a/", "/b/", "ignore"), "/b/");
        assert.equal(applyTrailingSlash("a", "/b", "ignore"), "/b");
    });

    test("defaults to `ignore`", () => {
        assert.equal(applyTrailingSlash("a/", "/b"), "/b/");
    });
});

describe("shouldProcessFile", () => {
    test("processes a normal path", () => {
        assert.equal(shouldProcessFile("blog/other.md"), true);
    });

    test("skips a file under a `_`-prefixed directory", () => {
        assert.equal(shouldProcessFile(path.join("blog", "_drafts", "hidden.md")), false);
    });

    test("skips a `_`-prefixed file", () => {
        assert.equal(shouldProcessFile(path.join("blog", "_hidden.md")), false);
    });
});

describe("resolveCollectionBase", () => {
    test("returns an empty string when collectionBase is false", () => {
        assert.equal(resolveCollectionBase({ collectionBase: false, collectionName: "blog" }), "");
    });

    test("returns `/<name>` when collectionBase is 'name'", () => {
        assert.equal(
            resolveCollectionBase({ collectionBase: "name", collectionName: "blog" }),
            "/blog",
        );
    });
});

describe("getMatter", () => {
    test("parses YAML frontmatter", () => {
        assert.deepEqual(getMatter(fixture("src/content/blog/custom-slug.md")), {
            title: "Custom Slug",
            slug: "custom-path",
        });
    });

    test("parses TOML frontmatter", () => {
        // smol-toml returns a null-prototype object, spread it to compare contents only.
        assert.deepEqual(
            { ...getMatter(fixture("src/content/blog/toml-slug.md")) },
            {
                title: "Toml Slug",
                slug: "toml-path",
            },
        );
    });

    test("returns an empty object when there is no frontmatter", () => {
        assert.deepEqual(getMatter(fixture("src/content/blog/other.md")), {});
    });

    test("caches by path (default cache enabled)", () => {
        const p = fixture("src/content/blog/custom-slug.md");
        assert.equal(getMatter(p), getMatter(p));
    });
});
