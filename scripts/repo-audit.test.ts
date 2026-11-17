import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { promisify } from "node:util";
import {
  WORKTRUNK_TEXT,
  EDITORCONFIG_TEXT,
  OXLINT_TEXT,
  auditRepos,
  checkAgentsMd,
  checkEditorconfig,
  checkGitignore,
  checkOxfmt,
  checkOxlint,
  checkPackageJson,
  checkPnpmWorkspace,
  checkSmokeAndE2e,
  checkTestScripts,
  checkSpecsAgents,
  detectProfile,
  main,
  parseJsonText,
  ruleName,
  severityOf,
  stripComments,
  type AuditResult,
  type CheckId,
  type Finding,
  type RepoResult,
} from "./repo-audit.ts";

const execFileAsync = promisify(execFile);
const tmpRoots: string[] = [];

after(async () => {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true });
});

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const STANDARD_LINE_TEXT = "This repository follows the dx repo standard.";

const AGENTS_MD = `# fixture

A fixture repository used by the audit tests.

This repository follows the dx repo standard.

## Read first

| Document | Holds, and when to read it |
| --- | --- |
| \`docs/development.md\` | the build; read before changing it |

## Commands

\`\`\`sh
pnpm check
\`\`\`

## Rules

Repository-specific rules only.
`;

const SPECS_AGENTS_MD = `# fixture specifications

Write and review specs per the \`dx:writing-specs\` skill.

## Specs

| Spec | Subject |
| ---- | ------- |

## Differences

None.
`;

const PACKAGE_JSON = {
  name: "fixture",
  private: true,
  type: "module",
  packageManager: "pnpm@12.18.0",
  engines: { node: ">=26" },
  scripts: {
    test: "node --test --test-timeout=30000 test/",
    typecheck: "tsc -p tsconfig.json",
    lint: "oxlint .",
    fmt: "oxfmt .",
    "fmt:check": "oxfmt --check .",
    check: "pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test",
  },
  devDependencies: {
    oxlint: "^1.93.0",
    oxfmt: "^0.77.0",
    typescript: "^7.0.2",
    "@types/node": "^26.6.6",
  },
};

const NODE_TSCONFIG = {
  compilerOptions: {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    target: "ES2023",
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    erasableSyntaxOnly: true,
    skipLibCheck: true,
    types: ["node"],
  },
};

const COMMON_BASE = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  erasableSyntaxOnly: true,
  skipLibCheck: true,
};

// Common shared files for both profiles.
const SHARED_FILES: Record<string, string> = {
  "AGENTS.md": AGENTS_MD,
  "specs/AGENTS.md": SPECS_AGENTS_MD,
  "test/smoke.test.ts": "export {};\n",
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": [
    "packages:",
    "  - .",
    "",
    "allowBuilds:",
    "  esbuild: true",
    '  "core-js": false',
    "",
    "# reason: pinned for a CVE fix",
    "overrides:",
    "  # the lodash fix",
    "  lodash: 4.17.21",
    "",
  ].join("\n"),
  ".oxlintrc.json": OXLINT_TEXT,
  ".oxfmtrc.json": json({ $schema: "./node_modules/oxfmt/configuration_schema.json" }),
  ".editorconfig": EDITORCONFIG_TEXT,
  ".config/wt.toml": WORKTRUNK_TEXT,
  ".gitignore": "node_modules/\n",
  ".pi/pi-dent/terms.yaml": "terms: []\n",
};

const NODE_FILES: Record<string, string> = {
  ...SHARED_FILES,
  "package.json": json(PACKAGE_JSON),
  "tsconfig.json": json(NODE_TSCONFIG),
};

const BUNDLED_FILES: Record<string, string> = {
  ...SHARED_FILES,
  "package.json": json({
    ...PACKAGE_JSON,
    scripts: { ...PACKAGE_JSON.scripts, typecheck: "tsc -b", build: "esbuild src/main.ts --outdir=dist" },
  }),
  "tsconfig.base.json": json({
    compilerOptions: { ...COMMON_BASE, module: "ESNext", target: "ES2023", moduleResolution: "bundler" },
  }),
  "tsconfig.web.json": json({
    extends: "./tsconfig.base.json",
    compilerOptions: { lib: ["ES2023", "DOM"], noEmit: true },
  }),
  "tsconfig.json": json({ files: [], references: [{ path: "./tsconfig.web.json" }] }),
  "src/main.ts": "export const main = 1;\n",
};

async function makeRepo(files: Record<string, string>, { git = true } = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-audit-"));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  if (git) await execFileAsync("git", ["init", "-q", root]);
  return root;
}

const TERMS_FILE = ".pi/pi-dent/terms.yaml";

async function auditOne(repo: string, extra: Record<string, unknown> = {}): Promise<RepoResult> {
  const result = await auditRepos({ repos: [repo], termsFile: TERMS_FILE, ...extra });
  const first = result.repos[0];
  assert.ok(first, "one repo result");
  return first;
}

