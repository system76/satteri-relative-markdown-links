import { slug as githubSlug } from "github-slugger";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { markdownToMdast } from "satteri";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { CollectionOptions, SlugifyFn } from "./options.js";

const validMarkdownExtensions = [".md", ".mdx"];
const isWindows = process.platform === "win32";

// Inlined from `is-absolute-url`: an RFC 3986 scheme (`https:`, `mailto:`, …),
// with the Windows drive-path carve-out so `c:\...` isn't read as a `c:` scheme.
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const WINDOWS_PATH_REGEX = /^[a-zA-Z]:\\/;
const isAbsoluteUrl = (url: string): boolean =>
    !WINDOWS_PATH_REGEX.test(url) && ABSOLUTE_URL_REGEX.test(url);

/** POSIX-normalize a path; on Windows first converts `\` → `/`. */
export function normalizePath(npath: string): string {
    return path.posix.normalize(isWindows ? npath.replaceAll("\\", "/") : npath);
}

/** Replace the file extension (via `path.extname`) with `ext`. */
export const replaceExt = (npath: string, ext: string): string => {
    const oldExt = path.extname(npath);
    return oldExt ? npath.slice(0, -oldExt.length) + ext : npath + ext;
};

/**
 * A link is a rewritable relative markdown link when it is non-empty, not an
 * absolute URL, not an absolute filesystem path, and has a `.md`/`.mdx` extension.
 */
export const isValidRelativeLink = (link: string | null | undefined): boolean =>
    !!link &&
    !isAbsoluteUrl(link) &&
    !path.isAbsolute(link) &&
    validMarkdownExtensions.includes(path.extname(link));

/** `statSync(...).isFile()`; missing file (`ENOENT`) → `false`; other errors rethrown. */
export const isValidFile = (filePath: string): boolean => {
    if (!filePath) {
        return false;
    }
    try {
        return statSync(filePath).isFile();
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
};

/**
 * Split a URL into its path and its query/fragment. The path is `decodeURI`'d;
 * the query/fragment is everything from the first `?`/`#` (whichever comes
 * first), or `null` if neither is present.
 */
export const splitPathFromQueryAndFragment = (url: string): [string, string | null] => {
    const i = url.search(/[?#]/);
    return i === -1 ? [decodeURI(url), null] : [decodeURI(url.slice(0, i)), url.slice(i)];
};

/** Prepend the site `base` (if any) to the produced path, normalizing the result. */
export const normalizeOutputPath = (
    initialPath: string,
    collectionOptions: Pick<CollectionOptions, "base">,
): string => {
    if (!initialPath) {
        return initialPath;
    }
    if (!collectionOptions.base) {
        return normalizePath(initialPath);
    }
    return path.posix.normalize(path.posix.join("/", collectionOptions.base, initialPath));
};

/** Slugify each segment, join with `/`, then strip a trailing `/index`. Defaults
 *  to github-slugger (Astro-compatible) unless a custom `slugify` is supplied. */
export const generateSlug = (pathSegments: string[], slugify: SlugifyFn = githubSlug): string => {
    return pathSegments
        .map((segment) => slugify(segment))
        .join("/")
        .replace(/\/index$/, "");
};

/** Frontmatter `slug` wins if present; otherwise the generated slug is used. */
export const resolveSlug = (generatedSlug: string, frontmatterSlug: unknown): string => {
    return z.string().default(generatedSlug).parse(frontmatterSlug);
};

/**
 * Apply the trailing-slash policy to `resolvedUrl`:
 *   - `"always"` — ensure exactly one trailing slash.
 *   - `"never"`  — strip a trailing slash if present.
 *   - `"ignore"` — make the result match `origUrl`'s trailing-slash presence.
 */
export const applyTrailingSlash = (
    origUrl: string,
    resolvedUrl: string,
    trailingSlash: "ignore" | "always" | "never" = "ignore",
): string => {
    const hasTrailingSlash = resolvedUrl.endsWith("/");
    if (trailingSlash === "always") {
        return hasTrailingSlash ? resolvedUrl : resolvedUrl + "/";
    }
    if (trailingSlash === "never") {
        return hasTrailingSlash ? resolvedUrl.slice(0, -1) : resolvedUrl;
    }
    const hadTrailingSlash = origUrl.endsWith("/");
    if (hadTrailingSlash && !hasTrailingSlash) {
        return resolvedUrl + "/";
    }
    if (!hadTrailingSlash && hasTrailingSlash) {
        return resolvedUrl.slice(0, -1);
    }
    return resolvedUrl;
};

/** Skip files where any path segment starts with `_` (private-file convention). */
export function shouldProcessFile(npath: string): boolean {
    return !npath.split(path.sep).some((p) => p && p.startsWith("_"));
}

/** `""` when `collectionBase === false`, else `"/" + collectionName`. */
export function resolveCollectionBase(
    collectionOptions: Pick<CollectionOptions, "collectionBase" | "collectionName">,
): string {
    return collectionOptions.collectionBase === false
        ? ""
        : "/" + collectionOptions.collectionName;
}

const matterCache = new Map<string, Record<string, unknown>>();
const matterCacheEnabled = process.env.SMRL_MATTER_CACHE_DISABLE !== "true";

/**
 * Parse the frontmatter of a target markdown file. The block is extracted with
 * satteri's own parser (`markdownToMdast`, reading the leading `yaml`/`toml`
 * node) and its raw contents are parsed with the `yaml` or `smol-toml` library.
 * Results are cached per path unless `SMRL_MATTER_CACHE_DISABLE=true`.
 */
export function getMatter(npath: string): Record<string, unknown> {
    if (matterCacheEnabled) {
        const cached = matterCache.get(npath);
        if (cached) {
            return cached;
        }
    }
    const source = readFileSync(npath, "utf8");
    const root = markdownToMdast(source, { features: { frontmatter: true } });
    const children = "children" in root ? root.children : [];
    const fmNode = children.find((child) => child.type === "yaml" || child.type === "toml");

    let data: Record<string, unknown> = {};
    if (fmNode && "value" in fmNode) {
        const parsed = fmNode.type === "toml" ? parseToml(fmNode.value) : parseYaml(fmNode.value);
        if (parsed && typeof parsed === "object") {
            data = parsed as Record<string, unknown>;
        }
    }
    if (matterCacheEnabled) {
        matterCache.set(npath, data);
    }
    return data;
}
