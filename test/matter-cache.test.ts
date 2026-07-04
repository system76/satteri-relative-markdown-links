import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// `matterCacheEnabled` is read from the environment at module-evaluation time, so
// this file sets the disable flag *before* dynamically importing utils, and does
// nothing else — `node --test` runs each test file in its own process, keeping the
// mutation isolated from the cache-enabled assertions in utils.test.ts.
process.env.SMRL_MATTER_CACHE_DISABLE = "true";

const fixture = fileURLToPath(
    new URL("./fixtures/src/content/blog/custom-slug.md", import.meta.url),
);

test("getMatter re-reads (no shared reference) when SMRL_MATTER_CACHE_DISABLE=true", async () => {
    const { getMatter } = await import("../src/utils.ts");
    const first = getMatter(fixture);
    const second = getMatter(fixture);
    // Same parsed data...
    assert.deepEqual(first, second);
    // ...but a fresh object each call, proving the cache was bypassed.
    assert.notEqual(first, second);
});
