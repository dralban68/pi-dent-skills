---
name: repo-setup
description: >-
  Load before creating a repository, changing its tooling, config files or AGENTS.md, bumping a tool version, or auditing a repository for drift.
---

# Repository setup

The baseline is one standard for every repository that declares it. Config contents are in
`references/config.md`, versions in `references/versions.md`, and the two AGENTS.md skeletons in
`references/agents-md.md` and `references/specs-agents-md.md`. Copy them; do not write from memory.

## Layout

Every repository has `AGENTS.md`, `specs/` with `specs/AGENTS.md`, `test/`, `package.json`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, its tsconfig (or the bundled set), `.oxlintrc.json`,
`.oxfmtrc.json`, `.editorconfig`, `.config/wt.toml` and `.gitignore`, plus the terms tool's storage file when the
repository uses one. `docs/` (non-normative) and `README.md` are optional; write them per `dx:writing-docs`. A repository that ships something a user runs (an app,
a CLI, a server) keeps its smoke tests outside `test/` (in `smoke/` or `scripts/`), and so does its app-behaviour
tests (`test:app`, Scripts below); `e2e/` exists only when the repository has end-to-end
tests, and `perf/` only when it has performance tests. What each kind of test holds is in `dx:testing`.

In node-esm, `lib/<subject>.ts` implements `specs/<subject>.md`, and `test/` mirrors `lib/`. A
bundled repository keeps its source under `src/`. A host-specific layer (a plugin manifest key, a
`file:` link to an installed host release) is not a profile: that host documents it, and the
repository's AGENTS.md Read first table points there.

## Profiles

| Profile    | Runs as                                                   | tsconfig                                                                          |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `node-esm` | `.ts` run directly by Node's type stripping; no build     | one `tsconfig.json`, NodeNext                                                     |
| `bundled`  | built by a bundler into `dist/` (apps, multi-target code) | `tsconfig.base.json` plus one `tsconfig.<target>.json` per target                 |

Without a stated profile: a `tsconfig.base.json`, or a `src/` directory without `lib/`, means
bundled; anything else means node-esm.

## Baseline files

Each file below exists for the reason given. The reason is what you check when a repository
departs from it.

- **`package.json`**: `type` is `"module"` in node-esm, so `.ts` and `.js` load as ES modules; a
  bundled repository sets it explicitly to what its targets need (`"commonjs"` when a target Node
  loads is emitted as CommonJS); `"private": true`
  so the package cannot be published by accident; `packageManager` pins pnpm, the only pin
  (no `engines.pnpm`); `engines.node` states the Node floor.
- **`tsconfig.json` (node-esm)**: `allowImportingTsExtensions` with `noEmit`, because node-esm runs
  `.ts` directly and nothing is built; NodeNext resolution matches how Node resolves those imports.
- **`tsconfig` flags, both profiles**: `strict`; `noUncheckedIndexedAccess`, so an indexed read is
  checked before use; `exactOptionalPropertyTypes`, so an optional field is absent, never
  `undefined`; `erasableSyntaxOnly`, because Node's type stripping cannot run enums, parameter
  properties or namespaces; `skipLibCheck`, so dependency typings stay out of `check`.
- **Bundled set**: `tsconfig.base.json` holds the shared flags so targets cannot drift apart; the
  bundler emits, so typecheck runs each target with `noEmit`. Each target resolves modules the way it runs:
  `bundler` for code the bundler packs for a browser, `NodeNext` for code Node loads (for example
  an Electron main process).
- **`.oxlintrc.json`**: `correctness` is an error, and the rules close the escape hatches (`as`,
  `any`, non-null `!`) so the checker sees the real types; the `test/**` override turns off only
  `consistent-type-assertions` and `unicorn/no-useless-undefined`, because fixtures and mocks
  legitimately cast and return `undefined`. A repository may add overrides (another `env`, extra
  rules) and may turn `no-console` off where code prints, such as `scripts/**`; it never relaxes
  another baseline rule.
- **`.oxfmtrc.json`**: oxfmt formats Markdown as well as TypeScript, so specs are formatted by the
  same command as code; its `ignorePatterns` must never exclude `specs/` or Markdown, so
  ignore only what is not authored text (build output, mockups, the lockfile).
- **`.config/wt.toml`**: one Worktrunk hook, `pre-start`, installs and builds a new worktree so
  it is fully operational. No other hook: agents run tests and checks themselves (dx context).
- **`.editorconfig`**: one encoding and line-ending convention for every editor; it keeps trailing
  spaces in Markdown, where two spaces are a hard line break.
- **`pnpm-workspace.yaml`**: `allowBuilds` records a boolean decision for each dependency's install
  scripts; each `overrides` entry sits under a comment saying why it exists. Other keys are the
  repository's own.
- **`.gitignore`**: `node_modules/` (and build output when bundled). The terms storage file is never
  ignored.
