# specs/AGENTS.md skeleton

Copy this into `specs/AGENTS.md`. The rules for writing a spec live in the `dx:writing-specs` skill;
this file holds only the repository's own list and differences. Keep it at most 40 lines.

````markdown
# <name> specifications

Write and review specs per the `dx:writing-specs` skill, which defines the requirement keywords and
the conformance rule. This file holds only this repository's differences from it.

## Specs

| Spec           | Subject                 |
| -------------- | ----------------------- |
| `<subject>.md` | <what the spec defines> |

## Differences

<Naming, required sections or conventions particular to this repository; "None." when none.>
````

- **The pointer line** names the skill, so the rules are read from one place.
- **Specs** lists every spec file in this folder, one row each, with its subject. Add a row when a
  spec is added, in the same commit.
- **Differences** records only what departs from the skill or adds to it, for example a naming
  pattern for paired files. Write "None." rather than deleting the section.
