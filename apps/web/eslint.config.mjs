import { baseConfig } from "@one-lister/config/eslint";
import nextPlugin from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...baseConfig,
  ...nextPlugin,
  {
    ignores: ["eslint.config.mjs"],
  },
];

export default config;
