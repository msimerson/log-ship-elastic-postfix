import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends("eslint:recommended"), {
    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.mocha,
        },
    },

    rules: {
        "no-unused-vars": "warn",
        "brace-style": [2, "stroustrup", {
            allowSingleLine: true,
        }],

        "consistent-return": 0,
        curly: [1, "multi-line"],
        "dot-notation": 2,
        eqeqeq: 2,

        indent: [2, 2, {
            SwitchCase: 1,
        }],

        "no-multiple-empty-lines": 2,
        "no-throw-literal": 2,
        "no-underscore-dangle": 0,
        "no-use-before-define": [2, "nofunc"],
        "object-curly-spacing": [2, "always"],
        "quote-props": [2, "as-needed"],
        quotes: [1, "single"],
        radix: 2,
        "semi-spacing": 2,

        "keyword-spacing": [2, {
            overrides: {},
            before: true,
            after: true,
        }],

        "space-in-parens": [2, "never"],

        "space-unary-ops": [2, {
            words: true,
            nonwords: false,
        }],

        "no-trailing-spaces": [2, {
            skipBlankLines: false,
        }],

        "wrap-iife": [2, "inside"],
        "no-console": 0,

        "no-empty": ["error", {
            allowEmptyCatch: true,
        }],
    },
}];