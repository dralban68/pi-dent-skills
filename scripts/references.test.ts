// The reference files under skills/repo-setup hold the baseline that the audit checks. These tests keep
// versions.md, the config.md blocks and the audit script's constants equal, and check that a repository
// built from the config.md blocks and the two AGENTS.md skeletons audits clean.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, describe, test } from "node:test";
import {
  WORKTRUNK_TEXT,
  CHECK_PREFIX,
  EDITORCONFIG_TEXT,
  NODE_RANGE,
  OXLINT_TEXT,
  PACKAGE_MANAGER,
  TEST_SCRIPT,
  VERSIONS,
  auditRepos,
} from "./repo-audit.ts";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const refs = path.resolve(here, "..", "skills", "repo-setup", "references");
const TERMS_FILE = ".pi/pi-dent/terms.yaml";
const tmpRoots: string[] = [];

after(async () => {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true });
});

async function read(name: string): Promise<string> {
  return readFile(path.join(refs, name), "utf8");
}

// The first fenced block of language `lang` after the line that starts with `anchor`.
function blockAfter(text: string, anchor: string, lang: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(anchor));
  assert.notEqual(start, -1, `anchor "${anchor}" exists`);
  const open = lines.findIndex((line, i) => i > start && line.startsWith("```"));
  assert.equal(lines[open], "```" + lang, `the block after "${anchor}" is \`\`\`${lang}`);
  const close = lines.findIndex((line, i) => i > open && line === "```");
  assert.notEqual(close, -1, `the block after "${anchor}" closes`);
  return `${lines.slice(open + 1, close).join("\n")}\n`;
}

// The body of the one ````markdown skeleton in a reference file.
function skeletonOf(text: string): string {
  const lines = text.split("\n");
  const open = lines.indexOf("````markdown");
  assert.notEqual(open, -1, "a ````markdown skeleton exists");
  const close = lines.indexOf("````", open + 1);
  assert.notEqual(close, -1, "the skeleton closes");
  return `${lines.slice(open + 1, close).join("\n")}\n`;
}

// Parses the Markdown table in versions.md: tool name to range, backticks removed.
function versionRows(text: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of text.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/`/g, ""));
    const [tool, range] = cells;
    if (tool === undefined || range === undefined || tool === "Tool" || tool.startsWith("-")) continue;
    rows.set(tool, range);
  }
  return rows;
}

describe("versions are single-sourced", () => {
  test("versions.md lists the six tools, and its ranges equal the audit constants", async () => {
    const rows = versionRows(await read("versions.md"));
    assert.deepEqual([...rows.keys()].sort(), ["@types/node", "Node", "oxfmt", "oxlint", "pnpm", "typescript"]);
    for (const name of Object.keys(VERSIONS)) assert.equal(rows.get(name), VERSIONS[name], name);
    assert.equal(`pnpm@${rows.get("pnpm")}`, PACKAGE_MANAGER);
    assert.equal(rows.get("Node"), NODE_RANGE);
  });

  test("the package.json fragment in config.md equals the audit constants", async () => {
    const fragment: unknown = JSON.parse(blockAfter(await read("config.md"), "## `package.json` fragment", "json"));
    assert.ok(typeof fragment === "object" && fragment !== null);
    const pkg = fragment as Record<string, unknown>;
    assert.equal(pkg.packageManager, PACKAGE_MANAGER);
    assert.deepEqual(pkg.engines, { node: NODE_RANGE });
    assert.deepEqual(pkg.devDependencies, VERSIONS);
    const scripts = pkg.scripts as Record<string, unknown>;
    assert.equal(scripts.test, TEST_SCRIPT);
    assert.equal(scripts.check, CHECK_PREFIX);
  });

  test("the .oxlintrc.json and .editorconfig blocks in config.md equal the audit's baselines", async () => {
    const config = await read("config.md");
    assert.deepEqual(JSON.parse(blockAfter(config, "## `.oxlintrc.json`", "json")), JSON.parse(OXLINT_TEXT));
    assert.equal(blockAfter(config, "## `.editorconfig`", "ini"), EDITORCONFIG_TEXT);
  });
});

async function buildRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-"));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content);
  }
  await execFileAsync("git", ["init", "-q", root]);
  return root;
}

// The skeleton carries the opt-out line as an example; a repository that does not opt out drops it.
function withoutOptOut(text: string): string {
  const kept = text
    .split("\n")
    .filter((line) => !line.startsWith("<Opt-out line") && !line.startsWith("Opts out of the dx toolchain baseline:"));
  assert.equal(kept.some((line) => line.includes("Opts out of")), false);
  return kept.join("\n");
}

// Common files: the AGENTS.md and specs/AGENTS.md skeletons, plus a lockfile, a test, and the terms file.
async function commonFiles(config: string): Promise<Record<string, string>> {
  return {
    "package.json": blockAfter(config, "## `package.json` fragment", "json"),
    ".oxlintrc.json": blockAfter(config, "## `.oxlintrc.json`", "json"),
    ".oxfmtrc.json": blockAfter(config, "## `.oxfmtrc.json`", "json"),
    ".editorconfig": blockAfter(config, "## `.editorconfig`", "ini"),
    ".config/wt.toml": blockAfter(config, "## `.config/wt.toml`", "toml"),
    "pnpm-workspace.yaml": blockAfter(config, "## `pnpm-workspace.yaml` (generic part)", "yaml"),
    ".gitignore": blockAfter(config, "## `.gitignore`", "gitignore"),
    "AGENTS.md": withoutOptOut(skeletonOf(await read("agents-md.md"))),
    "specs/AGENTS.md": skeletonOf(await read("specs-agents-md.md")),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "test/smoke.test.ts": "export {};\n",
    [TERMS_FILE]: "terms: []\n",
  };
}

describe("a repository built from the reference files audits clean", () => {
  test("node-esm: config.md blocks and the two skeletons", async () => {
    const config = await read("config.md");
    const files = {
      ...(await commonFiles(config)),
      "tsconfig.json": blockAfter(config, "## `tsconfig.json` (node-esm)", "json"),
    };
    const repo = await buildRepo(files);
    const result = (await auditRepos({ repos: [repo], termsFile: TERMS_FILE })).repos[0];
    assert.equal(result?.profile, "node-esm");
    assert.deepEqual(result?.findings, []);
  });

  test("bundled: config.md blocks and the two skeletons", async () => {
    const config = await read("config.md");
    const files = {
      ...(await commonFiles(config)),
      "tsconfig.base.json": blockAfter(config, "`tsconfig.base.json`:", "json"),
      "tsconfig.app.json": blockAfter(config, "`tsconfig.app.json` (sample", "json"),
    };
    const repo = await buildRepo(files);
    const result = (await auditRepos({ repos: [repo], termsFile: TERMS_FILE })).repos[0];
    assert.equal(result?.profile, "bundled");
    assert.deepEqual(result?.findings, []);
  });
});
