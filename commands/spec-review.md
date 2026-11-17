---
description: >-
  Use to review a repository's specifications for contradictions, ambiguity, term misuse, stale references, duplicated rules and unlisted gaps, read-only, with ranked, verified findings. Argument: a spec file, a directory, a git range, `checkpoint` for the specs changed since the last spec-review checkpoint, or nothing for all of specs/.
---

Review the specifications of the repository in the current working directory. This is a
read-only review: report findings and do not edit, format, stage or commit anything. Another
session may be working in this tree, and the user decides what to change.

Scope argument: `$ARGUMENTS`

## Scope

- Empty: every spec under `specs/`. This is the common case.
- One or more paths: those spec files, or the specs inside those directories.
- A git range (`A..B`, or one commit): the specs that range changed (`git diff --name-only <range>
  -- specs/`), reviewed as they are now, with the diff as context for what changed.
- `checkpoint`: the range from the last spec-review checkpoint to `HEAD`, i.e.
  `$(git log -1 --format=%H --grep='^checkpoint: spec review')..HEAD`, treated as a git range. With
  no checkpoint yet, say so and review all of `specs/`.

In every case the specs in scope are the ones you judge, but read the specs they link to and the
specs that link to them, because a contradiction needs both sides. State the resolved scope at
the top of the report.

## Before reading

1. Load the `dx:writing-specs` skill. Its "Reviewing a spec" section is the procedure: the reading
   list, the five passes (implementer, tester, terms, ownership, edges and gaps) and the severity
   scale (Blocking, Should-fix, Minor). Follow it; this command adds scope, coverage and the
   report shape.
2. Read `specs/AGENTS.md`. The repo's own rules override the skill where they differ. If the
   repo has none, say which rules you applied instead.
3. Find the term registry. When the `Terms` tool is available, use `find` for each domain term and
   run `check` once; otherwise read the registry that `specs/AGENTS.md` names. Do not read the tool's
   storage file as a substitute for the tool.

## What to cover

Each area below gets either findings or the explicit line "nothing found", so the reader knows
it was checked rather than skipped:

1. Contradictions, within one spec and between specs.
2. Requirements that are ambiguous (two implementers would build different observable behavior)
   or untestable (you cannot write the one-line test).
3. Terms: used but undefined, defined in two ways, or one concept under two names, measured
   against the registry.
4. Cross-references: a target file or section that does not exist, or a section number that now
   points at different content after renumbering.
5. Ownership: one rule stated in two places, or a rule owned by the wrong spec; name the spec that
   should own it.
6. Gaps: unspecified behavior not listed in the spec's gaps section, and gaps listed there that the
   body actually settles.
7. Conformance with `specs/AGENTS.md` and the `writing-specs` skill: required sections, their
   order, requirement language.

Reading `lib/`, `src/` and `test/` can confirm an ambiguity; `dx:writing-specs` (Reviewing a spec) says how to judge it.

## Large scopes

A review of all of `specs/`, and any scope of more than about six specs, is split across parallel
reviewer agents on the model your session's model guidance names for review (or your own model when there is none), each owning a cluster of specs that link to each
other. A reviewer sees only its brief, not the repository's `AGENTS.md`, so the brief must carry:
the repository path, its cluster, the instruction to load the `dx:writing-specs` skill and read
`specs/AGENTS.md`, the "What to cover", "Verification" and "Report" sections of this command
reproduced verbatim, step 3 of "Before reading" (how to use the term registry), and the read-only rule with
its reason. When the repository's `AGENTS.md`
contains `This repository follows the dx repo standard.`, put that line at the end of the brief too.

Splitting hides contradictions between clusters. After the reviewers return, do the ownership and
contradiction passes yourself across the whole scope, for the key rules and identifiers each
reviewer reported. Then merge: drop duplicates, keep the more precise wording, and verify as below.

## Verification

Report only what you confirmed in the text. Before keeping a finding, open the cited section and
quote it; for a contradiction, quote both sides; for a missing term or a broken reference, show the
search that came back empty. Discard anything you cannot confirm, including findings from
reviewer agents that do not hold up when you check them.

## Report

Start with the scope and a one-line verdict. Then list findings grouped by severity (Blocking, then
Should-fix, then Minor). Each finding gives the location, as `specs/<file>.md §<section>`, and the
rest that `dx:writing-specs` (Reviewing a spec) requires.

End with the coverage list: each of the seven areas with its finding count or "nothing found". If
the specs are sound, say so. Do not pad the report with Minor findings to look thorough.

## Checkpoint

The review itself commits nothing. Once the findings the user accepts are fixed and committed, or
the review found none, commit an empty checkpoint in the worktree the review covered, so the next
review can start from it (`checkpoint` scope):
`git commit --allow-empty -m "checkpoint: spec review of <scope>: <verdict>"`. It survives
`wt merge --no-squash`.
