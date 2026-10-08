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
    ],
  },
  js.configs.recommended,
  security.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ["prototype/*.js"], languageOptions: { globals: globals.browser } },
  {
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
