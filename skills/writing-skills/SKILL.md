---
name: writing-skills
description: >-
  Load before writing or changing a skill (skills/<name>/SKILL.md), a plugin command (commands/<name>.md), or an agent definition's description line. Not for agent bodies or task briefs: load dx:writing-for-agents for those.
---

# Writing skills, commands and agent descriptions

A skill is loaded on demand. Its `description` is the only text a model reads before deciding
whether to load it, so most of the skill's use depends on that one line.

## The description is a trigger

Write the description as an instruction about when to load or invoke the thing, not a summary of
what is inside. A summary tells the model what the skill is about; a trigger tells it when to act,
which is the decision it actually makes.

- Start with the trigger: "Load before …", "Use when …", or, for a command, what invoking it does.
- Name the concrete actions, files or artifacts the reader will be touching.
- One or two sentences.
- If a neighbouring skill could be confused with this one, say what this one does not cover and
  name that skill.

These examples illustrate the qualities; they are not templates to copy.

- Summary, bad: "The dx baseline for a TypeScript/pnpm, spec-first repository: layout, profiles,
  toolchain config, and the AGENTS.md shape."
  Trigger, good: "Load before creating a repository, changing its tooling, config files or
  AGENTS.md, bumping a tool version, or auditing a repository for drift."
- Vague, bad: "Helps with searching documentation."
  Concrete, good: "Load before searching a repository's specs or docs with qmd, or before claiming
  a rule does not exist."
- No boundary, bad: "How to write agent definitions and task briefs for dispatched agents."
  Bounded, good: "Load before writing or reviewing an agent definition body or a task brief for a
  dispatched agent. Not for skills or commands: load dx:writing-skills for those."

Test the description: a fresh agent should load the skill for the tasks it names and skip it for
the neighbouring tasks.

## Frontmatter must parse

- Write `description` as a `>-` block scalar. A plain scalar that contains `: ` or starts with a
  YAML indicator (`` ` ``, `*`, `&`, `[`, `{`, `>`, `|`, `#`, `@`, `%`, `!`) does not parse, and the
  host skips the skill.
- A skill's `name` equals its folder name.
- In dx, `pnpm test` parses the frontmatter of every skill, command and agent; run it before committing.

## The body is instructions

- Open with what the reader needs first: the procedure, the commands, or the rule that governs the
  rest.
- Write what the code does not show: build, test and lint commands, conventions, where things
  live, traps that cost time. Leave out what the reader sees by opening the file or reading a tool
  schema.
- Be exact. Commands in complete, runnable form; paths and identifiers verbatim.
- Give the reason with each rule that is not obvious. A rule without its reason is applied to the
  wrong cases.
- A command body is a prompt, run after `$ARGUMENTS` is substituted. Write it as instructions to
  the agent that receives it, and state what it may change.

## Brief and thorough

- Cover every decision point and every trap the reader will meet. A missing one costs a whole run.
- Cut every sentence that does not change what the reader does.
- State each rule once, where its reader will look. Two copies drift into two rules.
- Put long reference material (configs, tables, version lists) in `references/*.md`, and point to
  each file with the condition for reading it. The reader loads it only when needed.
- Target 50–150 lines for SKILL.md. Longer means material belongs in `references/`.

## Keep it true

- Check every claim against the repository before writing it. A wrong instruction is followed as
  faithfully as a right one.
- Change the skill or command in the same commit as the behavior it describes.
- Delete what no longer applies. Do not leave it marked as deprecated.

## Test it

Run a fresh agent that has only the skill (or command) and a real task from this repository's
work. Read what it does. When it goes wrong, find the sentence that led it there and fix that
sentence. A rule added for the one failing case leaves the cause in place.
