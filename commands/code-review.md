---
description: >-
  Use to review code for bugs, races, leaks, security problems and drift from its specification, read-only, with ranked, verified findings. Argument: a file, a directory, a git range, `checkpoint` for the work since the last code-review checkpoint, `changes` for uncommitted work, or nothing for the whole repository.
---

Review code in the repository in the current working directory. This is a read-only review:
report findings and do not edit, format, stage, stash or commit anything. Other sessions may share
this working tree, and the user decides what to change.

Scope argument: `$ARGUMENTS`

## Scope

- Empty: the whole repository: all source (`index.ts`, `lib/`, `src/`, `scripts/`, whichever
  exist) and all tests, against all specs. This is the common case.
- `changes`: the uncommitted changes, i.e. `git diff HEAD` plus untracked files outside ignored
  paths. If the tree is clean, say so and stop. Other sessions may share this tree, so some of
  these changes may be theirs; review them anyway and note that the scope may span sessions.
- One or more paths: those files, or the files inside those directories.
- A git range (`A..B`, or one commit): the files that range changed, reviewed as they are now, with
  the diff showing what changed.
- `checkpoint`: the range from the last code-review checkpoint to `HEAD`, i.e.
  `$(git log -1 --format=%H --grep='^checkpoint: code review')..HEAD`, treated as a git range. With
  no checkpoint yet, say so and review the whole repository.

For a diff scope, judge the changed lines, but read enough of the surrounding code, its callers
and its spec to tell whether the change is correct. State the resolved scope at the top of the
report.

## Before reading

1. Read the root `AGENTS.md` for this repository's commands and rules. Its layout and done-set come from `dx:repo-setup` and the dx context.
2. For each file in scope, find the spec that owns its behavior: the spec named after the subject
   (`lib/<subject>.ts` → `specs/<subject>.md`), else the spec that defines its identifiers
   (search `specs/`). Read the sections that apply. Code with no owning spec is itself a finding
   when the repository is spec-first.
3. Find the tests for that code by searching `test/` for the module's exports, and its smoke,
   app-behaviour and end-to-end tests when those exist.

## What to cover

Each area below gets either findings or the explicit line "nothing found", so the reader knows
it was checked rather than skipped:

1. Correctness and edge cases: wrong logic, off-by-one errors, empty, missing and boundary inputs,
   unhandled variants.
2. Error handling: errors swallowed, reported with the wrong cause, or leaving state half-written.
3. Races and ordering: async interleaving across `await`, shared files and stores written by
   several sessions or processes, stale reads, check-then-act, ordering that tests rely on but the
   code does not guarantee.
4. Resource leaks: handles, watchers, timers, child processes, listeners and database connections
   not released on every path, errors included.
5. Security boundaries: path containment, injection into shells, SQL or HTML, secrets reaching
   logs, replies or fixtures, trust placed in input from a renderer, a tool call or a file.
6. Spec drift, both directions: behavior the spec does not state, and spec requirements that are
   not implemented or not tested.
7. Tests, measured against `dx:testing`: the reviewer loads that skill and judges each test by its
   rules for kind, place and what it may assert.

Style and formatting are out of scope: the linter and the formatter own them.

## Large scopes

A whole-repository review, and any scope of more than about fifteen files or three spec subjects,
is split across parallel reviewer agents on the model your session's model guidance names for review (or your own model when there is none), one per subject: its code, its tests and
its spec together, since drift is only visible with all three. A reviewer sees only its brief, not
the repository's `AGENTS.md`, so the brief must carry: the repository path, its file list and
owning spec, the "What to cover", "Verification" and "Report" sections of this command reproduced
verbatim, the read-only rule with its reason (a shared working tree), and the repository's own
rules that bear on the review. The brief also says that a reviewer judging tests (area 7) must load
`dx:testing` first and measure the tests against it. When the repository's `AGENTS.md` contains
`This repository follows the dx repo standard.`, put that line at the end of the brief too.

Races and leaks often cross subject lines. After the reviewers return, check the interactions
yourself: shared stores, shared files, and calls between subjects. Then merge: drop duplicates,
keep the more precise account, and verify as below.

## Verification

Report only what you confirmed. Before keeping a finding, open the cited lines and trace the path
that triggers it: the input, the interleaving or the error that leads there. You may run the
repository's existing checks (`pnpm test`, `pnpm typecheck`) and write a throwaway reproduction
under the system temp directory, never inside the repository. A race needs a concrete
interleaving, not "this might race". Discard anything you cannot confirm, including findings from
reviewer agents that do not hold up when you check them.

## Report

Start with the scope and a one-line verdict. Then list findings grouped by severity:

- **Critical**: data loss, a security hole, or a crash on a common path.
- **High**: wrong behavior on a reachable path, or a spec requirement violated.
- **Medium**: an edge case handled wrongly, a leak, or a requirement left untested.
- **Low**: a robustness or clarity problem with no wrong behavior today.

Each finding gives:

- the location, as `path:line` (and `specs/<file>.md §<section>` for drift);
- the evidence: the quoted code and the triggering input or interleaving;
- why it matters: what goes wrong, for whom;
- the suggested fix, and for drift whether the code or the spec should change (`dx:writing-specs`,
  Changing a spec).

End with the coverage list: each of the seven areas with its finding count or "nothing found". If
the code is sound, say so. Do not pad the report with Low findings to look thorough.

## Checkpoint

The review itself commits nothing. Once the findings the user accepts are fixed and committed, or
the review found none, commit an empty checkpoint in the worktree the review covered, so the next
review can start from it (`checkpoint` scope):
`git commit --allow-empty -m "checkpoint: code review of <scope>: <verdict>"`. It survives
`wt merge --no-squash`.
