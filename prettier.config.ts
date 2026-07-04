import type { Config } from "prettier";

export default {
    printWidth: 99,
    plugins: ["prettier-plugin-organize-imports"],
    trailingComma: "all",
    tabWidth: 4,
} satisfies Config;
