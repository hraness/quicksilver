import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "eslint.config.mjs", "node_modules/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },
  {
    // The bake CLI and browser test are plain Node ESM; parts of them run in the page.
    files: ["**/*.mjs"],
    extends: [eslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        process: "readonly", Buffer: "readonly", console: "readonly", URL: "readonly",
        window: "readonly", document: "readonly", globalThis: "readonly", atob: "readonly", btoa: "readonly",
        fetch: "readonly", createImageBitmap: "readonly", FontFace: "readonly", OffscreenCanvas: "readonly",
        getComputedStyle: "readonly", history: "readonly", location: "readonly", HTMLCanvasElement: "readonly", Navigator: "readonly",
      },
    },
  },
);
