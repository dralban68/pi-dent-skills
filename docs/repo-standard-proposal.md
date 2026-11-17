# Proposal: a standard repo setup and AGENTS.md

Historical. Superseded by `skills/repo-setup` and `scripts/repo-audit.ts`; where they differ, they win.

Draft for review. Scope: pi-dent, pi-dent-app, pi-dent-terms, pi-dent-markdown, purse (all under
`/Users/dralban68/src`). Facts below were checked against the repos on 2026-11-14.

## 1. Where the suggestion holds, and where it needs changing

Kept: a generic `repo-setup` skill in dx, a fixed AGENTS.md section order, an audit, per-repo
rollout through each repo's own session, pi-dent's specifics moved out of dx.

Changed or added:

1. **The shared wording must not be hand-copied five times.** `writing-for-agents` says state each
   rule once; the commit and shared-tree rules already differ in three repos (pi-dent lists the
   checks, pi-dent-app and pi-dent-terms say "the checks above"). Two ways to keep one source:
   - (a) **Shared blocks** in each AGENTS.md between `<!-- dx:shared <name> -->` and
     `<!-- /dx:shared -->`, written from `dx/skills/repo-setup/references/shared/<name>.md` by a dx
     script; the audit fails when a block differs. Each repo stays self-contained (other
     harnesses, clones elsewhere).
   - (b) **One parent file**, `/Users/dralban68/src/AGENTS.md`: pi loads context files from the
     working directory and its parent directories (pi `docs/configuration.md`, "Context files"),
     so every repo and worktree under `src/` gets it with zero duplication. Costs: it applies to
     everything under `src/`, it is invisible to a clone elsewhere, and it is unverified whether
     pi-dent's dispatched agents receive context files.
   Recommendation: (a), unless the user wants (b).
2. **Name the checks once, as a script.** Every repo gets `pnpm check`, running its own done-set
   (pi-dent-terms: `typecheck lint fmt:check test`; pi-dent-app adds `build smoke`). AGENTS.md and the
   shared commit wording then say "`pnpm check` is green" and stay identical across repos.
3. **`specs/AGENTS.md` is the bigger drift.** Four copies (pi-dent 95 lines, pi-dent-terms 97, pi-dent-app
   90, purse 71) with different sections (purse has no `Thesaurus`), alongside
   `dx/skills/writing-specs`. Standard: the skill holds the rules; `specs/AGENTS.md` is a short
   pointer to it plus that repo's deltas (spec list, naming such as `<subject>-tool.md`). The
   audit checks its form. pi-dent-markdown has none and borrows pi-dent's: decide whether that stays.
4. **Layout needs profiles.** pi-dent-app is Electron with `src/` and `scripts/`, not `lib/`;
   pi-dent-markdown is a library, not an extension. Core for all: `specs/`, `test/`, `docs/`,
   `.pi/pi-dent/`. Per profile: extension (`index.ts`, `lib/`, `pi.extensions`), library (`index.ts`,
   `lib/`, consumed via `link:`), app (`src/`, `scripts/`, `dist/`).
5. **The Read first table lists only what an agent would not find or know to read.** Drop the
   "`AGENTS.md` (this file)" row (it is already in context) and layout rows like `lib/` or
   `index.ts` (the skill covers layout). Each row should say when to read it, as pi-dent-app's
   `docs/development.md` line does.
6. **Formatting of Markdown is inconsistent.** pi-dent-terms excludes `specs/**` in `.oxfmtrc.json`;
   pi-dent and pi-dent-app format Markdown, specs included. Pick one.

## 2. Skill outline: `dx/skills/repo-setup/SKILL.md`

```yaml
name: repo-setup
description: The standard setup of Dralban68's TypeScript repos (layout, toolchain, scripts,
  AGENTS.md skeleton) and how to create a repo or audit one against it. Load when creating a
  repository, changing its tooling, config files or AGENTS.md, or checking it for drift.
```

Body, instructions only:

