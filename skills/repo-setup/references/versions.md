# Tool versions

This is the list of tool versions for the baseline. Two other places repeat it: the `package.json`
fragment in `config.md`, and the constants `VERSIONS`, `PACKAGE_MANAGER` and `NODE_RANGE` in
`scripts/repo-audit.ts`. The dx test `scripts/references.test.ts` fails when they differ.

| Tool          | Range     | Declared in                                                 |
| ------------- | --------- | ----------------------------------------------------------- |
| `oxlint`      | `^1.93.0` | `devDependencies`                                           |
| `oxfmt`       | `^0.77.0` | `devDependencies`                                           |
| `typescript`  | `^7.0.2`  | `devDependencies`                                           |
| `@types/node` | `^26.6.6` | `devDependencies`, when the repository uses Node types      |
| pnpm          | `12.18.0` | `packageManager` in `package.json` (an exact pin, no range) |
| Node          | `>=26`    | `engines.node` in `package.json`                            |

A repository declares these ranges exactly, for each tool it declares. Any other range is a drift
finding.

## Bumping a version

Any session may propose a bump, with the new version and the reason. The user approves it. Then:

1. In dx, in one commit, change all three places: the row in this file, the matching range in the
   `package.json` fragment of `config.md`, and the constant (`VERSIONS`, `PACKAGE_MANAGER` or
   `NODE_RANGE`) in `scripts/repo-audit.ts`.
2. In each repository, change `package.json` to the new range or pin, then run `pnpm install` with
   the pinned pnpm. Commit `package.json` and `pnpm-lock.yaml` together.
3. Run `pnpm check` in that repository. A Node bump also moves `engines.node` and, when used,
   `@types/node`, to the same major.
4. Run the audit on the repositories you changed.

Repositories update one at a time, each in its own session. A repository that has not caught up
is a drift finding, not an error in dx.
