---
name: writing-specs
description: >-
  Load before writing, changing or reviewing a spec under specs/, or before deciding whether a behavior change needs a spec change. The repository's specs/AGENTS.md wins where it differs from this skill.
---

# Writing specs

An implementer, usually an agent, reads a spec with the `specs/` folder and nothing else: no
conversation, no design history, no author. Whatever the text leaves open, each implementer decides,
and they decide differently. A spec is good when two competent implementers working apart build the
same observable behavior and a tester can check each requirement pass/fail.

Read the repository's `specs/AGENTS.md` first: it lists the specs and where it differs from this skill.
Where it differs, it wins; raise the difference with the user.

## What belongs in a spec

Specify what can be observed at the boundary: inputs, outputs, files written, messages sent, errors
returned, ordering, timing, and state left behind. Leave out how the code is organized, unless that
structure is observable. An imperative belongs where it is needed for interoperation or to limit
harm, not to impose a method.

Interfaces are easy to miss when one team writes both ends: formats shared between processes (a
store several sessions read and write), text a model or code consumes (tool results, injected
messages, notification lines), and file names another feature matches. Any of these needs exact
text.

Say who each requirement binds. "A script MUST NOT dispatch agents" binds the script author, and no
test can check it. Write what the implementation provides or rejects: "The worker MUST expose no
binding through which a script can dispatch an agent."

## Requirement language

- MUST, MUST NOT and MAY are normative only in capitals, as in RFC 2119 as clarified by RFC 8174.
  Lowercase "must" and "may" are plain English. No other requirement keyword (such as SHOULD) is
  used. The pointer to this skill in `specs/AGENTS.md` covers the keywords; a spec does not cite
  RFC 2119 or RFC 8174 itself.
- Exact identifiers (schema fields, configuration keys, environment variables, tool names, status
  values, file-name patterns, paths, error codes) are normative and reproduced verbatim.
- An implementation conforms when it satisfies every MUST and MUST NOT. The folder's pointer to this
  skill carries that statement; do not restate it in each spec.

Common failures:

- **Case.** "the page must scroll" reads as advice; "the inventory MAY be empty" reads as a permission.
  Capitalise requirements; write facts as "the inventory can be empty". Never use lowercase must, may
  or should in a normative sentence, or a capitalised keyword outside one.
- **Negated permission.** "No timer may run" is not a keyword. Write "MUST NOT".
- **MAY that should be MUST.** A permission creates two conforming products, and testers must accept
  both. "Leading whitespace MAY be trimmed" lets one implementation accept `" a/b"` and another
  reject it. Use MAY only when every behavior it allows is acceptable.
- **Passive voice.** "Is rejected" must say who rejects it, when, and how: tool error, diagnostic, or
  error code.
- **Normative content elsewhere.** Requirements go in the owning section's normative text, never in a
  definition, example, note or gaps section.

## Testability

For each requirement, write its test in one line: input, action, observable result. If you cannot,
the requirement is unfinished. Words that usually fail: "appropriate", "detailed", "machine-readable",
"best-effort", "unsafe characters", "supports", "resumable", "transient". The test written from a
requirement follows `dx:testing`.

- Quantities carry a unit and say whether bounds are inclusive. Lengths say what they count:
  characters, UTF-16 code units, code points, or bytes. Durations say how they round.
- Truncation names its marker and where the marker goes.
- Strings that code or a model reads are given verbatim, separators and line breaks included.
- Timing is a bound ("within 1000 ms"), not "promptly".
- A value (a cap, a size, a default) is stated once, in its owning section; a text that shows the
  value (a message, a help line, a table) is specified as derived from it, never with the number
  copied.
- Visual properties (colours, fonts, spacing) belong to the implementation; a spec states one only
  where behaviour depends on it.

## Structure

- Open with scope. Every sentence changes behavior; no narrative, no audience line. Tables for schemas
  and enumerations, prose for orderings and rules.
- Separate data shape from its surfaces. A resource spec owns the shape (file format, discovery,
  catalog); a tool or interface spec links it and never restates it.
- Each rule has one owning section; every other mention is a link ("per config-file.md, Section 2").
  A paraphrase drifts: the owner gains an exception, the copy does not, and the two contradict.
  State each rule once: no conformance summary, no guarantees list.
- Sections are numbered; a cross-reference names the file and reads "Section N".
- Self-contained: cite no source modules, prose documents or unversioned sources. Link sibling specs
  as owners. Describe a host API the spec depends on in the spec's own words.
- A spec that needs configuration adds its root keys to the configuration spec it belongs to (named in
  `specs/AGENTS.md`) and defines no separate file, format or loading path. The unknown-key policy has
  one owner; others link.
- A tool spec registers `name`, `label` and `parameters`. Prompt texts are not normative unless
  behavior depends on them.
- End with `Specification gaps`, after `Normative references` if there is one.

## Terms

A key term is a domain term that two or more specs use, or one a reader would confuse with an
identifier, another term, or the plain English word. Key terms are defined in the term registry: the
`Terms` tool when the session has it (its `find` action gives a term's meaning and owner, before
any qmd or grep search; change entries as the dx context says). Without a
terms tool, use the registry the repository names in `specs/AGENTS.md`.

