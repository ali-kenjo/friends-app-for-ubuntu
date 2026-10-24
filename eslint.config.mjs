import globals from "globals";

export default [
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/js/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        DOMPurify: "readonly",
        marked: "readonly",
        katex: "readonly",
        mermaid: "readonly",
        THREE: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/js/mic-worklet.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        sampleRate: "readonly",
        registerProcessor: "readonly",
      },
    },
  },
];
