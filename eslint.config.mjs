import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";

export default [
  {
    ignores: [
      "node_modules/**",
      ".agents/**",
      ".venv/**",
      "tmp/**",
      "output/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  security.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ["prototype/*.js", "tests/browser/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