const checksOf = (findings: Finding[]): CheckId[] => findings.map((f) => f.check);

// Clone a fixture map and replace or remove entries.
function withFiles(base: Record<string, string>, changes: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const [rel, content] of Object.entries(changes)) {
    if (content === null) delete out[rel];
    else out[rel] = content;
  }
  return out;
}

describe("compliant repositories", () => {
  test("a fully compliant node-esm repository has no findings", async () => {
    const repo = await makeRepo(NODE_FILES);
    const result = await auditOne(repo);
    assert.equal(result.profile, "node-esm");
    assert.deepEqual(result.findings, []);
  });

  test("a compliant bundled repository has no findings", async () => {
    const repo = await makeRepo(BUNDLED_FILES);
    const result = await auditOne(repo);
    assert.equal(result.profile, "bundled");
    assert.deepEqual(result.findings, []);
  });

  test("the summary renders a table and clean bullets", async () => {
    const repo = await makeRepo(NODE_FILES);
    const result = await auditRepos({ repos: [repo] });
    assert.match(result.summary, /\| repo \| profile \| findings \|/);
    assert.match(result.summary, /\| node-esm \| 0 \|/);
    assert.match(result.summary, /- clean/);
  });
});

describe("each check fails at least once", () => {
  const cases: [string, Record<string, string | null>, CheckId][] = [
    ["package-json", { "package.json": json({ ...PACKAGE_JSON, type: "commonjs" }) }, "package-json"],
    [
      "scripts",
      { "package.json": json({ ...PACKAGE_JSON, scripts: { ...PACKAGE_JSON.scripts, "fmt:check": "oxfmt ." } }) },
      "scripts",
    ],
    [
      "versions",
      { "package.json": json({ ...PACKAGE_JSON, devDependencies: { ...PACKAGE_JSON.devDependencies, oxlint: "^1.0.0" } }) },
      "versions",
    ],
    ["tsconfig", { "tsconfig.json": json({ compilerOptions: { ...NODE_TSCONFIG.compilerOptions, strict: false } }) }, "tsconfig"],
    ["oxlint", { ".oxlintrc.json": OXLINT_TEXT.replace('"no-console": "error",', "") }, "oxlint"],
    ["oxfmt", { ".oxfmtrc.json": json({ $schema: "./node_modules/oxfmt/configuration_schema.json", ignorePatterns: ["specs"] }) }, "oxfmt"],
    ["editorconfig", { ".editorconfig": EDITORCONFIG_TEXT.replace("indent_size = 2", "indent_size = 4") }, "editorconfig"],
    ["worktrunk", { ".config/wt.toml": `${WORKTRUNK_TEXT}pre-merge = "pnpm check"\n` }, "worktrunk"],
    [
      "pnpm-workspace",
      { "pnpm-workspace.yaml": "allowBuilds:\n  esbuild: yes-please\n" },
      "pnpm-workspace",
    ],
    ["lockfile", { "package-lock.json": "{}\n" }, "lockfile"],
    ["gitignore", { ".gitignore": "dist/\n" }, "gitignore"],
    ["terms", { ".gitignore": "node_modules/\n.pi/\n" }, "terms"],
    ["specs-agents-md", { "specs/AGENTS.md": "# x\n\nNo mention.\n" }, "specs-agents-md"],
    ["agents-md", { "AGENTS.md": AGENTS_MD.replace(STANDARD_LINE_TEXT, "") }, "agents-md"],
    ["scripts", { "test/smoke.test.ts": null }, "scripts"],
  ];
  for (const [name, changes, check] of cases) {
    test(`${name} is reported as ${check}`, async () => {
      const repo = await makeRepo(withFiles(NODE_FILES, changes));
      const result = await auditOne(repo);
      assert.ok(checksOf(result.findings).includes(check), JSON.stringify(result.findings, null, 2));
    });
  }

  test("a bundled target may use NodeNext moduleResolution for code Node loads", async () => {
    const files = withFiles(BUNDLED_FILES, {
      "tsconfig.main.json": json({
        extends: "./tsconfig.base.json",
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
      }),
    });
    assert.deepEqual((await auditOne(await makeRepo(files))).findings, []);
  });

  test("a bundled target with a moduleResolution other than bundler or NodeNext is a finding", async () => {
    const files = withFiles(BUNDLED_FILES, {
      "tsconfig.web.json": json({ extends: "./tsconfig.base.json", compilerOptions: { moduleResolution: "node" } }),
    });
    const result = await auditOne(await makeRepo(files));
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0]?.check, "tsconfig");
    assert.match(result.findings[0]?.message ?? "", /tsconfig\.web\.json: compilerOptions\.moduleResolution is "node"/);
  });

  test("a bundled repository with no target tsconfig is one finding", async () => {
    const files = withFiles(BUNDLED_FILES, { "tsconfig.web.json": null, "tsconfig.json": null });
    const result = await auditOne(await makeRepo(files));
    assert.deepEqual(checksOf(result.findings), ["tsconfig"]);
  });
});

