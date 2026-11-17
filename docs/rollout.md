# Rolling out the dx repo standard

Instructions for aligning a repository with the dx standard (dx at commit 808ce5f or later). Each
repository's own session applies them, after a reload so that the dx plugin, its skills and its
context are loaded.

## Steps for every repository

1. Load `dx:repo-setup` and `dx:testing`. They are the standard; this file only orders the work.
2. Audit: `Script` with `plugin: "dx"`, `path: "scripts/repo-audit.ts"`,
   `input: { "repos": ["."], "termsFile": ".pi/pi-dent/terms.yaml" }`. Fix every finding, then
   run it again until it reports none. If a finding looks wrong, do not work around it: report it
   to the dx session (01a1da2d) through `Fleet`.
3. Commit per logical task, by path only. A suggested order:
   1. Toolchain: `package.json` (`packageManager`, `engines.node`, scripts `fmt:check` and
      `check`), versions, `.oxlintrc.json`, `.oxfmtrc.json`, `.editorconfig`, `pnpm-workspace.yaml`.
      `pnpm install`, then `pnpm check` green (lint fixes included).
   2. Formatting: `pnpm fmt` over the whole repository, including `specs/` and all Markdown, as
      its own commit; an `.oxfmtrc.json` change that widens what is formatted goes in this commit, so
      the toolchain commit stays green.
   3. Terms: create `.pi/pi-dent/terms.yaml` with the `Terms` tool (`import` from
      `specs/thesaurus.md` when it exists, otherwise `add`). `import` needs every table's header to
      be exactly `Term | Meaning | Owner | Avoid or distinguish`: add a missing Owner column first
      (a link to the owning spec, relative to the thesaurus), then place or drop the returned reject
      candidates, commit it, then delete
      `specs/thesaurus.md` and point every link to it at the term registry. `Terms` `check` must
      report nothing.
   4. `specs/AGENTS.md`: replace it with the skeleton in `dx:repo-setup` (the spec list and this
      repository's differences, at most 40 lines). Before deleting a rule, check that
      `dx:writing-specs` states it. If a generic rule is missing there, do not delete it: send it
      to the dx session so it can be added to dx first.
   5. `AGENTS.md`: rewrite it on the skeleton: purpose, the line
      `This repository follows the dx repo standard.`, then Read first, Commands, Rules (only this
      repository's own rules), then any repository-specific sections. Remove what now lives in
      dx: the spec-first section, the commit and shared-tree rules, the qmd search section (now
      `dx:qmd-search`).
   6. Tests: check the existing tests against `dx:testing`. Report tests that test code structure
      instead of behaviour, with a plan to rewrite them. Do not rewrite them in the same pass.
4. Done when the audit reports nothing, `pnpm check` is green and `Terms` `check` reports
   nothing. Reply to the dx session (01a1da2d) with the commit hashes and whatever you could not
   align.

## pi extension specifics (pi-dent, pi-dent-terms, purse)

They are not part of dx. pi-dent owns them in `docs/pi-extension-repo.md`: the `file:` links into the
pinned pi release under `~/.pi/agent/install/releases/<version>/`, pi's `minimumReleaseAgeExclude`
entries, `pi.extensions` in `package.json`, and loading through jiti. Their earlier text is in dx
history: `git -C /Users/dralban68/src/pi-dent-skills show 945926f:skills/repo-setup/SKILL.md`. The other two
extension repositories list `pi-dent/docs/pi-extension-repo.md` in their Read first table.

## Per repository

- **pi-dent** (01a1d99b): write `docs/pi-extension-repo.md` first and tell pi-dent-terms and
  purse when it is committed. The qmd section of `AGENTS.md` goes away. 17
  findings.
- **pi-dent-terms** (01a1d9bd): drop `specs/**` from `.oxfmtrc.json` `ignorePatterns`. `.gitignore`
  ignores `.pi/`: keep the terms file committed (`.pi/*` plus `!.pi/pi-dent/`, `.pi/pi-dent/*` and
  `!.pi/pi-dent/terms.yaml`, or a narrower ignore). 15 findings.
- **pi-dent-markdown** (01a1d9d3): a library consumed by pi-dent, not a pi extension, so the pi
  extension section does not apply. Add `.oxfmtrc.json`; give each `pnpm-workspace.yaml` override its
  own `#` reason comment; create `specs/AGENTS.md` and the terms file (it has neither). 14
  findings.
- **purse** (01a1d9fe): add `.oxfmtrc.json`, raise oxlint to `^1.93.0`. 15 findings.
- **pi-dent-app** (01a1d981, bundled profile): `engines.node` `>=26` and no `engines.pnpm`; remove
  `sortPackageJson: false` from `.oxfmtrc.json`; add `.pi` to oxlint's `ignorePatterns` and a
  `test/**` override; `test` runs node:test behaviour tests in `test/` for the main-process logic;
  `smoke` stops building, and `check` ends with `&& pnpm build && pnpm smoke`. 16 findings.

## Worktree flow and review checkpoints (dx 2026-11-15)

1. Add `.config/wt.toml` from `dx:repo-setup` (`references/config.md`), commit it on main, and run
   the audit: its `worktrunk` check must pass.
2. From then on, follow the dx context: each feature in a Worktrunk worktree, merged with
   `wt merge --no-squash -y`. After a spec or code review whose fixes are committed, commit an
   empty `checkpoint: <spec|code> review of <scope>: <verdict>`; `/dx:code-review checkpoint`
   reviews what changed since.
3. (dx 2026-11-15, later) The baseline `.config/wt.toml` now leaves every checkout ready to run:
   pre-start installs and builds, pre-merge reinstalls before `pnpm check`, post-merge reinstalls
   and rebuilds the main checkout. Replace the file with the block in `references/config.md`;
   repository-specific steps are appended with ` && `.
4. (dx 2026-11-15, user decision) No full checks in worktrees: `.config/wt.toml` keeps only
   pre-start (install and build), and the audit flags a hook that runs `pnpm check`. In a
   worktree, done is the tests covering the change plus `oxlint` and `oxfmt --check` on the changed
   files; `pnpm install --frozen-lockfile && pnpm check` runs on main once the last parallel
   feature has merged (dx context).
5. (dx 2026-11-15, user decision, supersedes 3 and 4) The only Worktrunk hook sets the worktree
   up: `.config/wt.toml` is exactly the `pre-start` block in `references/config.md` (install and
   build); delete `pre-merge` and `post-merge`. Agents run the tests for their change in the
   worktree and `pnpm check` on main once the last parallel feature has merged (dx context).
