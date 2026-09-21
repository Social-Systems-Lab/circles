// Flat config for ESLint 9. Ported from .eslintrc.json without changing any rule: FlatCompat
// replays the "next/core-web-vitals" shareable config, which is still eslintrc-shaped, and the two
// override blocks below are the same files/rules pairs the old file declared.

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
    {
        ignores: [".next/**", "node_modules/**", "circles_data/**", "public/**", "e2e/.report/**"],
    },
    {
        // ESLint 9 reports unused eslint-disable directives by default; eslintrc did not. Kept off so
        // this migration changes no findings. (There is one stale directive, at map/map.tsx:10.)
        linterOptions: { reportUnusedDisableDirectives: "off" },
    },
    ...compat.extends("next/core-web-vitals"),
    {
        files: ["**/*.test.ts", "src/test/**/*.ts"],
        rules: {
            "react-hooks/rules-of-hooks": "off",
        },
    },
    {
        files: ["**/*.test.ts", "**/*.test.tsx", "src/test/**"],
        rules: {
            "@next/next/no-html-link-for-pages": "off",
        },
    },
];

export default eslintConfig;
