// dx repo audit: checks TypeScript/pnpm repositories against the dx repository standard
// (the skills/repo-setup skill and its references: layout, profiles, baseline configuration)
// and reports drift per repository. Read-only. Run through the Script tool:
// Script({ plugin: "dx", path: "scripts/repo-audit.ts", input }).
// Only node:* imports; no build step; erasable TypeScript only.

import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { isMainThread } from "node:worker_threads";

export type Profile = "node-esm" | "bundled";

export type CheckId =
  | "repo"
  | "package-json"
  | "scripts"
  | "versions"
  | "tsconfig"
  | "oxlint"
  | "oxfmt"
  | "editorconfig"
  | "worktrunk"
  | "pnpm-workspace"
  | "lockfile"
  | "gitignore"
  | "terms"
  | "specs-agents-md"
  | "agents-md";

export interface Finding {
  check: CheckId;
  message: string;
  expected?: string;
}

export interface RepoResult {
  repo: string;
  profile: Profile | null;
  findings: Finding[];
}

export interface AuditResult {
  repos: RepoResult[];
  summary: string;
}

export interface AuditInput {
  repos?: string[];
  profiles?: Record<string, Profile>;
  termsFile?: string;
}

// ---------------------------------------------------------------------------
// Baseline content (oxlint and editorconfig files, verbatim from references/config.md).
// ---------------------------------------------------------------------------

export const OXLINT_TEXT = `{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "ignorePatterns": ["node_modules", "dist", ".pi"],
  "env": { "node": true },
  "categories": { "correctness": "error" },
  "rules": {
    "@typescript-eslint/consistent-type-assertions": ["error", { "assertionStyle": "never" }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "no-console": "error",
    "no-else-return": "error",
    "no-shadow": "error",
    "no-warning-comments": "error",
    "unicorn/no-array-sort": "error",
    "unicorn/no-negated-condition": "error",
    "unicorn/no-useless-undefined": "error"
  },
  "overrides": [
    {
      "files": ["test/**"],
      "rules": {
        "@typescript-eslint/consistent-type-assertions": "off",
        "unicorn/no-useless-undefined": "off"
      }
    }
  ]
}
`;

export const EDITORCONFIG_TEXT = `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;

const OXLINT_BASELINE: Record<string, unknown> = JSON.parse(OXLINT_TEXT);
const OXLINT_SCHEMA = "./node_modules/oxlint/configuration_schema.json";
const OXFMT_SCHEMA = "./node_modules/oxfmt/configuration_schema.json";
const STANDARD_LINE = "This repository follows the dx repo standard.";
export const PACKAGE_MANAGER = "pnpm@12.18.0";
export const NODE_RANGE = ">=26";
export const TEST_SCRIPT = "node --test --test-timeout=30000 test/";
export const CHECK_PREFIX = "pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test";
// AGENTS.md opt-out line: a line starting with this skips the toolchain checks.
const OPT_OUT_PREFIX = "Opts out of the dx toolchain baseline:";
const SPEC_HEADINGS_FORBIDDEN = [
  "Specifications are the source of truth",
  "Commits and the shared tree",
  "Searching the specs with qmd",
];
const AGENTS_HEADINGS = ["Read first", "Commands", "Rules"];
const PHRASES_FORBIDDEN = ["git stash", "Commit frequently"];

// Exact devDependency ranges when declared (references/versions.md).
export const VERSIONS: Record<string, string> = {
  oxlint: "^1.93.0",
  oxfmt: "^0.77.0",
  typescript: "^7.0.2",
  "@types/node": "^26.6.6",
};

// tsconfig flags both profiles need (judged on effective options).
const COMMON_FLAGS = [
  "strict",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "erasableSyntaxOnly",
  "skipLibCheck",
];

// oxlint rules whose option objects must match deeply.
const OPTION_RULES = ["consistent-type-assertions", "no-unused-vars"];
// oxlint rules a test/** override may turn off.
const TEST_RELAXABLE = ["consistent-type-assertions", "unicorn/no-useless-undefined"];
// The one rule any override may turn off (scripts and CLIs print).
const ANY_OVERRIDE_OFF = ["no-console"];
// oxlint ignore patterns that must be present.
const OXLINT_IGNORE = ["node_modules", "dist", ".pi"];
// The formatter must not hide specs/ or Markdown; an ignore pattern matching one of these probes is a finding.
const FORMAT_PROBES = ["specs/x.ts", "specs/AGENTS.md", "README.md", "CHANGELOG.md", "docs/guide/index.md"];
// Bundled targets: moduleResolution per target; bundler for browser code, NodeNext for code Node loads.
const BUNDLED_RESOLUTIONS = ["bundler", "NodeNext"];

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  return value === undefined ? "unset" : JSON.stringify(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | number | undefined {
  if (isRecord(error) && (typeof error.code === "string" || typeof error.code === "number")) {
    return error.code;
  }
  return undefined;
}

function finding(check: CheckId, message: string, expected?: string): Finding {
  return expected === undefined ? { check, message } : { check, message, expected };
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

// Lines outside fenced code blocks, with their original index.
function outsideFences(lines: string[]): { line: string; index: number }[] {
  const out: { line: string; index: number }[] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const match = /^\s*(```|~~~)/.exec(line);
    if (match) {
      const marker = match[1] ?? "";
      if (fence === undefined) fence = marker;
      else if (fence === marker) fence = undefined;
      return;
    }
    if (fence === undefined) out.push({ line, index });
  });
  return out;
}