1. **Profiles and layout**: the core table and the three profile tables (§1.4).
2. **Toolchain**, each with the reason it exists:
   - `package.json`: `"type": "module"`, `packageManager: "pnpm@12.18.0"` (one version across repos),
     scripts `test`, `typecheck`, `lint`, `fmt`, `fmt:check`, `check`; pnpm only, no
     `package-lock.json`.
   - `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
     `erasableSyntaxOnly`, plus `allowImportingTsExtensions` for no-build packages; what each
     forbids.
   - `.oxlintrc.json`: the baseline rules (`consistent-type-assertions: never`, no non-null
     assertion, no `any`, …) and the `test/` relaxations; convert with a type guard, not a cast.
   - `.oxfmtrc.json`: present in every repo, with the agreed Markdown policy (§1.6).
   - `node:test` running `.ts` directly; `test/` mirrors `lib/`.
3. **Scripts contract**: names and meaning; `check` is the done-set.
4. **AGENTS.md**: the skeleton (§3), what belongs there (needed every turn) versus in a skill
   (needed for some tasks), and how to refresh shared blocks.
5. **Specs and terms**: `specs/AGENTS.md` form (§1.3); terms live in `.pi/pi-dent/terms.yaml`,
   managed only by the `Terms` tool; migrating from `specs/thesaurus.md` with `Terms` `import`.
6. **Creating a repo**: ordered steps, ending with `pnpm check` and a clean audit.
7. **Auditing a repo**: run the audit script, fix each finding in that repo's own session, commit
   per repo.

`references/`: `agents-md.md` (skeleton), `shared/*.md` (shared blocks), `tsconfig.json`,
`.oxlintrc.json`, `.oxfmtrc.json`, `package.json` fragment. The skill points at them instead of
inlining config.

`scripts/repo-audit.ts` (dx plugin script, run with the `Script` tool, input `{ repos: [...] }`):
reports per repo, as one table: `packageManager` pinned and equal; required scripts present;
config files present; tsconfig flags; lint rule; no `package-lock.json`; AGENTS.md sections in
order; shared blocks identical; `specs/AGENTS.md` form; terms in `terms.yaml`, not
`thesaurus.md`. The script is the checklist; the skill does not repeat it. Optional `--write`
refreshes shared blocks only.

pi-dent's current skill moves to `pi-dent/.pi/pi-dent/skills/pi-dent-setup/SKILL.md` (pinned pi release,
`file:` links, `lib/bundled.ts`, `pi -ne -e ./`, where work lands in pi-dent).

## 3. AGENTS.md skeleton

````markdown
# <name>

<One or two lines: what this is and who consumes it.>

## Read first

| Document | Holds, and when to read it |
| -------- | -------------------------- |

## Specifications are the source of truth

<!-- dx:shared specs -->

- Read `specs/AGENTS.md` before writing or changing a spec.
- Terms: use the `Terms` tool. `find` a domain term before writing it in any Markdown file;
  change entries only through its actions; a spec must not use an undefined term.
  `.pi/pi-dent/terms.yaml` is the tool's storage: do not edit it directly.
- Behavior changes land as spec changes first; an implementation must not deviate from its
  spec — close or narrow the gap in the spec instead.
<!-- /dx:shared -->

<Repo-specific lines, e.g. docs/concepts.md is non-normative.>

## Commands

```sh
pnpm check        # the done-set: <list>
pnpm test
pnpm typecheck
pnpm lint
pnpm fmt          # rewrites files
pnpm fmt:check
<repo-specific commands>
```

## Rules

<!-- dx:shared rules -->

A change is done when `pnpm check` is green and the `Terms` tool's `check` reports no findings.

Lint is oxlint with `consistent-type-assertions` set to `never`: no `as`, no `any`, no non-null
assertions — convert with a type guard or narrow the declaration. `tsconfig` is strict plus
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `erasableSyntaxOnly`, so index access
yields `T | undefined` and enums, parameter properties and namespaces are unavailable.

Install with pnpm only; `packageManager` pins its version. Never run `npm install` or commit a
`package-lock.json`.

Be brief in specs, code, comments and replies; do not restate what the code says.
<!-- /dx:shared -->

<Repo-specific rules: identifiers it owns, security boundaries, design system, secrets.>

## Commits and the shared tree

<!-- dx:shared commits -->

Commit frequently: one commit per logical task, once that task is done and `pnpm check` is green.

Other sessions may share this working tree. Never run `git stash`, `git reset`, `git checkout --`
or `git clean`: they take other sessions' uncommitted work with them. Commit only your own files,
by path. When another session's changes are in your way, conflict with yours, or break a check,
resolve it with that session through `Fleet` (`list` to find it, `send` or `query` to agree)
instead of reverting or overwriting its work.
<!-- /dx:shared -->

## <Repo-specific sections: qmd search, Secrets and accounts, …>
````

## 4. Review commands

Written: `dx/commands/spec-review.md` and `dx/commands/code-review.md`, invoked as
`/dx:spec-review [scope]` and `/dx:code-review [scope]`. Both are read-only, cover a fixed list of
areas (seven each) and report "nothing found" per area instead of padding. Both verify every
finding against the source before reporting it, and rank findings with location, evidence, why it
matters and a fix. Above a size threshold, both split the work across parallel
`anthropic/claude-opus-5-5` reviewers and run the cross-slice pass themselves.

- **Default scopes (user decision).** With no argument both review the whole repository:
  spec-review all of `specs/`, code-review all source and tests against all specs. A path or a
  git range narrows the scope; `/dx:code-review changes` reviews the uncommitted changes. A whole-repository review always splits across parallel
  reviewers, by spec cluster or by module.
- **spec-review reuses `writing-specs`.** That skill's "Reviewing a spec" section already owns the
  passes and the severity scale (Blocking, Should-fix, Minor). The command loads the skill instead
  of restating it, and adds scope, coverage, verification and the report shape.
- **code-review severities:** Critical, High, Medium, Low. Drift findings say whether the code or
  the spec should change; a choice the spec never made is left to the user.
- **Not yet tested.** The `Plugin` tool reports no `dx` namespace in this session ("Known
  namespaces: (none)"), so neither the commands nor the planned audit script can be invoked
  until dx is installed as a plugin.

## 5. Tooling baseline (stack-generic)

dx is a generic development plugin, so its guidance names no host (pi-dent, pi). It defines a
baseline for TypeScript/pnpm repositories, phrased as "this baseline uses X": a repository on
another stack states in its AGENTS.md that it opts out of the toolchain part and keeps the rest
(specs first, commits, shared tree).

### 5.1 Distribution: templates plus audit

The canonical files live as templates in `dx/skills/repo-setup/references/`; each repository holds
its own copy, and the audit script reports drift. Rejected alternatives:

- oxlint `extends` / tsconfig `extends` with a path into dx: ties every clone to dx's location on
  this machine and breaks any build outside it.
- Symlinks: same problem, and invisible in review.
- A published shared-config package: the right answer once there is CI or a second machine; today it
  adds a release step for five repositories on one disk. Revisit with CI.

The audit is read-only. It prints the expected content for each drifted file; the repository's
session applies it.

### 5.2 Profiles

| Profile    | Runs as                                                    | tsconfig                                                                          |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `node-esm` | `.ts` executed directly (Node type stripping), no build    | one `tsconfig.json`: NodeNext, ES2023, `allowImportingTsExtensions`, `noEmit`     |
| `bundled`  | built by a bundler into `dist/` (apps, multi-target code)  | `tsconfig.base.json` with the shared flags + one project per target, `bundler` resolution |

Both carry `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`erasableSyntaxOnly`, `skipLibCheck`. pi-dent, pi-dent-terms, pi-dent-markdown and purse are `node-esm`;
pi-dent-app is `bundled`. Being a pi extension is not a profile: `pi.extensions`, the `file:` links
into `~/.pi/agent/install/releases/<ver>/`, pi's `minimumReleaseAgeExclude` entries and jiti
loading move to a pi-dent document (proposed: `pi-dent/docs/pi-extension.md`, or a pi-dent-local skill)
that the extension repositories point to from their Read first table.

### 5.3 Files and canonical content

| File                  | Baseline                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`        | `"type": "module"`, `"private": true`, `"packageManager": "pnpm@12.18.0"`, `"engines": { "node": ">=26" }` (no `engines.pnpm`: `packageManager` is the pin). Scripts below. Tool versions per 5.4.                                                                  |
| `.oxlintrc.json`      | `$schema` `./node_modules/oxlint/configuration_schema.json` (four repos point at a non-existent `configuration-schema.json`). The shared rule set of the four `node-esm` repos, unchanged. The `test/**` override is part of the baseline (see below). |
| `.oxfmtrc.json`       | `$schema` `./node_modules/oxfmt/configuration_schema.json`; `ignorePatterns` only for generated files (`dist`, `pnpm-lock.yaml`); Markdown, specs included, is formatted.                                                                                    |
| `tsconfig*.json`      | per profile (5.2).                                                                                                                                                                                                                                              |
| `.editorconfig`       | pi-dent-app's file: UTF-8, LF, 2-space indent, final newline, trim trailing whitespace except in `*.md`.                                                                                                                                                         |
| `pnpm-workspace.yaml` | generic part only: `allowBuilds` lists every dependency with a build script explicitly, `true` or `false`; an `overrides` entry carries a comment with its reason. Stack-specific keys (pi's `minimumReleaseAgeExclude`) are allowed and not audited.              |
| `.gitignore`          | `node_modules/`, build output; never the terms file.                                                                                                                                                                                                            |

Scripts: `test` (`node --test test/`), `typecheck`, `lint` (`oxlint .`, plus e.g. stylelint where
the repo has CSS), `fmt` (`oxfmt .`), `fmt:check` (`oxfmt --check .`), and
`check` = `pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test`, followed by a
repository-specific tail (pi-dent-app: `&& pnpm build && pnpm smoke`). The audit checks that `check`
starts with the four baseline steps.

`test/**` relaxation: kept, and pi-dent-app adopts it. Fixtures and mocks in tests legitimately cast
(`as`) and return `undefined` explicitly; the rule's purpose, keeping unchecked casts out of
shipped code, does not apply there. Repositories may add overrides (pi-dent-app: `scripts/**`
`no-console` off, `src/renderer/**` browser env); the audit accepts additions and flags any
override that relaxes a baseline rule outside `test/**`.

### 5.4 Version policy

`references/versions.md` in dx is the one list: pnpm 12.18.0, Node >=26, oxlint ^1.93.0, oxfmt
^0.77.0, typescript ^7.0.2, @types/node ^26.6.6. A bump is a dx change first (one commit to that
list), then each repository's session updates its `package.json` and lockfile; the audit flags any
declared range that differs from the list (today: purse's oxlint ^1.92.0). Any session may propose
a bump; the user approves it. Other dependencies are each repository's own.

### 5.5 Audit

`dx/scripts/repo-audit.ts`, run through the `Script` tool with `plugin: "dx"` from any working
directory. `input: {}` audits the current working directory; `input: { repos: [...] }` audits a
list; no input returns help. Output: one table of findings per repository, each with the check,
what is wrong, and the expected content.

### 5.6 Not in the baseline yet

- CI: no sibling has any. A workflow running `pnpm check` is the natural next step, and the point at
  which a shared-config package (5.1) pays off.
- `context.md` names `Terms` and `Fleet`. Both are tools of the session host, not of the stack, so
  it phrases them as "when the session has the `Terms` tool" and keeps them.

## 6. Open questions for the user

1. Shared text: generated blocks per repo (a) or one `/Users/dralban68/src/AGENTS.md` (b)?
2. `git init` dx? Recommended: the standard and its audit need history, and the commit rules would
   then apply to dx too.
3. Markdown formatting: does oxfmt format `specs/` everywhere, or nowhere?
4. `specs/AGENTS.md`: reduce to a pointer to `writing-specs` plus deltas?
5. pi-dent-markdown: keep using pi-dent's spec rules and terms, or get its own `specs/AGENTS.md` and
   `terms.yaml`? (A `Terms` owner is a workspace-relative path, so pi-dent's file cannot own its
   terms from pi-dent-markdown.)
6. qmd: pi-dent's "Searching the specs with qmd" section, and pi-dent-app's `.pi/qmd`: a shared dx skill,
   or repo-specific?
7. Node: pi-dent-app has `engines.node >=22`, pi-dent's skill says Node 26. Pin one in `engines`
   everywhere?
8. How should dx be registered as a plugin, so that `/dx:*` commands and dx scripts resolve?
   Answered: global `~/.pi/pi-dent/pi-dent.conf` `plugins.dx`, done.
9. pi-dent-app has no `test` script (its checks are `build` and `smoke`). Add node:test unit tests
   under `test/`, or let `test` run the smoke suite?
10. pi-dent-app sets `sortPackageJson: false` in `.oxfmtrc.json`. Keep it as the baseline
    (package.json key order is authored) or drop it everywhere?

## 7. Rollout

1. User answers §4; dx skill, references and audit script written (haiku), reviewed (opus).
2. Audit run over all five repos; findings sent to each repo's session via `Fleet`.
3. Each session aligns its repo and commits; pi-dent first moves its skill to `pi-dent-setup`.
4. Audit rerun until clean.
