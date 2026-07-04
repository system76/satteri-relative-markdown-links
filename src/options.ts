import { z } from "zod";

/**
 * Whether/how to prefix the collection name onto the produced URL.
 *   - `"name"` — apply the collection's on-disk directory name as a base segment.
 *   - `false`  — do not apply a base segment (treat the collection as the site root).
 */
const CollectionBase = z.union([z.literal("name"), z.literal(false)]);

const CollectionConfigSchema = z.object({
    /** Override the top-level {@link OptionsSchema} `collectionBase` for this collection. */
    base: CollectionBase.optional(),
    /**
     * Override the collection name used in the URL when the page path differs from
     * the on-disk directory name (e.g. disk `docs` → URL `/my-docs`). Defaults to
     * the on-disk directory name.
     */
    name: z.string().optional(),
});

export const OptionsSchema = z.object({
    /**
     * Source directory the site is read from. Content is resolved at
     * `<srcDir>/content` unless {@link contentDir} is set. Absolute or relative to
     * the current working directory.
     * @default "./src"
     */
    srcDir: z.string().default("./src"),
    /**
     * Explicit content root. When set, this directory is used as the base for
     * collection resolution instead of `<srcDir>/content`. Use this to run the
     * plugin outside of Astro's `src/content` convention — point it at any
     * directory whose immediate subdirectories are your "collections" (or pair it
     * with `collectionBase: false` to treat that directory as the site root).
     * Absolute or relative to the current working directory.
     */
    contentDir: z.string().optional(),
    /**
     * Top-level control of whether the collection name is prefixed onto the URL.
     *   - `"name"` → `/docs/guide`
     *   - `false`  → `/guide` (collection treated as site root)
     * @default "name"
     */
    collectionBase: CollectionBase.default("name"),
    /**
     * Per-collection overrides, keyed by the collection's on-disk directory name.
     * @default {}
     */
    collections: z.record(z.string(), CollectionConfigSchema).default({}),
    /** Site base path, prepended to the final URL (e.g. `/docs`). */
    base: z.string().optional(),
    /**
     * Trailing-slash policy for the produced URL.
     *   - `"always"` — always end with a trailing slash.
     *   - `"never"`  — never end with a trailing slash.
     *   - `"ignore"` — match the source link / custom slug's trailing slash.
     * @default "ignore"
     */
    trailingSlash: z
        .union([z.literal("ignore"), z.literal("always"), z.literal("never")])
        .default("ignore"),
});

/** Public (input) options shape — every field optional, before defaults are applied. */
export type Options = z.input<typeof OptionsSchema>;
/** Public (input) per-collection override shape. */
export type CollectionConfig = z.input<typeof CollectionConfigSchema>;

/** Validated options with defaults applied. */
export type ValidatedOptions = z.output<typeof OptionsSchema>;

/** Effective options for a single collection after applying per-collection overrides. */
export type CollectionOptions = ValidatedOptions & {
    collectionBase: "name" | false;
    collectionName: string;
};

/** Parse and validate options, applying defaults. Throws the zod error on failure. */
export const validateOptions = (options: Options | undefined): ValidatedOptions => {
    const result = OptionsSchema.safeParse(options || {});
    if (!result.success) {
        throw result.error;
    }
    return result.data;
};

/**
 * Resolve the effective `collectionBase` / `collectionName` for a collection,
 * applying any per-collection override from {@link OptionsSchema} `collections`.
 */
export const mergeCollectionOptions = (
    collectionName: string,
    options: ValidatedOptions,
): CollectionOptions => {
    const config = options.collections[collectionName] || {};
    const { base = options.collectionBase, name = collectionName } = config;
    return {
        ...options,
        collectionBase: base,
        collectionName: name,
    };
};
