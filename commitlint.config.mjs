export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      [
        "web",
        "api",
        "worker",
        "contracts",
        "domain",
        "ingest",
        "ai",
        "db",
        "ui",
        "config",
        "supabase",
        "docs",
        "ci",
        "deps",
        "repo",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
