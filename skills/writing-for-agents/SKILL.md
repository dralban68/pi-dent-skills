---
name: writing-for-agents
description: >-
  Load before writing or reviewing an agent definition body or a task brief for a dispatched agent. Not for skills or commands: load dx:writing-skills for those.
---

# Writing for agents

The reader is a capable model that knows nothing about this project, this conversation, or what
you have learned so far. The text you write is all it has. Write the way you would brief a
skilled colleague who just walked in: give the situation, the goal, and the reasons, then trust
their judgment.

## What each reader sees

| Text       | Read by                         | Holds                                      |
| ---------- | ------------------------------- | ------------------------------------------ |
| Agent body | The agent, as its system prompt | What this agent is for, every time it runs |
| Task brief | The agent, as its first message | This one job                               |
| Skill      | Whoever loads it, on demand     | A procedure needed for some tasks, not all |

A dispatched agent sees its body, the skill catalog, every plugin's always-on context, and the task
brief. It does not see the conversation or any project documentation. A project convention the agent must follow has to be
in its body or in the brief, or it will not be followed.

Put each fact in the one place its readers need it: a procedure used occasionally belongs in a
skill, not in text the reader carries every turn.

## Agent bodies

An agent definition is a Markdown file: frontmatter, then the body, which becomes the agent's
system prompt.

- `name`: how the agent is dispatched.
- `description`: see `dx:writing-skills`.
- `model`: set it only when the agent needs a particular model; otherwise leave the choice to
  the dispatcher.

Writing the body:

- **Open with the situation.** Say what the agent is for, who uses its output, and what good
  output looks like. A one-line identity ("You are a reviewer") tells the agent nothing it can
  act on.
- **Give the reason with every constraint.** "Do not edit files outside `lib/`: other agents are
  editing `test/` at the same time" lets the agent handle a case you did not foresee. The bare
  rule does not.
- **Spend the words on the judgment calls.** Leave out what any competent engineer does anyway.
  Write about what is specific to this job: where the obvious approach is wrong, what to do when
  two goals conflict, how far to go before stopping.
- **State what the agent may do.** Name what it can change freely, what needs confirmation
  (anything destructive or hard to undo), and when to stop and report instead of pressing on.
- **Define what comes back.** The dispatcher reads the agent's final message as raw material.
  Ask for the answer first, then the evidence, with what was verified kept apart from what was
  inferred. If several agents report in parallel, ask them all for the same shape.
- **Mention a tool only to say when to use it.** Schemas already describe parameters. Guidance
  such as "search before reading whole files" is what the schema lacks.
- **Write calmly.** Capitals, "never", and repeated warnings make a model apply the rule far
  more broadly than intended. If something matters, one sentence of reasoning does more.
- **Be careful with examples.** One example gets followed closely. Either describe the qualities
  you want in prose, or give several examples that differ from each other and say they are
  illustrations.
- **Use prose for reasoning and structure for reference.** Priorities and trade-offs need
  sentences that connect them. Lists and tables suit things the agent looks up: commands, paths,
  field names.

## Task briefs

The brief is the agent's whole understanding of the job. A dozen words that are a complete
thought to you are an underspecified request to a reader starting from zero. Three or four
paragraphs is a normal length. Its first sentence says what the agent is to do: hosts show it as
the task's label. Standing lines that every brief carries (an opt-in line, a shared rule) go at the
end. Cover:

- The goal and what it serves, so the agent knows what to optimize.
- What done looks like. Without it the agent stops too early or never stops.
- What you already know: what you ruled out, what you tried, and why it failed.
- What makes the job hard, especially when an obvious approach is the wrong one.
- Constraints: scope, files it must not touch, project conventions it has to follow, the checks
  to run.
- What to return, and in what shape.

Give exact paths, identifiers, and error text. Pass the user's own wording when the request came
from them; your paraphrase loses detail.

## Skills and commands

Writing skills and plugin commands: see `dx:writing-skills`.

## Before you finish

Reread the text as its reader: nothing else in context, no knowledge of this conversation. Check
that every term is defined or obvious, that nothing refers to "the approach above" or a label
you invented while working, and that a capable engineer handed the same text would know what to
do and why.

Then run it. Dispatch the agent on a real task, or follow the document yourself, and read what
comes out. When the output is wrong, find what in the text led there and fix that understanding.