describe("missing files and paths", () => {
  test("a missing file is one finding for its check, never a crash", async () => {
    const files = withFiles(NODE_FILES, {
      ".oxlintrc.json": null,
      ".editorconfig": null,
      "pnpm-workspace.yaml": null,
      "AGENTS.md": null,
    });
    const result = await auditOne(await makeRepo(files));
    const byCheck = checksOf(result.findings);
    assert.deepEqual(byCheck.sort(), ["agents-md", "editorconfig", "oxlint", "pnpm-workspace"]);
    const oxlint = result.findings.find((f) => f.check === "oxlint");
    assert.equal(oxlint?.expected, OXLINT_TEXT);
    const editorconfig = result.findings.find((f) => f.check === "editorconfig");
    assert.equal(editorconfig?.expected, EDITORCONFIG_TEXT);
  });

  test("a missing package.json fails package-json only; dependent checks are skipped", async () => {
    const result = await auditOne(await makeRepo(withFiles(NODE_FILES, { "package.json": null })));
    assert.deepEqual(checksOf(result.findings), ["package-json"]);
  });

  test("a non-existent repository path is one finding", async () => {
    const missing = path.join(os.tmpdir(), "repo-audit-does-not-exist-xyz");
    const result = await auditOne(missing);
    assert.equal(result.profile, null);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0]?.check, "repo");
  });

  test("an invalid profile value is rejected", async () => {
    const repo = await makeRepo(NODE_FILES);
    await assert.rejects(auditRepos({ repos: [repo], profiles: { [repo]: "deno" } as unknown as Record<string, "bundled"> }), TypeError);
  });

  test("unknown input keys are rejected", async () => {
    await assert.rejects(auditRepos({ reposs: [] }), TypeError);
  });
});

describe("input and default repos", () => {
  test("main() with undefined input returns help, not a run", async () => {
    const result = await main(undefined);
    assert.ok("help" in result);
    assert.equal(result.repos, undefined);
  });

  test("input {} audits the current directory", async () => {
    const repo = await makeRepo(NODE_FILES);
    const previous = process.cwd();
    process.chdir(repo);
    try {
      const result = await main({});
      assert.ok("repos" in result, "an audit result");
      const audit = result as AuditResult;
      assert.equal(audit.repos.length, 1);
      assert.equal(audit.repos[0]?.repo, process.cwd());
      assert.deepEqual(audit.repos[0]?.findings, []);
    } finally {
      process.chdir(previous);
    }
  });

  test("profiles override detection; termsFile is relative and configurable", async () => {
    const files = withFiles(NODE_FILES, {
      ".pi/pi-dent/terms.yaml": null,
      "config/terms.yaml": "terms: []\n",
    });
    const repo = await makeRepo(files);
    const result = await auditOne(repo, { profiles: { [repo]: "bundled" }, termsFile: "config/terms.yaml" });
    assert.equal(result.profile, "bundled");
    // The custom terms file is found and not ignored, so the terms check is clean.
    assert.equal(result.findings.some((f) => f.check === "terms"), false);
    // No tsconfig.base.json, so judged as bundled the repository is a tsconfig finding.
    assert.ok(result.findings.some((f) => f.check === "tsconfig" && /tsconfig\.base\.json is missing/.test(f.message)));
  });
});

describe("profile detection", () => {
  test("tsconfig.base.json means bundled", async () => {
    assert.equal(await detectProfile(await makeRepo(BUNDLED_FILES)), "bundled");
  });

  test("src/ without lib/ means bundled", async () => {
    const repo = await makeRepo({ "src/index.ts": "export {};\n" });
    assert.equal(await detectProfile(repo), "bundled");
  });

  test("lib/ with src/ means node-esm", async () => {
    const repo = await makeRepo({ "src/index.ts": "", "lib/a.ts": "" });
    assert.equal(await detectProfile(repo), "node-esm");
  });

  test("neither marker means node-esm", async () => {
    assert.equal(await detectProfile(await makeRepo(NODE_FILES)), "node-esm");
  });
});

describe("tsconfig extends", () => {
  test("options merge through a relative extends; the child wins", async () => {
    const base = {
      compilerOptions: { ...NODE_TSCONFIG.compilerOptions, strict: true },
    };
    // Not named tsconfig.base.json: that name alone would make the repository detect as bundled.
    const files = withFiles(NODE_FILES, {
      "tsconfig.shared.json": json(base),
      "tsconfig.json": json({ extends: "./tsconfig.shared.json" }),
    });
    assert.deepEqual((await auditOne(await makeRepo(files))).findings, []);

    const overridden = withFiles(files, {
      "tsconfig.json": json({ extends: "./tsconfig.shared.json", compilerOptions: { strict: false } }),
    });
    const result = await auditOne(await makeRepo(overridden));
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0]?.message ?? "", /compilerOptions\.strict is false/);
  });

  test("a missing extends target is a finding, not a crash", async () => {
    const files = withFiles(NODE_FILES, { "tsconfig.json": json({ extends: "./gone.json" }) });
    const result = await auditOne(await makeRepo(files));
    assert.ok(result.findings.some((f) => f.check === "tsconfig" && /was not found/.test(f.message)));
  });
});

