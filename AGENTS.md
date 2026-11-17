# dx

A generic development plugin: shared skills, commands, scripts, and an always-on context.

## Layout

| Path                        | Holds                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| `plugin.json`               | plugin name, description and version                                   |
| `package.json`              | dx's package.json exists only for its tests: `pnpm test`              |
| `context.md`                | always-on rules, in every session's prompt                             |
| `skills/<name>/SKILL.md`    | a skill: frontmatter `name` and `description`, then instructions       |
| `skills/<name>/references/` | `.md` material a skill points to, read only when needed                |
| `commands/<name>.md`        | a command: `description` frontmatter, then a prompt using `$ARGUMENTS` |
| `scripts/`                  | scripts run with the `Script` tool, e.g. `scripts/repo-audit.ts`       |
| `docs/`                     | non-normative notes for maintainers                                    |

## Rules

- dx is generic. Its text names no host, no project, no model id and no path under a host or project. Stack
  choices are written as "this baseline uses X", so another stack can opt out.
- Write skills, commands and agent descriptions following `skills/writing-skills`; agent bodies, task briefs and this file following `skills/writing-for-agents`. Write `docs/` following `skills/writing-docs`.
- `context.md` is in every session's prompt, so each line costs tokens on every turn. Add a line
  there only for a rule that must hold in every session.
- Check every claim against real repositories before writing it. A wrong instruction is followed
  as faithfully as a right one.
- Work in dx as in a repository that follows the dx repo standard for the commit and shared-tree rules of the dx context; done on main is `pnpm test`, which stands in for `pnpm check`.
