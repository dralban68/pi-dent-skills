---
name: qmd-search
description: >-
  Load before searching a repository's specs or docs with qmd, or before claiming a rule does not exist. Not for what a domain term means: call the Terms tool's find action first.
---

# Searching Markdown with qmd

Search before reading whole specs, and before claiming that a rule does not exist: a spec may state
it in words you did not try.

When the question is what a domain term means and the session has the `Terms` tool, call its
`find` action first: the registry holds the term's meaning and its owning spec. Search with qmd or
grep only for where the term is used, or for the context around it.

The tools are `qmd_status`, `qmd_query`, `qmd_get` and `qmd_multi_get`. A gateway may prefix or
rename them; use the names the session lists.

## Find the collection

A repository's Markdown is indexed as a qmd collection, usually named after the repository. Call
`qmd_status` to list the collections and their document counts, and use the name of the one that
covers the repository. If none does, say so; do not conclude that a rule is absent.

## Search

Call `qmd_query` with `collections: ["<collection>"]` and `searches`, a list of typed sub-queries
(at most 10). Use `query` (plain text) only for a quick look; it cannot be combined with `searches`.

- `lex` for exact terms: identifiers, error text, file names.
- `vec` for meaning: the same idea in different words.
- `hyde` for a hypothetical answer, when the wording of the rule is unknown.
- Always set `intent`: one sentence on what you are trying to learn. It steers ranking.
- Raise `minScore` when the hits are noise; lower it when a known rule does not appear.

## Read a hit

- `qmd_get` with `file`, and `fromLine` and `maxLines` to read only the section the hit points at.
  Each result gives the hit's `line`.
- `qmd_multi_get` with a glob `pattern` when several files are needed together.

Quote the file and line in your own text, so the reader can check the rule against its source.

## Refresh the index

A stale index gives wrong answers. After adding or editing Markdown in the repository, run these in
its root, with the collection name in place of `<collection>`:

```sh
qmd update
qmd embed -c <collection>
```

`qmd update` re-indexes all collections, not just this one, so it is a global step; `qmd embed -c`
refreshes the vector embeddings of the named collection. Search again only after both have finished.