describe("JSON with comments and trailing commas", () => {
  test("comments and trailing commas are stripped; // inside strings survives", async () => {
    const text = `{
  // the schema, in a comment
  "$schema": "./node_modules/oxlint/configuration_schema.json", /* block */
  "ignorePatterns": ["node_modules", "dist", ".pi",],
  "description": "see https://example.com/docs // not a comment",
  "categories": { "correctness": "error", },
  "rules": ${JSON.stringify(JSON.parse(OXLINT_TEXT).rules)},
  "overrides": [ ${JSON.stringify(JSON.parse(OXLINT_TEXT).overrides[0])}, ],
}
`;
    assert.deepEqual(checkOxlint(text), []);
    assert.equal(stripComments('{"u": "https://x//y"} // end').trim(), '{"u": "https://x//y"}');
    assert.equal(parseJsonText('{"a": "//", /* c */ "b": [1,],}').ok, true);
  });
});

describe("oxlint rule comparison", () => {
  test("prefixes and severity arrays name the same rule", () => {
    const text = JSON.stringify({
      ...JSON.parse(OXLINT_TEXT),
      rules: {
        ...JSON.parse(OXLINT_TEXT).rules,
        "typescript/no-explicit-any": ["error"],
        "no-explicit-any-typo": "error",
        "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "@typescript-eslint/no-non-null-assertion": "error",
      },
    });
    assert.deepEqual(checkOxlint(text), []);
    assert.equal(ruleName("typescript/no-explicit-any"), "no-explicit-any");
    assert.equal(severityOf(["warn", {}]), "warn");
  });

  test("options are compared deeply for no-unused-vars", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.rules["@typescript-eslint/no-unused-vars"] = ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }];
    const findings = checkOxlint(JSON.stringify(base));
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /rule no-unused-vars options/);
  });

  test("any override may turn off no-console; other overrides may not turn off the test-only rules", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.overrides.push({ files: ["scripts/**"], rules: { "no-console": "off" } });
    assert.deepEqual(checkOxlint(JSON.stringify(base)), []);
    base.overrides.push({
      files: ["src/**"],
      rules: { "no-console": "warn", "@typescript-eslint/consistent-type-assertions": "off" },
    });
    const findings = checkOxlint(JSON.stringify(base));
    assert.equal(findings.length, 2);
    assert.ok(findings.some((f) => /overrides\[2\] sets no-console to "warn"/.test(f.message)));
    assert.ok(findings.some((f) => /overrides\[2\] sets consistent-type-assertions to "off"/.test(f.message)));
  });

  test("an extra override that does not relax a baseline rule is allowed", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.overrides.push({ files: ["src/**"], rules: { "no-console": "error" } });
    assert.deepEqual(checkOxlint(JSON.stringify(base)), []);
  });

  test("a relaxing override is a finding; only test/** may relax the two allowed rules", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.overrides.push({ files: ["src/**"], rules: { "no-shadow": "warn" } });
    base.overrides[0].rules["@typescript-eslint/no-explicit-any"] = "off";
    const findings = checkOxlint(JSON.stringify(base));
    assert.equal(findings.length, 2);
    assert.ok(findings.every((f) => f.check === "oxlint" && f.expected === OXLINT_TEXT));
    assert.ok(findings.some((f) => /overrides\[1\] sets no-shadow to "warn"/.test(f.message)));
    assert.ok(findings.some((f) => /overrides\[0\] sets no-explicit-any to "off"/.test(f.message)));
  });

  test("the test/** override must be present and turn both rules off", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.overrides = [];
    assert.equal(checkOxlint(JSON.stringify(base)).length, 1);
  });
});

