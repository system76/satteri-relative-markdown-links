import type { Definition, Link } from "mdast";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { debuglog } from "node:util";
import type { MdastPluginDefinition, MdastVisitorContext } from "satteri";
import { defineMdastPlugin } from "satteri";
import {
    mergeCollectionOptions,
    validateOptions,
    type Options,
    type ValidatedOptions,
} from "./options.js";
import {
    applyTrailingSlash,
    FILE_PATH_SEPARATOR,
    generateSlug,
    getMatter,
    isValidFile,
    isValidRelativeLink,
    normalizeOutputPath,
    PATH_SEGMENT_EMPTY,
    replaceExt,
    resolveCollectionBase,
    resolveSlug,
    shouldProcessFile,
    splitPathFromQueryAndFragment,
    URL_PATH_SEPARATOR,
} from "./utils.js";

export type { CollectionConfig, Options, SlugifyFn } from "./options.js";

// Namespaced trace logging via Node's built-in debuglog; enable with
// `NODE_DEBUG=satteri-relative-markdown-links`. The block below is only
// formatted when the namespace is active.
const debug = debuglog("satteri-relative-markdown-links");

/** A mdast node whose `url` field carries a link target (`link` and `definition`). */
type UrlNode = Link | Definition;

/**
 * Build the visitor that rewrites a relative markdown link's `url` to its final
 * site page path. Shared by the `link` (inline links) and `definition`
 * (reference-style links) visitors.
 */
function makeRewrite(options: ValidatedOptions) {
    const contentDir = options.contentDir
        ? path.resolve(options.contentDir)
        : path.resolve(options.srcDir, "content");

    return function rewrite(node: UrlNode, ctx: MdastVisitorContext): void {
        const nodeHref = node.url;
        if (typeof nodeHref !== "string" || !nodeHref) {
            return;
        }

        const [urlPathPart, urlQueryStringAndFragmentPart] =
            splitPathFromQueryAndFragment(nodeHref);
        if (!isValidRelativeLink(urlPathPart)) {
            return;
        }

        // The current file's absolute path, supplied via the compile `fileURL`.
        if (!ctx.fileURL) {
            return;
        }
        const currentFile = fileURLToPath(ctx.fileURL);
        const currentFileDirectory = path.dirname(currentFile);
        const urlFilePath = path.resolve(currentFileDirectory, urlPathPart);
        if (!isValidFile(urlFilePath)) {
            return;
        }

        const { slug: frontmatterSlug } = getMatter(urlFilePath);
        const trailingSlashMode = options.trailingSlash;
        const relativeToContentPath = path.relative(contentDir, urlFilePath);
        if (!shouldProcessFile(relativeToContentPath)) {
            return;
        }

        const collectionName = path.dirname(relativeToContentPath).split(FILE_PATH_SEPARATOR)[0];
        if (!collectionName) {
            return;
        }

        const collectionOptions = mergeCollectionOptions(collectionName, options);
        if (
            collectionName === ".." ||
            (collectionOptions.collectionBase !== false && collectionName === ".")
        ) {
            return;
        }

        const collectionDir = path.join(contentDir, collectionName);
        const relativeToCollectionPath = path.relative(collectionDir, urlFilePath);
        const withoutFileExt = replaceExt(relativeToCollectionPath, "");
        const pathSegments = withoutFileExt.split(FILE_PATH_SEPARATOR);
        const generatedSlug = generateSlug(pathSegments, options.slugify);
        const resolvedSlug = resolveSlug(generatedSlug, frontmatterSlug);
        const resolvedCollectionBase = resolveCollectionBase(collectionOptions);
        const resolvedUrl = [resolvedCollectionBase, resolvedSlug].join(URL_PATH_SEPARATOR);

        let webPathFinal = applyTrailingSlash(
            (collectionOptions.collectionBase === false && frontmatterSlug === PATH_SEGMENT_EMPTY
                ? URL_PATH_SEPARATOR
                : (frontmatterSlug as string | undefined)) || urlPathPart,
            resolvedUrl,
            trailingSlashMode,
        );
        if (urlQueryStringAndFragmentPart) {
            webPathFinal += urlQueryStringAndFragmentPart;
        }
        webPathFinal = normalizeOutputPath(webPathFinal, collectionOptions);

        debug("--------------------------------------");
        debug("Base path                            : %s", options.base);
        debug("SrcDir                               : %s", options.srcDir);
        debug("ContentDir                           : %s", contentDir);
        debug("CollectionDir                        : %s", collectionDir);
        debug("Collection Name from Disk            : %s", collectionName);
        debug("Resolved Collection Name Option      : %s", collectionOptions.collectionName);
        debug("Resolved Collection Base Option      : %s", collectionOptions.collectionBase);
        debug("Resolved Collection Base             : %s", resolvedCollectionBase);
        debug("TrailingSlashMode                    : %s", trailingSlashMode);
        debug("md/mdx AST Current File              : %s", currentFile);
        debug("md/mdx AST Current File Dir          : %s", currentFileDirectory);
        debug("md/mdx AST href full                 : %s", nodeHref);
        debug("md/mdx AST href path                 : %s", urlPathPart);
        debug("md/mdx AST href qs and/or hash       : %s", urlQueryStringAndFragmentPart);
        debug("URL file                             : %s", urlFilePath);
        debug("URL file relative to content path    : %s", relativeToContentPath);
        debug("URL file relative to collection path : %s", relativeToCollectionPath);
        debug("URL file custom slug                 : %s", frontmatterSlug);
        debug("URL file generated slug              : %s", generatedSlug);
        debug("URL file resolved slug               : %s", resolvedSlug);
        debug("Final URL                            : %s", webPathFinal);

        // `url` is a string field on both `link` and `definition`; the cast
        // picks a single concrete overload (setProperty only needs the node id).
        ctx.setProperty(node as Link, "url", webPathFinal);
    };
}

/**
 * satteri mdast plugin that rewrites relative `.md`/`.mdx` links into final site
 * page paths, honoring frontmatter `slug`, collection layout, site base path, and
 * trailing-slash policy. Register it via a compile's `mdastPlugins`, and pass the
 * source document's `fileURL` so the plugin can resolve relative links on disk.
 */
export function satteriRelativeMarkdownLinks(opts?: Options): MdastPluginDefinition {
    const options = validateOptions(opts);
    const rewrite = makeRewrite(options);
    return defineMdastPlugin({
        name: "satteri-relative-markdown-links",
        link: rewrite,
        definition: rewrite,
    });
}
