import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // The worker and services run without React (react-server condition): they may use
    // component *types*, never component code (D-033: a lucide import crashed the worker).
    files: ["server/**/*.ts", "lib/**/*.ts", "workers/**/*.ts", "models/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*"],
              allowTypeImports: true,
              message: "Server code must not import UI components (types only).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worker bundle (npm run worker:build).
    "dist/**",
  ]),
]);

export default eslintConfig;