describe("oxfmt and gitignore", () => {
  test("ignorePatterns may not hide specs/ or Markdown files; other ignores are allowed", () => {
    const schema = "./node_modules/oxfmt/configuration_schema.json";
    const allowed = ["dist", "mockups", "pnpm-lock.yaml", "**/dist/**", "generated/**", "src/**/*.generated.ts"];
    assert.deepEqual(checkOxfmt(json({ $schema: schema, ignorePatterns: allowed })), []);
    const hidden = ["specs", "specs/**", "./specs/", "*.md", "**/*.md", "docs/**/*.md", "**"];
    assert.equal(checkOxfmt(json({ $schema: schema, ignorePatterns: hidden })).length, hidden.length);
  });

  test("a non-string ignorePatterns entry is a finding", () => {
    const findings = checkOxfmt(json({ $schema: "./node_modules/oxfmt/configuration_schema.json", ignorePatterns: [3] }));
    assert.equal(findings.length, 1);
  });

  test("a node_modules entry is required", () => {
    assert.deepEqual(checkGitignore("node_modules\n"), []);
    assert.deepEqual(checkGitignore("/node_modules/\n"), []);
    assert.equal(checkGitignore("dist\n").length, 1);
  });

  test("a terms file that git ignores is a finding", async () => {
    const repo = await makeRepo(withFiles(NODE_FILES, { ".gitignore": "node_modules/\n.pi/\n" }));
    const result = await auditOne(repo);
    assert.ok(result.findings.some((f) => f.check === "terms" && /git-ignored/.test(f.message)));
  });

  test("a leftover specs/thesaurus.md is a finding", async () => {
    const repo = await makeRepo(withFiles(NODE_FILES, { "specs/thesaurus.md": "| a |\n" }));
    const result = await auditOne(repo);
    assert.ok(result.findings.some((f) => f.check === "terms" && /thesaurus/.test(f.message)));
  });
});

describe("package.json type for bundled repositories", () => {
  test("unset type is a finding; the targets decide between module and commonjs", async () => {
    const unset = withFiles(BUNDLED_FILES, { "package.json": json({ ...PACKAGE_JSON, type: undefined }) });
    const result = await auditOne(await makeRepo(unset));
    assert.deepEqual(checksOf(result.findings), ["package-json"]);
    assert.match(result.findings[0]?.message ?? "", /"type" is unset, expected "module" or "commonjs"/);

    const commonjs = withFiles(BUNDLED_FILES, { "package.json": json({ ...PACKAGE_JSON, type: "commonjs" }) });
    assert.deepEqual((await auditOne(await makeRepo(commonjs))).findings, []);
  });

  test("checkPackageJson requires module for node-esm and accepts module or commonjs for bundled", () => {
    assert.deepEqual(checkPackageJson(PACKAGE_JSON, "node-esm"), []);
    assert.equal(checkPackageJson({ ...PACKAGE_JSON, type: "commonjs" }, "node-esm").length, 1);
    assert.deepEqual(checkPackageJson({ ...PACKAGE_JSON, type: "commonjs" }, "bundled"), []);
    assert.equal(checkPackageJson({ ...PACKAGE_JSON, type: "text" }, "bundled").length, 1);
  });
});

describe("help text", () => {
  test("help states the four baseline decisions", async () => {
    const help = (await main(undefined)) as { help: { baseline: string[] } };
    const text = help.help.baseline.join("\n");
    assert.match(text, /NodeNext/);
    assert.match(text, /"module" or "commonjs"/);
    assert.match(text, /no-console/);
    assert.match(text, /specs/);
  });

  test("help states the smoke and end-to-end script rules", async () => {
    const help = (await main(undefined)) as { help: { baseline: string[] } };
    const text = help.help.baseline.join("\n");
    assert.match(text, /pnpm smoke/);
    assert.match(text, /test:app/);
    assert.match(text, /test:e2e/);
  });
});

