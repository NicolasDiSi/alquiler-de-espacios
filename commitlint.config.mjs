/** Conventional commits. Scopes are the workspace names plus repo-wide areas. */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["web", "domain", "application", "db", "config", "infra", "ci", "deps", "docs", "repo"],
    ],
    "subject-case": [2, "always", "lower-case"],
    "body-max-line-length": [1, "always", 100],
  },
};
