import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mergeCollectionOptions, validateOptions } from "../src/options.ts";

describe("validateOptions", () => {
    test("applies defaults when given nothing", () => {
        const options = validateOptions(undefined);
        assert.equal(options.srcDir, "./src");
        assert.equal(options.collectionBase, "name");
        assert.deepEqual(options.collections, {});
        assert.equal(options.trailingSlash, "ignore");
        assert.equal(options.contentDir, undefined);
    });

    test("passes provided values through", () => {
        const options = validateOptions({
            srcDir: "./site",
            contentDir: "./docs",
            collectionBase: false,
            trailingSlash: "never",
            base: "/app",
        });
        assert.equal(options.srcDir, "./site");
        assert.equal(options.contentDir, "./docs");
        assert.equal(options.collectionBase, false);
        assert.equal(options.trailingSlash, "never");
        assert.equal(options.base, "/app");
    });

    test("accepts a function slugify", () => {
        const slugify = (segment: string): string => segment.toUpperCase();
        const options = validateOptions({ slugify });
        assert.equal(options.slugify, slugify);
    });

    test("throws on an invalid collectionBase", () => {
        // @ts-expect-error — exercising runtime validation with a bad value
        assert.throws(() => validateOptions({ collectionBase: "root" }));
    });

    test("throws on an invalid trailingSlash", () => {
        // @ts-expect-error — exercising runtime validation with a bad value
        assert.throws(() => validateOptions({ trailingSlash: "sometimes" }));
    });

    test("throws when slugify is not a function", () => {
        // @ts-expect-error — exercising runtime validation with a bad value
        assert.throws(() => validateOptions({ slugify: "nope" }));
    });
});

describe("mergeCollectionOptions", () => {
    test("defaults name to the on-disk name and base to the top-level collectionBase", () => {
        const options = validateOptions({ collectionBase: "name" });
        const merged = mergeCollectionOptions("blog", options);
        assert.equal(merged.collectionName, "blog");
        assert.equal(merged.collectionBase, "name");
    });

    test("applies a per-collection name override", () => {
        const options = validateOptions({ collections: { docs: { name: "documentation" } } });
        const merged = mergeCollectionOptions("docs", options);
        assert.equal(merged.collectionName, "documentation");
        assert.equal(merged.collectionBase, "name");
    });

    test("applies a per-collection base override", () => {
        const options = validateOptions({ collections: { pages: { base: false } } });
        const merged = mergeCollectionOptions("pages", options);
        assert.equal(merged.collectionBase, false);
        assert.equal(merged.collectionName, "pages");
    });

    test("carries the rest of the validated options through", () => {
        const options = validateOptions({ base: "/app", trailingSlash: "always" });
        const merged = mergeCollectionOptions("blog", options);
        assert.equal(merged.base, "/app");
        assert.equal(merged.trailingSlash, "always");
    });
});