describe("smoke and end-to-end scripts", () => {
  const CHECK = PACKAGE_JSON.scripts.check;
  const withScripts = (scripts: Record<string, string>): Record<string, unknown> => ({
    ...PACKAGE_JSON,
    scripts: { ...PACKAGE_JSON.scripts, ...scripts },
  });

  test("a smoke script never builds; check builds in its tail", () => {
    const scripts = { smoke: "pnpm build && node --version", build: "tsc -b" };
    const findings = checkSmokeAndE2e(withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm smoke` }), false);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /must not build/);
    const clean = withScripts({ smoke: "node --version", build: "tsc -b", check: `${CHECK} && pnpm build && pnpm smoke` });
    assert.deepEqual(checkSmokeAndE2e(clean, false), []);
  });

  test("a smoke script must run in the tail of check", () => {
    const pkg = withScripts({ smoke: "node --version" });
    const findings = checkSmokeAndE2e(pkg, false);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /pnpm smoke/);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ smoke: "node --version", check: `${CHECK} && pnpm smoke` }), false), []);
  });

  test("without a smoke script, check needs no smoke tail", () => {
    assert.deepEqual(checkSmokeAndE2e(PACKAGE_JSON, false), []);
  });

  test("smoke runs after build when the repository has a build script", () => {
    const scripts = { smoke: "node --version", build: "tsc -b" };
    const after = withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm smoke` });
    assert.deepEqual(checkSmokeAndE2e(after, false), []);
    const before = withScripts({ ...scripts, check: `${CHECK} && pnpm smoke && pnpm build` });
    assert.equal(checkSmokeAndE2e(before, false).length, 1);
    const missing = withScripts({ ...scripts, check: `${CHECK} && pnpm smoke` });
    assert.equal(checkSmokeAndE2e(missing, false).length, 1);
  });

  test("a test:app script is optional; without it check needs no app tail", () => {
    assert.deepEqual(checkSmokeAndE2e(PACKAGE_JSON, false), []);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ "test:app": "node --test app/", check: `${CHECK} && pnpm test:app` }), false), []);
  });

  test("a test:app script must run in the tail of check", () => {
    const findings = checkSmokeAndE2e(withScripts({ "test:app": "node --test app/" }), false);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /must run "pnpm test:app" in its tail/);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ "test:app": "node --test app/", check: `${CHECK} && pnpm test:app` }), false), []);
  });

  test("a test:app script never builds", () => {
    const scripts = { "test:app": "pnpm build && node --test app/", build: "tsc -b" };
    const findings = checkSmokeAndE2e(withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm test:app` }), false);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /scripts\.test:app must not build/);
    const clean = withScripts({ "test:app": "node --test app/", build: "tsc -b", check: `${CHECK} && pnpm build && pnpm test:app` });
    assert.deepEqual(checkSmokeAndE2e(clean, false), []);
  });

  test("test:app runs after build when the repository has a build script", () => {
    const scripts = { "test:app": "node --test app/", build: "tsc -b" };
    const after = withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm test:app` });
    assert.deepEqual(checkSmokeAndE2e(after, false), []);
    const before = withScripts({ ...scripts, check: `${CHECK} && pnpm test:app && pnpm build` });
    assert.equal(checkSmokeAndE2e(before, false).length, 1);
    const missing = withScripts({ ...scripts, check: `${CHECK} && pnpm test:app` });
    assert.equal(checkSmokeAndE2e(missing, false).length, 1);
  });

  test("smoke and test:app both run after build, in either order", () => {
    const scripts = { smoke: "node --version", "test:app": "node --test app/", build: "tsc -b" };
    assert.deepEqual(checkSmokeAndE2e(withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm smoke && pnpm test:app` }), false), []);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm test:app && pnpm smoke` }), false), []);
    assert.equal(checkSmokeAndE2e(withScripts({ ...scripts, check: `${CHECK} && pnpm build && pnpm smoke` }), false).length, 1);
  });

  test("check must not contain test:e2e or any other e2e step", () => {
    const pkg = withScripts({ "test:e2e": "node --test e2e/", check: `${CHECK} && pnpm test:e2e` });
    const findings = checkSmokeAndE2e(pkg, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /must not contain an e2e step/);
  });

  test("an e2e/ directory requires scripts[\"test:e2e\"]", () => {
    const findings = checkSmokeAndE2e(PACKAGE_JSON, true);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /test:e2e/);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ "test:e2e": "node --test e2e/" }), true), []);
  });

  test("performance tests stay out of check and test, and perf/ requires test:perf", () => {
    const inCheck = checkSmokeAndE2e(withScripts({ "test:perf": "node --test perf/", check: `${CHECK} && pnpm test:perf` }), false, true);
    assert.equal(inCheck.length, 1);
    assert.match(inCheck[0]?.message ?? "", /must not contain a perf step/);
    assert.match(checkSmokeAndE2e(PACKAGE_JSON, false, true)[0]?.message ?? "", /test:perf/);
    assert.match(checkSmokeAndE2e(withScripts({ test: "node --test test/ perf/" }), false)[0]?.message ?? "", /must not reach perf\//);
    assert.deepEqual(checkSmokeAndE2e(withScripts({ "test:perf": "node --test perf/" }), false, true), []);
  });

  test("every node --test script has a timeout, and check:* scripts belong in test:e2e", () => {
    assert.deepEqual(checkTestScripts(withScripts({ "test:perf": "node --test --test-timeout=60000 perf/" })), []);
    const findings = checkTestScripts(withScripts({ "test:e2e": "node --test e2e/", "check:pi": "node e2e/pi.mjs" }));
    assert.equal(findings.length, 2);
    assert.match(findings[0]?.message ?? "", /test:e2e.*--test-timeout/);
    assert.match(findings[1]?.message ?? "", /check:pi.*e2e/);
  });

  test("a test:slow script needs a Slow tests section", async () => {
    const slow = withScripts({ "test:slow": "node --test --test-timeout=30000 slow/" });
    const bare = await makeRepo(withFiles(NODE_FILES, { "package.json": json(slow) }));
    const findings = (await auditOne(bare)).findings;
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /test:slow.*Slow tests/);
    const documented = await makeRepo(
      withFiles(NODE_FILES, { "package.json": json(slow), "docs/development.md": "# Dev\n\n## Slow tests\n\n| Test | Why slow |\n" }),
    );
    assert.deepEqual((await auditOne(documented)).findings, []);
  });

  test("scripts.test must not reach e2e/", () => {
    const findings = checkSmokeAndE2e(withScripts({ test: "node --test test/ e2e/" }), false);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /must not reach e2e\//);
  });

  test("an e2e/ directory without test:e2e is a finding of the audit", async () => {
    const repo = await makeRepo(withFiles(NODE_FILES, { "e2e/flow.test.ts": "export {};\n" }));
    const result = await auditOne(repo);
    assert.deepEqual(checksOf(result.findings), ["scripts"]);
    assert.match(result.findings[0]?.message ?? "", /test:e2e/);
  });

  test("an e2e/ directory with test:e2e, and a smoke script in check, audit clean", async () => {
    const pkg = withScripts({
      "test:e2e": "node --test --test-timeout=30000 e2e/",
      smoke: "node --version",
      check: `${CHECK} && pnpm smoke`,
    });
    const repo = await makeRepo(withFiles(NODE_FILES, { "package.json": json(pkg), "e2e/flow.test.ts": "export {};\n" }));
    assert.deepEqual((await auditOne(repo)).findings, []);
  });
});