- One term per concept; no synonyms; no undefined terms. Identifiers are not terms: a tool name, key or field is written verbatim in a code span, which
  already sets it apart from the plain word, and has no registry entry.
- A term only one spec uses is defined in the sentence that first uses it. When a second spec uses it,
  it becomes a key term and is added to the registry; a key term that falls back to one spec is
  kept as local to its owner (as confusable when readers still mix it up); one no spec uses is
  deprecated.
  Entries are never deleted: their ids stay so old references resolve.
- An entry has one preferred label, a meaning in one sentence, its owning spec, the phrases to reject
  for it, and the entries it must be distinguished from. The meaning says what the thing is, never a
  value, format, limit or rule. The owner is the spec whose rules give the term its detail. A host
  concept no spec gives rules for is defined by its entry alone, owned by the spec that relies on it
  most.
- Reject phrases are specific wrong names, never ordinary words. To keep one occurrence on purpose,
  use the terms tool's ignore marker with a reason.
- Check the reject phrases and distinguished entries before using a word.
- Watch ordinary words that carry a technical meaning ("close", "committed", "goal", "envelope"). If two
  readers could picture different things, define the word.

## Edge cases

Most divergence comes from cases the author did not think about. For each input and operation, state:

- **Invalid input.** When it is detected (boot, parse, call), how it is reported, and what state remains.
  Errors of one kind are handled one way.
- **Absent input.** Every optional field has a default, including defaults that depend on another field.
- **Boundaries.** Empty, whitespace-only, duplicate, at and past the limit, wrong type, nonexistent path,
  self-reference (a target that is the sender, a broadcast that includes it).
- **Fallbacks.** When a source fails: fall through to the next, or fail the operation? Say it for each tier.
- **Concurrency and lifecycle.** Two calls at once; what in-flight work does on cancel, end, reload, shutdown.
- **Ordering.** Every output list has a sort key and collation. Where several checks can fail with different
  outcomes, say which wins.
- **External inputs** (host formats, provider errors): define the subset you rely on, or list it as a gap.
- **Nothing silent.** Every skip, cut, refusal and failure names who learns of it and how: a message in
  the UI, a notice beside a partial result, or an error to the caller. "Is left out" or "is ignored" with
  no report is a finding, unless the input is of no interest to anyone (a superseded answer).

## Rationale notes and external references

Where a bare rule looks arbitrary and risks being "simplified" away (a deadline that pauses, an
exemption, a threshold), add a note directly after it, starting `> Note (non-normative):`, at most two
sentences, with no keyword in capitals. A note binds nobody: deleting every note leaves the
meaning unchanged. Do not annotate rules that explain themselves.

Cite a standard the spec depends on as `[<designation>]`, for example `[ISO 8601]`. List each label once
in `Normative references` with the standard's full title and the clause relied on. The standard governs
only what the spec says it is used for; where it leaves a choice open, the spec makes it. A fact no source
verifies goes to the gaps.

## Examples

Examples illustrate; the rules decide. Every example must agree with them. A behavior that appears only
in an example is an unstated requirement: move it into the rules. Use a formal notation (ABNF, a JSON
shape, a table) where it can carry a rule.

## Gaps

An unspecified behavior is listed as a gap in `Specification gaps`; a guess written as a requirement
is not, and neither is a pointer that delegates normativity outside the specs folder. "None" is a claim a
reviewer will test. The gaps section holds only gaps; behavior and cross-references go in the body. A
deliberate open choice is listed with its allowed range.

## Changing a spec

Spec before code. Find the owner of the rule (search `specs/` and the term registry), change the owning
text, then update every link (grep the file name after renumbering), restatement, example, registry
entry and gap that depends on it, and add the gaps it opens. A change that adds, renames, or drops a key
term, or moves its owner, updates the entry in the same change. For a renamed identifier, find every use:
`grep -rn "oldName" specs/ lib/ test/`. Reread the changed sections as an implementer seeing them for the
first time.

When asked to make the spec "match the code", first check the code's behavior is the one wanted. Where the
code made a choice the spec never made, that choice belongs to the user.

## Reviewing a spec

Read `specs/AGENTS.md`, the term registry, the spec in full, every spec it links to, and every spec that
links to it (`grep -rln "<file>.md" specs/`). Then make five passes:

1. **Implementer.** For each section, sketch the code; note every point where you had to guess.
2. **Tester.** Write the one-line test for each requirement; anything untestable is a finding.
3. **Terms.** Each domain noun is in the registry; no concept has two names.
4. **Ownership.** Search the folder for each key rule and identifier; report restatements and contradictions,
   and name the owning spec.
5. **Edges and gaps.** Work through the edge-case list, silent skips and failures included; test the
   "Specification gaps" claim.

Reading the code shows whether a suspected ambiguity is real. Judge the spec on its own text all the same.

Rank findings by effect on what gets built:

- **Blocking.** Two implementers would build different observable behavior, or two normative statements contradict.
- **Should-fix.** Untestable requirement, undefined term, or a rule stated twice that can drift.
- **Minor.** Wording that does not change meaning. Report sparingly.

Each finding gives the file, section, quoted text, why it matters, and replacement wording in house style, and
says whether the fix is mechanical or needs a design decision from the user. If a spec is sound, say so.