// JSON with comments and trailing commas. Comments are stripped only outside strings,
// so "https://..." and "//" inside a string survive.
export function stripComments(src: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    if (inString) {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

export function stripTrailingCommas(src: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i] ?? "";
    if (inString) {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j] ?? "")) j += 1;
      if (src[j] === "}" || src[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

export function parseJsonText(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(stripTrailingCommas(stripComments(text))) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// File access (all errors become findings, never crashes).
// ---------------------------------------------------------------------------

async function statOf(repo: string, rel: string) {
  try {
    return await stat(path.join(repo, rel));
  } catch {
    return undefined;
  }
}

async function exists(repo: string, rel: string): Promise<boolean> {
  return (await statOf(repo, rel)) !== undefined;
}

async function isFile(repo: string, rel: string): Promise<boolean> {
  return (await statOf(repo, rel))?.isFile() === true;
}

async function isDirectory(repo: string, rel: string): Promise<boolean> {
  return (await statOf(repo, rel))?.isDirectory() === true;
}

type Doc = { ok: true; text: string } | { ok: false; problem: string };

async function readDoc(repo: string, rel: string): Promise<Doc> {
  try {
    return { ok: true, text: await readFile(path.join(repo, rel), "utf8") };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: false, problem: "is missing" };
    return { ok: false, problem: `cannot be read: ${errorMessage(error)}` };
  }
}

// Reads a file and runs a text check; a missing or unreadable file is one finding for that check.
async function checkFile(
  repo: string,
  rel: string,
  check: CheckId,
  expected: string | undefined,
  run: (text: string) => Finding[],
): Promise<Finding[]> {
  const doc = await readDoc(repo, rel);
  if (!doc.ok) return [finding(check, `${rel} ${doc.problem}`, expected)];
  return run(doc.text);
}

// ---------------------------------------------------------------------------
// Profiles (Profiles section, detection).
// ---------------------------------------------------------------------------

export async function detectProfile(repo: string): Promise<Profile> {
  if (await exists(repo, "tsconfig.base.json")) return "bundled";
  if ((await isDirectory(repo, "src")) && !(await exists(repo, "lib"))) return "bundled";
  return "node-esm";
}

// ---------------------------------------------------------------------------
// Pure checks: package.json, scripts, versions.
// ---------------------------------------------------------------------------

export function checkPackageJson(pkg: unknown, profile: Profile): Finding[] {
  const check: CheckId = "package-json";
  if (!isRecord(pkg)) return [finding(check, "package.json must be a JSON object")];
  const out: Finding[] = [];
  const expectField = (key: string, expected: unknown): void => {
    if (pkg[key] !== expected) {
      out.push(finding(check, `package.json "${key}" is ${show(pkg[key])}, expected ${show(expected)}`, show(expected)));
    }
  };
  if (profile === "node-esm") {
    expectField("type", "module");
  } else if (pkg.type !== "module" && pkg.type !== "commonjs") {
    out.push(
      finding(
        check,
        `package.json "type" is ${show(pkg.type)}, expected "module" or "commonjs" (a bundled repository sets it explicitly; its targets decide)`,
        '"module" or "commonjs"',
      ),
    );
  }
  expectField("private", true);
  const packageManager = pkg.packageManager;
  if (
    packageManager !== PACKAGE_MANAGER &&
    !(typeof packageManager === "string" && packageManager.startsWith(`${PACKAGE_MANAGER}+sha`))
  ) {
    out.push(
      finding(
        check,
        `package.json "packageManager" is ${show(packageManager)}, expected ${show(PACKAGE_MANAGER)} (a corepack +sha suffix is allowed)`,
        show(PACKAGE_MANAGER),
      ),
    );
  }
  const engines = isRecord(pkg.engines) ? pkg.engines : undefined;
  if (engines?.node !== NODE_RANGE) {
    out.push(
      finding(check, `package.json "engines.node" is ${show(engines?.node)}, expected ${show(NODE_RANGE)}`, show(NODE_RANGE)),
    );
  }
  if (engines !== undefined && engines.pnpm !== undefined) {
    out.push(finding(check, "package.json must not set engines.pnpm; packageManager is the pin"));
  }
  return out;
}

export function checkScripts(pkg: Record<string, unknown>, profile: Profile): Finding[] {
  const raw = isRecord(pkg.scripts) ? pkg.scripts : {};
  const script = (name: string): string | undefined => {
    const value = raw[name];
    return typeof value === "string" ? value : undefined;
  };
  const out: Finding[] = [];
  const expectExact = (name: string, expected: string): void => {
    const value = script(name);
    if (value !== expected) {
      const actual = value === undefined ? "is missing" : `is ${show(value)}`;
      out.push(finding("scripts", `scripts.${name} ${actual}, expected ${show(expected)}`, expected));
    }
  };
  const expectPresent = (name: string): void => {
    if (script(name) === undefined) out.push(finding("scripts", `scripts.${name} is missing`));
  };

  if (profile === "node-esm") expectExact("test", TEST_SCRIPT);
  else expectPresent("test");
  expectPresent("typecheck");

  const lint = script("lint");
  if (lint === undefined || !/^oxlint \.(\s|$)/.test(lint)) {
    out.push(finding("scripts", `scripts.lint is ${show(lint)}, expected "oxlint ." (possibly followed by more linters)`, "oxlint ."));
  }
  expectExact("fmt", "oxfmt .");
  expectExact("fmt:check", "oxfmt --check .");

  const check = script("check");
  if (check === undefined || !(check === CHECK_PREFIX || check.startsWith(`${CHECK_PREFIX} && `))) {
    out.push(
      finding(
        "scripts",
        `scripts.check is ${show(check)}, expected to start with "${CHECK_PREFIX}" (a repository tail may follow with "&&")`,
        CHECK_PREFIX,
      ),
    );
  }
  return out;
}

// Tail scripts and end-to-end scripts (the testing kinds in dx:testing): smoke and test:app run in check's tail,
// e2e never does. Neither tail script builds itself: check builds once, before them.
const TAIL_SCRIPTS = ["smoke", "test:app"];
const BUILD_COMMAND = /^(pnpm|npm|yarn)( run)? build(\s|$)/;

// A command matches a check segment by name, so "pnpm smoke" matches "pnpm smoke" and "pnpm smoke --x".
function checkSegment(segments: string[], name: string): number {
  return segments.findIndex((segment) => segment === `pnpm ${name}` || segment.startsWith(`pnpm ${name} `));
}

// A test:slow script needs a "## Slow tests" section (dx:testing, Speed and timing) in AGENTS.md or
// a docs/*.md file; a docs/ directory that cannot be read is reported as missing the section.
async function hasSlowTestsSection(repo: string): Promise<boolean> {
  const heading = /^## Slow tests\s*$/m;
  const agents = await readDoc(repo, "AGENTS.md");
  if (agents.ok && heading.test(agents.text)) return true;
  let names: string[];
  try {
    names = (await readdir(path.join(repo, "docs"))).filter((name) => name.endsWith(".md"));
  } catch {
    return false;
  }
  for (const name of names) {
    const doc = await readDoc(repo, path.join("docs", name));
    if (doc.ok && heading.test(doc.text)) return true;
  }
  return false;
}

// Every node:test run has a per-test bound (dx:testing, Timing), and integration checks against the
// outside world are end-to-end tests under test:e2e, not separate check:* scripts.
export function checkTestScripts(pkg: Record<string, unknown>, hasSlowTestsDoc = false): Finding[] {
  const raw = isRecord(pkg.scripts) ? pkg.scripts : {};
  const out: Finding[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    if (/node --test(\s|$)/.test(value) && !/--test-timeout=\d+/.test(value)) {
      out.push(finding("scripts", `scripts["${name}"] runs node --test without --test-timeout; every test needs a bound`));
    }
    if (name === "test:slow" && !hasSlowTestsDoc) {
      out.push(
        finding(
          "scripts",
          `scripts["test:slow"] exists, but no "## Slow tests" section in AGENTS.md or docs/*.md justifies each slow test`,
        ),
      );
    }
    if (name.startsWith("check:")) {
      out.push(
        finding("scripts", `scripts["${name}"]: integration checks are end-to-end tests in e2e/, run by scripts["test:e2e"]`),
      );
    }
  }
  return out;
}

export function checkSmokeAndE2e(pkg: Record<string, unknown>, hasE2e: boolean, hasPerf = false): Finding[] {
  const raw = isRecord(pkg.scripts) ? pkg.scripts : {};
  const script = (name: string): string | undefined => {
    const value = raw[name];
    return typeof value === "string" ? value : undefined;
  };
  const check = script("check") ?? "";
  const segments = check.split("&&").map((segment) => segment.trim());
  const out: Finding[] = [];
  const add = (message: string): void => {
    out.push(finding("scripts", message));
  };

  for (const name of TAIL_SCRIPTS) {
    if (script(name) === undefined) {
      continue;
    }
    // A tail script never builds: check builds first, so a build inside it would run twice.
    const own = (script(name) ?? "").split("&&").map((segment) => segment.trim());
    if (own.some((segment) => BUILD_COMMAND.test(segment))) {
      add(`scripts.${name} must not build; check runs "pnpm build" before "pnpm ${name}"`);
    }
    const at = checkSegment(segments, name);
    if (at < 0) {
      add(`scripts.check must run "pnpm ${name}" in its tail, because scripts.${name} exists`);
    } else if (script("build") !== undefined) {
      const build = checkSegment(segments, "build");
      if (build < 0 || build > at) {
        add(`scripts.check must run "pnpm build" before "pnpm ${name}", because scripts.build exists`);
      }
    }
  }
  // End-to-end and performance tests run only on their own script, never in check or test.
  const outside: readonly (readonly [string, string, string, boolean])[] = [
    ["e2e", "an", "end-to-end", hasE2e],
    ["perf", "a", "performance", hasPerf],
  ];
  for (const [dir, article, kind, present] of outside) {
    if (check.includes(dir)) {
      add(`scripts.check must not contain ${article} ${dir} step; ${kind} tests run only as scripts["test:${dir}"]`);
    }
    if (present && script(`test:${dir}`) === undefined) {
      add(`${dir}/ exists, so scripts["test:${dir}"] must exist and run it`);
    }
    if ((script("test") ?? "").includes(dir)) {
      add(`scripts.test must not reach ${dir}/; ${kind} tests run only with scripts["test:${dir}"]`);
    }
  }
  return out;
}

export function checkVersions(pkg: Record<string, unknown>): Finding[] {
  const dev = isRecord(pkg.devDependencies) ? pkg.devDependencies : {};
  const out: Finding[] = [];
  for (const [name, range] of Object.entries(VERSIONS)) {
    const actual = dev[name];
    if (actual !== undefined && actual !== range) {
      out.push(finding("versions", `devDependencies.${name} is ${show(actual)}, expected ${show(range)}`, range));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// tsconfig, with relative `extends` merged; child wins.
// ---------------------------------------------------------------------------

interface LoadedTsconfig {
  options: Record<string, unknown>;
  problems: string[];
  raw: Record<string, unknown>;
}

function extendsList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

async function firstExistingFile(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

export async function loadTsconfig(file: string, chain: readonly string[] = []): Promise<LoadedTsconfig> {
  const name = path.basename(file);
  const empty: LoadedTsconfig = { options: {}, problems: [], raw: {} };
  if (chain.includes(file)) return { ...empty, problems: [`${name}: extends cycle through ${name}`] };
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return { ...empty, problems: [`${name} cannot be read: ${errorMessage(error)}`] };
  }
  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ...empty, problems: [`${name} is not valid JSON: ${parsed.error}`] };
  const raw = isRecord(parsed.value) ? parsed.value : {};
  const problems: string[] = [];
  let options: Record<string, unknown> = {};
  for (const ext of extendsList(raw.extends)) {
    if (!ext.startsWith("./") && !ext.startsWith("../")) {
      problems.push(`${name}: extends "${ext}" is not a relative path; its options cannot be judged`);
      continue;
    }
    const base = path.resolve(path.dirname(file), ext);
    const target = await firstExistingFile([base, `${base}.json`]);
    if (target === undefined) {
      problems.push(`${name}: extends "${ext}" was not found`);
      continue;
    }
    const child = await loadTsconfig(target, [...chain, file]);
    problems.push(...child.problems);
    options = { ...options, ...child.options };
  }
  if (raw.compilerOptions !== undefined) {
    if (isRecord(raw.compilerOptions)) options = { ...options, ...raw.compilerOptions };
    else problems.push(`${name}: compilerOptions is not an object`);
  }
  return { options, problems, raw };
}

// A solution file only lists references or files: []; it has no compilerOptions of its own.
export function isSolutionFile(raw: Record<string, unknown>): boolean {
  if (raw.compilerOptions !== undefined) return false;
  return Array.isArray(raw.references) || (Array.isArray(raw.files) && raw.files.length === 0);
}

function sameOption(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  return actual === expected;
}

export function checkTsconfigOptions(file: string, options: Record<string, unknown>, profile: Profile): Finding[] {
  const expectations: [string, unknown][] = COMMON_FLAGS.map((flag): [string, unknown] => [flag, true]);
  if (profile === "node-esm") {
    expectations.push(["module", "NodeNext"], ["moduleResolution", "NodeNext"], ["target", "ES2023"]);
    expectations.push(["allowImportingTsExtensions", true], ["noEmit", true]);
  }
  const out: Finding[] = [];
  for (const [key, expected] of expectations) {
    const actual = options[key];
    if (!sameOption(actual, expected)) {
      out.push(
        finding("tsconfig", `${file}: compilerOptions.${key} is ${show(actual)}, expected ${show(expected)}`, show(expected)),
      );
    }
  }
  if (profile === "bundled" && !BUNDLED_RESOLUTIONS.some((value) => sameOption(options.moduleResolution, value))) {
    out.push(
      finding(
        "tsconfig",
        `${file}: compilerOptions.moduleResolution is ${show(options.moduleResolution)}, expected "bundler" (browser code) or "NodeNext" (code Node loads)`,
        '"bundler" or "NodeNext"',
      ),
    );
  }
  if (profile === "node-esm") {
    const types = options.types;
    if (!Array.isArray(types) || !types.includes("node")) {
      out.push(finding("tsconfig", `${file}: compilerOptions.types is ${show(types)}, expected it to include "node"`, '["node"]'));
    }
  }
  return out;
}

async function checkTsconfigFiles(repo: string, profile: Profile): Promise<Finding[]> {
  const out: Finding[] = [];
  let files: string[];
  if (profile === "node-esm") {
    files = ["tsconfig.json"];
  } else {
    if (!(await exists(repo, "tsconfig.base.json"))) {
      out.push(finding("tsconfig", "tsconfig.base.json is missing; the bundled set needs it"));
    }
    files = (await readdir(repo))
      .filter((name) => /^tsconfig(\..+)?\.json$/.test(name) && name !== "tsconfig.base.json")
      .sort();
    if (files.length === 0) {
      out.push(finding("tsconfig", "no tsconfig.<target>.json found; a bundled repository needs one per build target"));
    }
  }
  for (const name of files) {
    if (!(await isFile(repo, name))) {
      out.push(finding("tsconfig", `${name} is missing`));
      continue;
    }
    const loaded = await loadTsconfig(path.join(repo, name));
    for (const problem of loaded.problems) out.push(finding("tsconfig", problem));
    if (profile === "bundled" && isSolutionFile(loaded.raw)) continue;
    out.push(...checkTsconfigOptions(name, loaded.options, profile));
  }
  return out;
}

// ---------------------------------------------------------------------------
// oxlint.
// ---------------------------------------------------------------------------

// `@typescript-eslint/` and `typescript/` prefixes name the same rule as no prefix.
export function ruleName(key: string): string {
  for (const prefix of ["@typescript-eslint/", "typescript/"]) {
    if (key.startsWith(prefix)) return key.slice(prefix.length);
  }
  return key;
}

// "error" | "warn" | "off" from a string, an array's first element, or oxlint's 2/1/0.
export function severityOf(value: unknown): string | undefined {
  const head = Array.isArray(value) ? value[0] : value;
  if (typeof head === "string") return head;
  if (head === 2) return "error";
  if (head === 1) return "warn";
  if (head === 0) return "off";
  return undefined;
}

function optionsOf(value: unknown): unknown {
  return Array.isArray(value) ? value[1] : undefined;
}

function normalizedRules(value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (isRecord(value)) {
    for (const [key, rule] of Object.entries(value)) map.set(ruleName(key), rule);
  }
  return map;
}

function isTestOverride(entry: unknown): boolean {
  return isRecord(entry) && isDeepStrictEqual(entry.files, ["test/**"]);
}

export function checkOxlint(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (message: string): void => {
    out.push(finding("oxlint", message, OXLINT_TEXT));
  };
  const parsed = parseJsonText(text);
  if (!parsed.ok) {
    add(`.oxlintrc.json is not valid JSON: ${parsed.error}`);
    return out;
  }
  if (!isRecord(parsed.value)) {
    add(".oxlintrc.json must be a JSON object");
    return out;
  }
  const cfg = parsed.value;

  if (cfg.$schema !== OXLINT_BASELINE.$schema) {
    add(`$schema is ${show(cfg.$schema)}, expected ${show(OXLINT_SCHEMA)}`);
  }
  if (Array.isArray(cfg.plugins)) {
    for (const plugin of ["typescript", "unicorn"]) {
      if (!cfg.plugins.includes(plugin)) {
        add(`plugins must include ${show(plugin)} when plugins is set; without it that plugin's baseline rules are silently off`);
      }
    }
  }
  const categories = isRecord(cfg.categories) ? cfg.categories : {};
  if (categories.correctness !== "error") {
    add(`categories.correctness is ${show(categories.correctness)}, expected "error"`);
  }

  const rules = normalizedRules(cfg.rules);
  const baselineRules = normalizedRules(OXLINT_BASELINE.rules);
  for (const [name, expectedValue] of baselineRules) {
    if (!rules.has(name)) {
      add(`rule ${name} is missing, expected ${show(expectedValue)}`);
      continue;
    }
    const actual = rules.get(name);
    const expectedSeverity = severityOf(expectedValue);
    const actualSeverity = severityOf(actual);
    if (actualSeverity !== expectedSeverity) {
      add(`rule ${name} severity is ${show(actualSeverity)}, expected ${show(expectedSeverity)}`);
    }
    if (OPTION_RULES.includes(name)) {
      const expectedOptions = optionsOf(expectedValue);
      const actualOptions = optionsOf(actual);
      if (!isDeepStrictEqual(actualOptions, expectedOptions)) {
        add(`rule ${name} options are ${show(actualOptions)}, expected ${show(expectedOptions)}`);
      }
    }
  }

  const ignore = Array.isArray(cfg.ignorePatterns) ? cfg.ignorePatterns : [];
  for (const pattern of OXLINT_IGNORE) {
    if (!ignore.includes(pattern)) add(`ignorePatterns must include ${show(pattern)}`);
  }

  // Overrides: the test/** override must turn off the two allowed rules; any other relaxation is a finding.
  const overrides: unknown[] = Array.isArray(cfg.overrides) ? cfg.overrides : [];
  const testOverrides = overrides.filter(isTestOverride);
  if (testOverrides.length === 0) {
    add('overrides must contain an entry with files ["test/**"]');
  } else {
    for (const name of TEST_RELAXABLE) {
      const off = testOverrides.some((entry) => {
        return isRecord(entry) && severityOf(normalizedRules(entry.rules).get(name)) === "off";
      });
      if (!off) add(`the test/** override must turn ${name} off`);
    }
  }
  overrides.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const testOk = isTestOverride(entry);
    for (const [name, value] of normalizedRules(entry.rules)) {
      const severity = severityOf(value);
      if (severity !== "off" && severity !== "warn") continue;
      if (!baselineRules.has(name)) continue;
      if (severity === "off" && ANY_OVERRIDE_OFF.includes(name)) continue;
      if (testOk && TEST_RELAXABLE.includes(name)) continue;
      add(
        `overrides[${index}] sets ${name} to ${show(severity)}; only the test/** override may relax ${TEST_RELAXABLE.join(" and ")}, and any override may turn off ${ANY_OVERRIDE_OFF.join(" and ")}`,
      );
    }
    for (const [name, value] of normalizedRules(entry.rules)) {
      if (!OPTION_RULES.includes(name) || severityOf(value) === "off") continue;
      const given = optionsOf(value);
      const expected = optionsOf(baselineRules.get(name));
      if (given !== undefined && !isDeepStrictEqual(given, expected)) {
        add(`overrides[${index}] changes the options of ${name} to ${show(given)}; the baseline options are ${show(expected)}`);
      }
    }
    const relaxedCategory = isRecord(entry.categories) ? entry.categories.correctness : undefined;
    if (relaxedCategory === "off" || relaxedCategory === "warn") {
      add(`overrides[${index}] sets categories.correctness to ${show(relaxedCategory)}; correctness must stay error`);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// oxfmt.
// ---------------------------------------------------------------------------

// Does an oxfmt ignore pattern hide a probe path (a spec or Markdown file)? Gitignore-style: a pattern
// without a slash matches at any depth, and a match on a directory hides everything under it.
export function hidesSpecsOrMarkdown(pattern: string): boolean {
  const trimmed = pattern.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  const glob = trimmed.includes("/") ? trimmed : `**/${trimmed}`;
  return FORMAT_PROBES.some((probe) => {
    const segments = probe.split("/");
    return segments.some((_, i) => path.matchesGlob(segments.slice(0, i + 1).join("/"), glob));
  });
}

export function checkOxfmt(text: string): Finding[] {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return [finding("oxfmt", `.oxfmtrc.json is not valid JSON: ${parsed.error}`)];
  if (!isRecord(parsed.value)) return [finding("oxfmt", ".oxfmtrc.json must be a JSON object")];
  const cfg = parsed.value;
  const out: Finding[] = [];
  if (cfg.$schema !== OXFMT_SCHEMA) {
    out.push(finding("oxfmt", `.oxfmtrc.json "$schema" is ${show(cfg.$schema)}, expected ${show(OXFMT_SCHEMA)}`, OXFMT_SCHEMA));
  }
  if (cfg.ignorePatterns !== undefined) {
    if (!Array.isArray(cfg.ignorePatterns)) {
      out.push(finding("oxfmt", ".oxfmtrc.json ignorePatterns must be an array"));
    } else {
      for (const pattern of cfg.ignorePatterns) {
        if (typeof pattern !== "string") {
          out.push(finding("oxfmt", `ignorePatterns entry ${show(pattern)} must be a string`));
        } else if (hidesSpecsOrMarkdown(pattern)) {
          out.push(
            finding(
              "oxfmt",
              `ignorePatterns entry ${show(pattern)} would hide specs/ or Markdown files; ignore only other paths (e.g. mockups, dist)`,
            ),
          );
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// worktrunk: the one project hook, pre-start, sets the new worktree up; its value starts with the
// baseline and may append steps with " && ". Agents run tests and checks, so no other hook exists.
export const WORKTRUNK_TEXT = `pre-start = "pnpm install --frozen-lockfile && pnpm run --if-present build"
`;
const WORKTRUNK_SETUP = "pnpm install --frozen-lockfile && pnpm run --if-present build";

function checkWorktrunk(text: string): Finding[] {
  const out: Finding[] = [];
  const actual = /^pre-start\s*=\s*"([^"]*)"\s*$/m.exec(text)?.[1];
  if (actual !== WORKTRUNK_SETUP && !actual?.startsWith(`${WORKTRUNK_SETUP} && `)) {
    const message =
      actual === undefined
        ? `.config/wt.toml pre-start is missing, expected "${WORKTRUNK_SETUP}"`
        : `.config/wt.toml pre-start is "${actual}", expected it to start with "${WORKTRUNK_SETUP}"`;
    out.push(finding("worktrunk", message, WORKTRUNK_TEXT));
  }
  const others = new Set(
    [...text.matchAll(/^\s*\[{0,2}\s*((?:pre|post)-[a-z]+)/gm)]
      .map((m) => m[1])
      .filter((hook) => hook !== undefined && hook !== "pre-start"),
  );
  if (others.size > 0)
    out.push(
      finding(
        "worktrunk",
        `.config/wt.toml defines ${[...others].join(", ")}; the only hook is pre-start, agents run tests and checks`,
        WORKTRUNK_TEXT,
      ),
    );
  return out;
}

// editorconfig (verbatim).
// ---------------------------------------------------------------------------

type Ini = Map<string, Map<string, string>>;

export function parseIni(text: string): Ini {
  const sections: Ini = new Map();
  let current = new Map<string, string>();
  sections.set("", current);
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[(.*)\]$/.exec(line);
    if (header) {
      const name = header[1] ?? "";
      current = sections.get(name) ?? new Map<string, string>();
      sections.set(name, current);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    current.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return sections;
}

const EDITORCONFIG_BASELINE = parseIni(EDITORCONFIG_TEXT);

export function checkEditorconfig(text: string): Finding[] {
  const out: Finding[] = [];
  const actualIni = parseIni(text);
  for (const [section, entries] of EDITORCONFIG_BASELINE) {
    const label = section === "" ? "top level" : `[${section}]`;
    for (const [key, expected] of entries) {
      const actual = actualIni.get(section)?.get(key);
      const message =
        actual === undefined
          ? `${label} ${key} is missing, expected ${expected}`
          : `${label} ${key} is ${actual}, expected ${expected}`;
      if (actual !== expected) out.push(finding("editorconfig", message, EDITORCONFIG_TEXT));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// pnpm-workspace.yaml, line-wise: allowBuilds booleans, overrides comments.
// ---------------------------------------------------------------------------

interface WorkspaceChild {
  key: string;
  value: string;
  previous: string | undefined;
}

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'")) && trimmed.endsWith(trimmed[0] ?? "")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// Children of a top-level key, at the indentation of its first child; deeper lines are continuations.
function workspaceChildren(lines: string[], key: string): WorkspaceChild[] | undefined {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start < 0) return undefined;
  const children: WorkspaceChild[] = [];
  let indent: number | undefined;
  let previous: string | undefined;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) {
      previous = trimmed;
      continue;
    }
    if (!/^\s/.test(line)) break;
    const lead = line.length - line.trimStart().length;
    if (indent === undefined) indent = lead;
    if (lead === indent) {
      const match = /^("[^"]*"|'[^']*'|[^\s#'"][^:]*?)\s*:\s*(.*)$/.exec(trimmed);
      if (match) {
        const value = (match[2] ?? "").replace(/\s+#.*$/, "").trim();
        children.push({ key: stripQuotes(match[1] ?? ""), value, previous });
      }
    }
    previous = trimmed;
  }
  return children;
}

export function checkPnpmWorkspace(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (message: string): void => {
    out.push(finding("pnpm-workspace", message));
  };
  const lines = splitLines(text);
  for (const child of workspaceChildren(lines, "allowBuilds") ?? []) {
    if (child.value !== "true" && child.value !== "false") {
      add(`allowBuilds ${show(child.key)} must be true or false (an explicit decision), got ${child.value === "" ? "no value" : show(child.value)}`);
    }
  }
  for (const child of workspaceChildren(lines, "overrides") ?? []) {
    if (child.previous === undefined || !child.previous.startsWith("#")) {
      add(`overrides entry ${show(child.key)} must be preceded by a # comment line giving its reason`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// .gitignore.
// ---------------------------------------------------------------------------

export function checkGitignore(text: string): Finding[] {
  const entries = splitLines(text).map((line) => line.trim());
  const ignored = ["node_modules", "/node_modules", "node_modules/", "/node_modules/", "**/node_modules", "**/node_modules/"];
  if (entries.some((line) => ignored.includes(line))) return [];
  return [finding("gitignore", ".gitignore must contain a node_modules entry")];
}

// ---------------------------------------------------------------------------
// specs/AGENTS.md and AGENTS.md.
// ---------------------------------------------------------------------------

export function checkSpecsAgents(text: string): Finding[] {
  const out: Finding[] = [];
  if (!text.includes("dx:writing-specs")) {
    out.push(finding("specs-agents-md", "specs/AGENTS.md must mention dx:writing-specs"));
  }
  const count = splitLines(text).length;
  if (count > 40) out.push(finding("specs-agents-md", `specs/AGENTS.md is ${count} lines; at most 40 are allowed`));
  return out;
}

export function checkAgentsMd(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (message: string): void => {
    out.push(finding("agents-md", message));
  };
  const lines = splitLines(text);
  const firstIndex = lines.findIndex((line) => line.trim() !== "");
  const firstLine = firstIndex < 0 ? "" : (lines[firstIndex] ?? "");
  if (!/^# \S/.test(firstLine)) add("the first line must be `# <name>`");

  const headings = outsideFences(lines).filter(({ line }) => /^##\s/.test(line));
  const titles = headings.map(({ line }) => line.replace(/^##\s+/, "").trim());

  const standardIndex = lines.findIndex((line) => line.trim() === STANDARD_LINE);
  const firstH2 = headings[0]?.index ?? lines.length;
  if (standardIndex < 0) {
    add(`the line "${STANDARD_LINE}" is missing`);
  } else if (standardIndex > firstH2) {
    add(`the line "${STANDARD_LINE}" must appear before the first ## heading`);
  } else {
    const purpose = lines.slice(firstIndex + 1, standardIndex).filter((line) => line.trim() !== "");
    if (purpose.length < 1 || purpose.length > 2) {
      add(`the purpose must be one or two lines between the # heading and the standard line; found ${purpose.length}`);
    }
  }

  const firstThree = titles.slice(0, 3);
  if (!isDeepStrictEqual(firstThree, AGENTS_HEADINGS)) {
    add(
      `the first three ## headings must be ${AGENTS_HEADINGS.map((t) => `"${t}"`).join(", ")} in that order; found ${show(firstThree)}`,
    );
  }
  for (const heading of SPEC_HEADINGS_FORBIDDEN) {
    if (titles.includes(heading)) add(`remove "## ${heading}"; it lives in dx`);
  }
  const lower = text.toLowerCase();
  for (const phrase of PHRASES_FORBIDDEN) {
    if (lower.includes(phrase.toLowerCase())) add(`remove "${phrase}"; that rule lives in dx`);
  }

  const readIndex = headings.findIndex(({ line }) => line.replace(/^##\s+/, "").trim() === "Read first");
  const readHeading = headings[readIndex];
  if (readHeading !== undefined) {
    const end = headings[readIndex + 1]?.index ?? lines.length;
    for (const line of lines.slice(readHeading.index + 1, end)) {
      const row = line.trim();
      if (!row.startsWith("|")) continue;
      const cell = (row.split("|")[1] ?? "").trim().replace(/`/g, "");
      if (cell === "AGENTS.md" || cell === "./AGENTS.md") {
        add("the Read first table must not list AGENTS.md itself");
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Terms: storage file present, committed, thesaurus gone.
// ---------------------------------------------------------------------------

export async function checkTerms(repo: string, termsFile: string): Promise<Finding[]> {
  const out: Finding[] = [];
  if (!(await isFile(repo, termsFile))) out.push(finding("terms", `${termsFile} is missing`));
  try {
    await execFileAsync("git", ["-C", repo, "check-ignore", "-q", termsFile]);
    out.push(finding("terms", `${termsFile} is git-ignored; the terms file must be committed`));
  } catch (error) {
    if (errorCode(error) !== 1) {
      out.push(finding("terms", `${termsFile} ignore status cannot be checked (git check-ignore failed: ${errorMessage(error)})`));
    }
  }
  if (await exists(repo, "specs/thesaurus.md")) {
    out.push(finding("terms", "specs/thesaurus.md must be removed; the terms file replaces it"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-repository audit and input handling.
// ---------------------------------------------------------------------------

// The toolchain checks; skipped for a repository whose AGENTS.md opts out (see auditRepo).
async function toolchainFindings(repo: string, profile: Profile): Promise<Finding[]> {
  const out: Finding[] = [];

  let pkg: unknown;
  const pkgDoc = await readDoc(repo, "package.json");
  if (!pkgDoc.ok) {
    out.push(finding("package-json", `package.json ${pkgDoc.problem}`));
  } else {
    const parsed = parseJsonText(pkgDoc.text);
    if (!parsed.ok) {
      out.push(finding("package-json", `package.json is not valid JSON: ${parsed.error}`));
    } else {
      pkg = parsed.value;
      out.push(...checkPackageJson(pkg, profile));
    }
  }
  if (isRecord(pkg)) {
    out.push(...checkScripts(pkg, profile));
    out.push(...checkSmokeAndE2e(pkg, await isDirectory(repo, "e2e"), await isDirectory(repo, "perf")));
    out.push(...checkTestScripts(pkg, await hasSlowTestsSection(repo)));
    out.push(...checkVersions(pkg));
  }

  out.push(...(await checkTsconfigFiles(repo, profile)));
  out.push(
    ...(await checkFile(repo, ".oxlintrc.json", "oxlint", OXLINT_TEXT, checkOxlint)),
    ...(await checkFile(repo, ".oxfmtrc.json", "oxfmt", undefined, checkOxfmt)),
    ...(await checkFile(repo, ".editorconfig", "editorconfig", EDITORCONFIG_TEXT, checkEditorconfig)),
    ...(await checkFile(repo, ".config/wt.toml", "worktrunk", WORKTRUNK_TEXT, checkWorktrunk)),
    ...(await checkFile(repo, "pnpm-workspace.yaml", "pnpm-workspace", undefined, checkPnpmWorkspace)),
  );

  if (!(await exists(repo, "pnpm-lock.yaml"))) out.push(finding("lockfile", "pnpm-lock.yaml is missing"));
  if (await exists(repo, "package-lock.json")) {
    out.push(finding("lockfile", "package-lock.json must not exist; pnpm is the only package manager"));
  }

  return out;
}

// All checks. A repository whose AGENTS.md has the opt-out line skips only the toolchain checks;
// terms checks run only when termsFile is given (dx names no terms path of its own).
export async function auditRepo(repo: string, profile: Profile, termsFile: string | undefined): Promise<Finding[]> {
  const out: Finding[] = [];
  const agents = await readDoc(repo, "AGENTS.md");
  const optedOut = agents.ok && splitLines(agents.text).some((line) => line.trimStart().startsWith(OPT_OUT_PREFIX));
  if (!(await isDirectory(repo, "test"))) out.push(finding("scripts", "test/ directory is missing; the layout requires it"));
  if (!optedOut) out.push(...(await toolchainFindings(repo, profile)));
  out.push(...(await checkFile(repo, ".gitignore", "gitignore", undefined, checkGitignore)));
  if (termsFile !== undefined) out.push(...(await checkTerms(repo, termsFile)));
  out.push(...(await checkFile(repo, "specs/AGENTS.md", "specs-agents-md", undefined, checkSpecsAgents)));
  out.push(...(await checkFile(repo, "AGENTS.md", "agents-md", undefined, checkAgentsMd)));
  return out;
}

export function renderSummary(repos: RepoResult[]): string {
  const lines = ["| repo | profile | findings |", "| --- | --- | --- |"];
  for (const result of repos) {
    lines.push(`| ${result.repo} | ${result.profile ?? "-"} | ${result.findings.length} |`);
  }
  for (const result of repos) {
    lines.push("", `### ${result.repo}`, "");
    if (result.findings.length === 0) lines.push("- clean");
    for (const item of result.findings) lines.push(`- ${item.check}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}

interface ParsedInput {
  repos: string[];
  profiles: Record<string, Profile>;
  termsFile: string | undefined;
}

const PROFILE_VALUES: readonly string[] = ["node-esm", "bundled"];

export function parseInput(input: unknown): ParsedInput {
  if (!isRecord(input)) throw new TypeError("input must be an object");
  const allowed = ["repos", "profiles", "termsFile"];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new TypeError(`unknown input key "${key}"; allowed: ${allowed.join(", ")}`);
  }
  let repos: string[] = [process.cwd()];
  if (input.repos !== undefined) {
    if (!Array.isArray(input.repos) || !input.repos.every((r) => typeof r === "string" && r.trim() !== "")) {
      throw new TypeError("repos must be an array of non-empty strings");
    }
    repos = input.repos;
  }
  const profiles: Record<string, Profile> = {};
  if (input.profiles !== undefined) {
    if (!isRecord(input.profiles)) throw new TypeError("profiles must be an object");
    for (const [key, value] of Object.entries(input.profiles)) {
      if (typeof value !== "string" || !PROFILE_VALUES.includes(value)) {
        throw new TypeError(`profiles["${key}"] must be "node-esm" or "bundled", got ${show(value)}`);
      }
      profiles[key] = value === "bundled" ? "bundled" : "node-esm";
    }
  }
  let termsFile: string | undefined;
  if (input.termsFile !== undefined) {
    if (typeof input.termsFile !== "string" || input.termsFile.trim() === "" || path.isAbsolute(input.termsFile)) {
      throw new TypeError("termsFile must be a non-empty path relative to each repository");
    }
    termsFile = input.termsFile;
  }
  return { repos, profiles, termsFile };
}

function givenProfile(profiles: Record<string, Profile>, given: string, abs: string): Profile | undefined {
  for (const key of [given, abs, path.basename(abs)]) {
    if (Object.hasOwn(profiles, key)) return profiles[key];
  }
  return undefined;
}

export async function auditRepos(input: unknown): Promise<AuditResult> {
  const options = parseInput(input);
  const repos: RepoResult[] = [];
  for (const given of options.repos) {
    const abs = path.resolve(given);
    const explicit = givenProfile(options.profiles, given, abs);
    if (!(await isDirectory(abs, ""))) {
      repos.push({
        repo: abs,
        profile: explicit ?? null,
        findings: [finding("repo", `repository path does not exist or is not a directory: ${abs}`)],
      });
      continue;
    }
    const profile = explicit ?? (await detectProfile(abs));
    const findings = await auditRepo(abs, profile, options.termsFile);
    repos.push({ repo: abs, profile, findings });
  }
  return { repos, summary: renderSummary(repos) };
}

export const CHECK_IDS: readonly CheckId[] = [
  "repo",
  "package-json",
  "scripts",
  "versions",
  "tsconfig",
  "oxlint",
  "oxfmt",
  "editorconfig",
  "worktrunk",
  "pnpm-workspace",
  "lockfile",
  "gitignore",
  "terms",
  "specs-agents-md",
  "agents-md",
];

function helpResult(): Record<string, unknown> {
  return {
    help: {
      name: "dx:repo-audit",
      description:
        "Audits TypeScript/pnpm repositories against the dx repository standard (the repo-setup skill's layout, profiles and baseline configuration) and reports drift per repository. Read-only.",
      checks: CHECK_IDS,
      input: {
        repos: "string[], default [cwd]; repository paths",
        profiles: "Record<repo path, 'node-esm' | 'bundled'>, default: detected (tsconfig.base.json or src/ without lib/ means bundled)",
        termsFile: "string, optional; the terms tool's storage file, relative to each repository. When given, the terms checks run (file present, not git-ignored, specs/thesaurus.md absent); when omitted, they are skipped",
      },
      baseline: [
        'bundled tsconfig: each target\'s effective options carry the common flags (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, erasableSyntaxOnly, skipLibCheck); its moduleResolution is "bundler" (browser code) or "NodeNext" (code Node loads); module, target and types are not checked',
        'package.json: "type" is "module" for node-esm; for bundled it must be set explicitly to "module" or "commonjs"; packageManager may carry a corepack +sha suffix',
        'AGENTS.md: the first three ## headings are "Read first", "Commands", "Rules", in that order, in every repository (an empty one is written "None.")',
        'scripts (smoke, test:app and end-to-end, dx:testing): each of scripts.smoke and scripts["test:app"] is optional; when present, it must not run a build itself, and scripts.check must run "pnpm smoke" and "pnpm test:app" in its tail (after "pnpm build" when scripts.build exists); every node --test script passes --test-timeout; no check:* scripts (integration checks are test:e2e) and a test:slow script only with a \"## Slow tests\" section in AGENTS.md or docs/*.md; scripts.check must not contain an e2e or perf step; when e2e/ or perf/ exists, scripts["test:e2e"] or scripts["test:perf"] must exist; scripts.test must not reach e2e/ or perf/',
        'oxlint: plugins, when set, include typescript and unicorn; an override may not change the options of no-unused-vars or consistent-type-assertions; any override may turn off no-console; only a files ["test/**"] override may turn off consistent-type-assertions and unicorn/no-useless-undefined; any other relaxation is a finding',
        'worktrunk: .config/wt.toml has pre-start starting with the baseline install and build (appended " && " steps allowed) and no other pre-* or post-* hook',
        'oxfmt ignorePatterns: a pattern is a finding only if it would hide specs/ or Markdown files (e.g. "specs", "*.md", "docs/**/*.md", "CHANGELOG.md"); other ignores such as "mockups" or "dist" are allowed',
        'opt-out: an AGENTS.md line starting "Opts out of the dx toolchain baseline:" skips the package-json, scripts, versions, tsconfig, oxlint, oxfmt, editorconfig, worktrunk, pnpm-workspace and lockfile checks; the other checks still apply',
      ],
      output: "{ repos: [{ repo, profile, findings: [{ check, message, expected? }] }], summary: Markdown }",
      examples: [
        'Script({ plugin: "dx", path: "scripts/repo-audit.ts", input: {} })',
        'Script({ plugin: "dx", path: "scripts/repo-audit.ts", input: { repos: ["/path/to/a", "/path/to/b"] } })',
        'Script({ plugin: "dx", path: "scripts/repo-audit.ts", input: { repos: ["/path/to/app"], profiles: { "/path/to/app": "bundled" } } })',
      ],
    },
  };
}

// input === undefined: help, not a run.
export async function main(input: unknown): Promise<AuditResult | Record<string, unknown>> {
  if (input === undefined) return helpResult();
  return auditRepos(input);
}

// Run only inside the Script tool worker (or when input is bound); importing from tests never runs the audit.
const runAsScript = !isMainThread || "input" in globalThis;
export default runAsScript ? await main(Reflect.get(globalThis, "input")) : undefined;