describe("editorconfig", () => {
  test("the verbatim file is clean; a changed key is one finding with the baseline as expected", () => {
    assert.deepEqual(checkEditorconfig(EDITORCONFIG_TEXT), []);
    const findings = checkEditorconfig(EDITORCONFIG_TEXT.replace("trim_trailing_whitespace = false", "trim_trailing_whitespace = true"));
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.expected, EDITORCONFIG_TEXT);
  });
});

describe("pnpm-workspace.yaml", () => {
  test("allowBuilds values must be booleans; overrides need a comment above each entry", () => {
    const good = "allowBuilds:\n  esbuild: true # build it\n\n# reason\noverrides:\n  # why\n  a: 1.0.0\n";
    assert.deepEqual(checkPnpmWorkspace(good), []);
    const bad = "allowBuilds:\n  esbuild: maybe\n\noverrides:\n  a: 1.0.0\n";
    const findings = checkPnpmWorkspace(bad);
    assert.equal(findings.length, 2);
    assert.ok(findings.every((f) => f.check === "pnpm-workspace"));
  });
});

describe("AGENTS.md and specs/AGENTS.md", () => {
  test("headings inside fenced code do not count", () => {
    const text = AGENTS_MD.replace("## Commands", "```md\n## Commands\n```\n## Commands");
    assert.deepEqual(checkAgentsMd(text), []);
  });

  test("the first three headings must be Read first, Commands, Rules in order", () => {
    const text = AGENTS_MD.replace("## Commands\n", "## Rules\n").replace("## Rules\n\nRepository", "## Commands\n\nRepository");
    const findings = checkAgentsMd(text);
    assert.ok(findings.some((f) => /first three/.test(f.message)));
  });

  test("forbidden sections, phrases, and an AGENTS.md row are findings", () => {
    const text = `${AGENTS_MD}\n## Commits and the shared tree\n\nDo not git stash.\n`;
    const findings = checkAgentsMd(text.replace("| `docs/development.md` |", "| `AGENTS.md` |"));
    assert.ok(findings.some((f) => /Commits and the shared tree/.test(f.message)));
    assert.ok(findings.some((f) => /git stash/.test(f.message)));
    assert.ok(findings.some((f) => /AGENTS.md itself/.test(f.message)));
  });

  test("the purpose must be one or two lines", () => {
    const text = AGENTS_MD.replace("A fixture repository used by the audit tests.", "One.\n\nTwo.\n\nThree.");
    assert.ok(checkAgentsMd(text).some((f) => /purpose/.test(f.message)));
  });

  test("specs/AGENTS.md: mention and length", () => {
    assert.deepEqual(checkSpecsAgents(SPECS_AGENTS_MD), []);
    const long = `${SPECS_AGENTS_MD}${"line\n".repeat(40)}`;
    assert.equal(checkSpecsAgents(long).length, 1);
    assert.equal(checkSpecsAgents("# nothing\n").length, 1);
  });
});

describe("output contract", () => {
  test("each repo result carries repo, profile, and findings; summary is Markdown", async () => {
    const good = await makeRepo(NODE_FILES);
    const bad = await makeRepo(withFiles(NODE_FILES, { "package.json": json({ ...PACKAGE_JSON, private: false }) }));
    const result = await auditRepos({ repos: [good, bad] });
    assert.equal(result.repos.length, 2);
    const badResult = result.repos[1];
    assert.equal(badResult?.findings[0]?.check, "package-json");
    assert.match(result.summary, /- package-json: package\.json "private"/);
  });
});