- **`pnpm-lock.yaml`** is committed and **`package-lock.json`** is absent, because npm would bypass
  the pnpm pin.

## Scripts

`test` (node-esm: `node --test --test-timeout=30000 test/`), `typecheck`, `lint` (`oxlint .`, optionally followed by
other linters), `fmt` (`oxfmt .`), `fmt:check` (`oxfmt --check .`), and `check`. Three more scripts
follow the test kinds in `dx:testing`, each optional: `smoke` (when the repository ships something a user
runs: an app, a CLI, a server), `test:app` (app behaviour: when the repository has tests that need the
built product), `test:e2e` (when the repository has `e2e/`) and `test:perf` (when it has `perf/`). `check` runs
`pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test` in that order, then a tail that holds
whichever of `pnpm smoke` and `pnpm test:app` exist, after `pnpm build` when the repository has one:
`… && pnpm build && pnpm smoke && pnpm test:app`. Neither `smoke` nor `test:app` builds
itself: the build happens once, in `check`'s tail. `check` never
contains an e2e or perf step, and `test` never reaches `e2e/` or `perf/`. `scripts/repo-audit.ts`
checks these rules. `check` is the done-set; `context.md` says what that means for a change.

## Versions

`references/versions.md` is the source list of tool versions. A repository declares those ranges
exactly. To propose a bump, or to apply an approved one, follow the procedure in that file.

## AGENTS.md

`references/agents-md.md` has the skeleton and the notes on each section. The first three `##`
sections are Read first, Commands and Rules, in that order. Between the purpose and Read first
stands the opt-in line, exactly `This repository follows the dx repo standard.`: `context.md`
applies only where it is present, and the audit checks it verbatim. A dispatched agent sees no
AGENTS.md, so a brief that sends an agent into such a repository includes that line and the
repository rules the task touches. A repository's AGENTS.md holds what an agent needs every turn in that repository and cannot
find in `context.md` or a skill. Procedures go to a skill, and a pointer to the skill goes in Read
first.

## specs/AGENTS.md

`references/specs-agents-md.md` has the skeleton. It is a pointer to `dx:writing-specs` plus the
repository's own spec list and differences, and is at most 40 lines. Rules for writing a spec
belong in that skill, not here.

## Opting out

A repository on another stack opts out of the toolchain part only: the tsconfig, config files,
scripts and versions. It keeps the layout, the specs and AGENTS.md shape, and the terms rules.
It says so in its AGENTS.md Rules section, using the opt-out line in `references/agents-md.md`.
The audit detects that line and skips its toolchain checks (package.json, scripts, versions, tsconfig,
oxlint, oxfmt, editorconfig, worktrunk, pnpm-workspace and the lockfile). It still checks the layout, specs,
AGENTS.md shape and, when given `termsFile`, the terms rules.

## Terms

The terms tool's storage file is committed, and it is changed only through the tool's actions, as the
dx context says.
A repository still holding a `specs/thesaurus.md` table migrates it: run the tool's `import` action
with the table's workspace-relative path, then delete the table. `import` fills an empty storage
file only, so migrate into an empty file. Import takes the columns Term, Meaning, Owner, and Avoid
or distinguish.

## Creating a repository

1. Create the directory and run `git init`.
2. Choose the profile, or let the rule above choose it.
3. Copy the config from `references/config.md`: the `package.json` fields, the tsconfig files,
   `.oxlintrc.json`, `.oxfmtrc.json`, `.editorconfig`, `.config/wt.toml`, `pnpm-workspace.yaml` and
   `.gitignore`.
4. Declare the devDependencies at the ranges in `references/versions.md`; `pnpm-lock.yaml` results.
   A bundled repository whose targets use no Node types omits `@types/node`.
5. Write `AGENTS.md` and `specs/AGENTS.md` from the two skeletons, then add the first spec with
   `dx:writing-specs`.
6. When the repository uses the terms tool, create its storage file through the tool's `add` action,
   and commit it.
7. Add a test under `test/`, so `pnpm test` has something to run; `dx:testing` says what it holds.
8. Run `pnpm check` until it is green.
9. Run the audit on the new repository (below), with `termsFile` when step 6 applied. It must report
   nothing to fix.

## Auditing

The dx plugin script `scripts/repo-audit.ts` checks repositories against this baseline. Run it with
the `Script` tool:

- `plugin: "dx"`, `path: "scripts/repo-audit.ts"`, `input: {}`: audits the current working directory.
- The same with `input: { "repos": ["/abs/path", "/abs/other"] }`: audits each listed repository.
- `termsFile` in `input`, a path relative to each repository: where the terms tool keeps its storage
  file, for example `input: { "termsFile": "<path>" }`. Without it the audit checks nothing for terms.
- No `input`: returns the script's help.

The script is the checklist, so read its output for what it checks. It is read-only and reports what
it expected. Fix each finding in that repository's own session, and commit it there.
