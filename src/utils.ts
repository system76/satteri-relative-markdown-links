import { slug as githubSlug } from "github-slugger";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { markdownToMdast } from "satteri";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { CollectionOptions, SlugifyFn } from "./options.js";

const validMarkdownExtensions = [".md", ".mdx"];
const isWindows = typeof process !== "undefined" && process.platform === "win32";
const windowsSlashRE = /\\/g;

// Inlined from `is-absolute-url`: an RFC 3986 scheme (`https:`, `mailto:`, …),
// with the Windows drive-path carve-out so `c:\...` isn't read as a `c:` scheme.
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const WINDOWS_PATH_REGEX = /^[a-zA-Z]:\\/;
const isAbsoluteUrl = (url: string): boolean =>
    !WINDOWS_PATH_REGEX.test(url) && ABSOLUTE_URL_REGEX.test(url);

export const FILE_PATH_SEPARATOR = path.sep;
export const URL_PATH_SEPARATOR = "/";
export const PATH_SEGMENT_EMPTY = "";

/** Replace all backslashes with `sep`. */
export function slash(npath: string, sep: string): string {
    return npath.replace(windowsSlashRE, sep);
}

/** POSIX-normalize a path; on Windows first converts `\` → `/`. */
export function normalizePath(npath: string): string {
    return path.posix.normalize(isWindows ? slash(npath, path.posix.sep) : npath);
}

/** Replace the file extension (via `path.extname`) with `ext`. */
export const replaceExt = (npath: string, ext: string): string => {
    if (typeof npath !== "string" || npath.length === 0) {
        return npath;
    }
    return npath.replace(new RegExp(path.extname(npath) + "$"), ext);
};

/**
 * A link is a rewritable relative markdown link when it is non-empty, not an
 * absolute URL, not an absolute filesystem path, and has a `.md`/`.mdx` extension.
 */
export const isValidRelativeLink = (link: string | null | undefined): boolean => {
    if (!link) {
        return false;
    }
    if (isAbsoluteUrl(link)) {
        return false;
    }
    if (path.isAbsolute(link)) {
        return false;
    }
    if (!validMarkdownExtensions.includes(path.extname(link))) {
        return false;
    }
    return true;
};

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
    const indexQuery = url.indexOf("?");
    const indexHash = url.indexOf("#");
    if (indexQuery === -1 && indexHash === -1) {
        return [decodeURI(url), null];
    }
    let firstCharacterIndex: number;
    if (indexQuery !== -1 && indexHash === -1) {
        firstCharacterIndex = indexQuery;
    } else if (indexQuery === -1 && indexHash !== -1) {
        firstCharacterIndex = indexHash;
    } else {
        firstCharacterIndex = indexQuery < indexHash ? indexQuery : indexHash;
    }
    const splitUrl = url.substring(0, firstCharacterIndex);
    const splitQueryStringAndHash = url.substring(firstCharacterIndex);
    return [decodeURI(splitUrl), splitQueryStringAndHash];
};

/** Prepend the site `base` (if any) to the produced path, normalizing the result. */
export const normalizeOutputPath = (
    initialPath: string,
    collectionOptions: Pick<CollectionOptions, "base">,
): string => {
    const buildPath = () => {
        if (!collectionOptions.base) {
            return initialPath;
        }
        if (collectionOptions.base.startsWith(URL_PATH_SEPARATOR)) {
            return path.join(collectionOptions.base, initialPath);
        }
        return URL_PATH_SEPARATOR + path.join(collectionOptions.base, initialPath);
    };
    if (!initialPath) {
        return initialPath;
    }
    return normalizePath(buildPath());
};

/** Slugify each segment, join with `/`, then strip a trailing `/index`. Defaults
 *  to github-slugger (Astro-compatible) unless a custom `slugify` is supplied. */
export const generateSlug = (pathSegments: string[], slugify: SlugifyFn = githubSlug): string => {
    return pathSegments
        .map((segment) => slugify(segment))
        .join(URL_PATH_SEPARATOR)
        .replace(/\/index$/, "");
};

/** Frontmatter `slug` wins if present; otherwise the generated slug is used. */
export const resolveSlug = (generatedSlug: string, frontmatterSlug: unknown): string => {
    return z.string().default(generatedSlug).parse(frontmatterSlug);
};

/** Apply the trailing-slash policy to `resolvedUrl` (see the reference §6 truth table). */
export const applyTrailingSlash = (
    origUrl: string,
    resolvedUrl: string,
    trailingSlash: "ignore" | "always" | "never" = "ignore",
): string => {
    const hasTrailingSlash = resolvedUrl.endsWith(URL_PATH_SEPARATOR);
    if (trailingSlash === "always") {
        return hasTrailingSlash ? resolvedUrl : resolvedUrl + URL_PATH_SEPARATOR;
    }
    if (trailingSlash === "never") {
        return hasTrailingSlash ? resolvedUrl.slice(0, -1) : resolvedUrl;
    }
    const hadTrailingSlash = origUrl.endsWith(URL_PATH_SEPARATOR);
    if (hadTrailingSlash && !hasTrailingSlash) {
        return resolvedUrl + URL_PATH_SEPARATOR;
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
        ? PATH_SEGMENT_EMPTY
        : URL_PATH_SEPARATOR + collectionOptions.collectionName;
}

const matterCache: Record<string, Record<string, unknown>> = {};
const matterCacheEnabled = process.env.SMRL_MATTER_CACHE_DISABLE !== "true";

/**
 * Parse the frontmatter of a target markdown file. The block is extracted with
 * satteri's own parser (`markdownToMdast`, reading the leading `yaml`/`toml`
 * node) and its raw contents are parsed with the `yaml` or `smol-toml` library.
 * Results are cached per path unless `SMRL_MATTER_CACHE_DISABLE=true`.
 */
export function getMatter(npath: string): Record<string, unknown> {
    if (matterCacheEnabled && npath in matterCache) {
        return matterCache[npath]!;
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
        matterCache[npath] = data;
    }
    return data;
}