describe("terms checks run only with termsFile", () => {
  test("without termsFile, a missing terms file and a leftover thesaurus are not findings", async () => {
    const files = withFiles(NODE_FILES, { ".pi/pi-dent/terms.yaml": null, "specs/thesaurus.md": "| a |\n" });
    const result = await auditRepos({ repos: [await makeRepo(files)] });
    assert.equal(result.repos[0]?.findings.some((f) => f.check === "terms"), false);
  });

  test("with termsFile, a missing terms file is a finding", async () => {
    const files = withFiles(NODE_FILES, { ".pi/pi-dent/terms.yaml": null });
    const result = await auditRepos({ repos: [await makeRepo(files)], termsFile: TERMS_FILE });
    assert.ok(result.repos[0]?.findings.some((f) => f.check === "terms" && /is missing/.test(f.message)));
  });

  test("an empty or absolute termsFile is rejected", async () => {
    await assert.rejects(auditRepos({ repos: [], termsFile: "" }), TypeError);
    await assert.rejects(auditRepos({ repos: [], termsFile: "/abs/terms.yaml" }), TypeError);
  });
});

const OPT_OUT_LINE = "Opts out of the dx toolchain baseline: Biome and Vitest.";
const OXFMT_SCHEMA = "./node_modules/oxfmt/configuration_schema.json";

describe("opt-out line in AGENTS.md", () => {
  const optOutAgents = AGENTS_MD.replace("## Rules\n", `## Rules\n\n${OPT_OUT_LINE}\n`);
  const bareFiles = {
    "AGENTS.md": optOutAgents,
    "specs/AGENTS.md": SPECS_AGENTS_MD,
    "test/smoke.test.ts": "export {};\n",
    ".gitignore": "node_modules/\n",
    ".pi/pi-dent/terms.yaml": "terms: []\n",
  };

  test("an opted-out repository without toolchain files has no findings", async () => {
    const result = await auditOne(await makeRepo(bareFiles));
    assert.deepEqual(result.findings, []);
  });

  test("without the line, the same repository reports the toolchain checks", async () => {
    const result = await auditOne(await makeRepo({ ...bareFiles, "AGENTS.md": AGENTS_MD }));
    const checks = checksOf(result.findings);
    assert.ok(checks.includes("package-json"));
    assert.ok(checks.includes("tsconfig"));
    assert.ok(checks.includes("oxlint"));
    assert.ok(checks.includes("lockfile"));
  });

  test("an opted-out repository still needs the Read first, Commands and Rules headings", async () => {
    const result = await auditOne(await makeRepo({ ...bareFiles, "AGENTS.md": optOutAgents.replace("## Commands", "## Tools") }));
    assert.deepEqual(checksOf(result.findings), ["agents-md"]);
    assert.match(result.findings[0]?.message ?? "", /first three/);
  });

  test("an opted-out repository still needs a test/ directory", async () => {
    const result = await auditOne(await makeRepo(withFiles(bareFiles, { "test/smoke.test.ts": null })));
    assert.deepEqual(checksOf(result.findings), ["scripts"]);
    assert.match(result.findings[0]?.message ?? "", /test\/ directory is missing/);
  });

  test("the line must start a line; a mention inside a sentence does not opt out", async () => {
    const agents = AGENTS_MD.replace("## Rules\n", `## Rules\n\nSee: ${OPT_OUT_LINE}\n`);
    const result = await auditOne(await makeRepo({ ...bareFiles, "AGENTS.md": agents }));
    assert.ok(checksOf(result.findings).includes("package-json"));
  });
});

describe("package.json packageManager, gitignore, oxfmt and oxlint additions", () => {
  test("a corepack +sha suffix on packageManager is accepted; another version is not", () => {
    assert.deepEqual(checkPackageJson({ ...PACKAGE_JSON, packageManager: "pnpm@12.18.0+sha512.abc123" }, "node-esm"), []);
    assert.equal(checkPackageJson({ ...PACKAGE_JSON, packageManager: "pnpm@12.17.0+sha512.abc" }, "node-esm").length, 1);
  });

  test(".gitignore accepts every spelling of the node_modules entry", () => {
    for (const line of ["node_modules", "node_modules/", "/node_modules", "/node_modules/", "**/node_modules", "**/node_modules/"]) {
      assert.deepEqual(checkGitignore(`${line}\n`), [], line);
    }
  });

  test("CHANGELOG.md is probed: an ignore pattern that hides it is a finding", () => {
    assert.equal(checkOxfmt(json({ $schema: OXFMT_SCHEMA, ignorePatterns: ["CHANGELOG.md"] })).length, 1);
    assert.deepEqual(checkOxfmt(json({ $schema: OXFMT_SCHEMA, ignorePatterns: ["dist"] })), []);
  });

  test("an override may not change the options of consistent-type-assertions", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.overrides.push({
      files: ["src/**"],
      rules: { "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as" }] },
    });
    const findings = checkOxlint(JSON.stringify(base));
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /overrides\[1\] changes the options of consistent-type-assertions/);
  });

  test("plugins, when set, must include typescript and unicorn", () => {
    const base = JSON.parse(OXLINT_TEXT);
    base.plugins = ["unicorn"];
    assert.equal(checkOxlint(JSON.stringify(base)).length, 1);
    base.plugins = ["typescript", "unicorn", "react"];
    assert.deepEqual(checkOxlint(JSON.stringify(base)), []);
  });
});

