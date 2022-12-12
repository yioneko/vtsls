module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./packages/*/tsconfig.json"],
  },
  plugins: ["@typescript-eslint"],
  ignorePatterns: [
    "packages/service/typescript-language-features",
    "packages/service/vscode",
    // TODO: specific rules for scripts file
    "packages/**/*.js",
    "**/dist",
    ".eslintrc.*",
  ],
  rules: {
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-empty-function": "warn",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-namespace": "warn",
    "@typescript-eslint/no-this-alias": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/unbound-method": "warn",
  },
};