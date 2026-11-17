---
name: writing-docs
description: >-
  Load before writing, splitting, restructuring or reviewing a repository's documentation under docs/ or its README. Not for specs (dx:writing-specs), skills and commands (dx:writing-skills), or AGENTS.md and task briefs (dx:writing-for-agents).
---

# Writing repository docs

Docs say how to work on the repository and why it is built that way. Specs decide behaviour; docs
point to them. Write so a reader reads only what the task needs, and no more words than it needs.

## Brief

- Every sentence changes what the reader does or understands. Cut the rest: introductions,
  summaries of what follows, history, restated headings, hedges.
- One idea per sentence; short words; the active voice. A list or table beats a paragraph of
  items.
- Show, don't describe: the command, the path, the error text, verbatim in code spans.
- Rewriting a doc means shortening it. Keep each fact and its reason; drop the words around them.
  Measure the saving in words (`wc -w`), not lines: the formatter keeps prose wrapping as written.

## Layers

Each layer is read only when the one above sends the reader there.

1. **`AGENTS.md`, Read first**: a row per entry doc, saying what it holds and when to read it.
2. **Index doc** at a stable path (`docs/development.md`): a paragraph on what the subject is made
   of, the few rules every reader needs, and a map: `File | Read it when you are about to …`.
3. **Topic files** in a folder named after the index (`docs/development/<topic>.md`): one subject
   per file, the one a reader works on as one task.
4. **Reference detail** (long tables, research notes, measurements, per-suite lists): at the end of
   its topic, or in its own file.

A doc under about 200 lines has no index or folder.

## Each file

- Open with one or two sentences: what it covers, when to read it.
- Each section: the rule or procedure first, then the reason, then the detail. A reader who stops
  anywhere has the most important part.
- A link to a deeper file says when to follow it ("read before changing the PDF pipeline"), not
  just its title.
- Refer to a section as `<file>, <heading>`, never by line number.

## Split, move, merge

- Split past about 200 lines, or when different tasks need different parts. Keep one topic in one
  file.
- Keep the entry path stable; other files, code, test fixtures and repositories point to it.
- After a split or rename, `rg -n` the old path, its bare file name and each moved heading over the
  repository (code and test comments included) and the sibling repositories that link in; fix
  every hit.
- A split may move text verbatim in its own commit, so the move is easy to review. The rewrite is
  done only when a following commit has put each section in order and shortened it.

## Once, and true

- State each fact once, in the file whose reader needs it; link to it elsewhere.
- Behaviour and values (caps, budgets, timeouts) live in specs or config. A doc names the place,
  citing a spec section the way the specs do (`dx:writing-specs`: `<file>, Section N`, unless
  `specs/AGENTS.md` sets another form), and explains how or why.
- Do not repeat `AGENTS.md` or the dx context.
- Check each claim against the code. Change a doc in the commit that changes what it describes.
  Delete what no longer applies; git keeps the history.
- A research document cites what each claim rests on: a link at the claim, a `Sources` section
  listing them, and anything no source verifies marked as such.

## Reviewing docs

Check that the `AGENTS.md` row and the index map reach every file; each file opens with what and
when; each link says when to follow it; nothing restates a spec, another doc or `AGENTS.md`; no
sentence can go without loss; no file passes 200 lines without a reason; every moved reference
resolves. Report each finding as `<file>, <heading>` with the fix.

After shortening or moving text, compare it sentence by sentence with the text before the change:
surviving code spans and links do not prove the facts survived. Then run the `Terms` tool's
`check`: shortening drops or renames domain terms.
