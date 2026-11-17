# AGENTS.md skeleton

Copy this into the repository root and fill the angle-bracket parts. Delete any empty section after
Rules; keep Read first, Commands and Rules, and write "None." in an empty one. Notes follow each
section; delete them in the copy.

````markdown
# <name>

<One or two lines: what this repository is and who consumes it.>

This repository follows the dx repo standard.

## Read first

| Document              | Holds, and when to read it                 |
| --------------------- | ------------------------------------------ |
| `docs/development.md` | <what it holds> — read before touching <X> |

## Commands

```sh
pnpm check        # the done-set: typecheck, lint, fmt:check, test, then the tail of optional smoke and test:app (dx:repo-setup, Scripts)
pnpm test
pnpm typecheck
pnpm lint
pnpm fmt          # rewrites files, Markdown included
pnpm fmt:check
<repository-specific commands, one per line, each with its purpose>
```

## Rules

<Repository-specific rules only: identifiers it owns, security boundaries, design system, secrets.>

<Opt-out line, only when it applies:>
Opts out of the dx toolchain baseline: <what it uses instead>.

## <Repository-specific section>

<Anything an agent needs on every turn here and cannot find in context.md or the skills.>
````

- **Title and purpose.** Say what the thing is and who uses it, not what it aspires to be.
- **The compliance line** is the sentence above, verbatim. It tells the reader that the baseline
  in `dx:repo-setup` applies.
- **Read first** lists only documents a reader would not find or know to open, each with the
  moment to read it. Leave out `AGENTS.md` itself and rows for layout, which `dx:repo-setup` covers.
  A repository that keeps specs in qmd may add a row pointing to `dx:qmd-search`.
- **Commands** are complete and runnable from the repository root. `pnpm check` comes first and
  its comment names the steps, so a reader knows the done-set without opening `package.json`.
- **Rules** holds what this repository owns and no other. The always-on rules (commits, the shared
  tree, brevity, spec-first, terms, done, lint and tsconfig consequences, pnpm only) live in
  `context.md`; do not copy them here.
- **The opt-out line** is for a repository on another stack. It keeps the rest of this file and the
  standard's layout and specs rules, and replaces only the toolchain part; the audit skips the
  toolchain checks for it.
- **Procedures** (how to create a spec, how to run a review, how to search) belong in a skill, with
  a pointer from a row in Read first only when the reader needs one to find it.
