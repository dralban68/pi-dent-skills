---
name: testing
description: >-
  Load before writing, changing, reviewing or deleting a test, or adding a test script, to pick its kind (smoke, behaviour, app behaviour, end-to-end, performance) and what it may assert. Not for the test tooling config: load dx:repo-setup for that.
---

# Testing

A test exists to fail when behaviour breaks and only then. A test that breaks on a refactor that
keeps behaviour costs a fix and teaches nothing; a test that passes on broken behaviour is worse
than none. Every test is one of these kinds, and each kind has its own script and place.

| Kind          | Answers                                       | Script          | Where           | In `pnpm check`  |
| ------------- | --------------------------------------------- | --------------- | --------------- | ---------------- |
| Smoke         | Does it start at all?                         | `pnpm smoke`    | outside `test/` | yes, in the tail |
| Behaviour     | Does it do what the spec says?                | `pnpm test`     | `test/`         | yes              |
| App behaviour | Does the built product do what the spec says? | `pnpm test:app` | outside `test/` | yes, in the tail |
| End-to-end    | Does it work with the world outside the repo? | `pnpm test:e2e` | `e2e/`          | no               |
| Performance   | Does it stay within its time and memory budget? | `pnpm test:perf` | `perf/`       | no               |

Choose the cheapest kind that can catch the failure. Most tests are behaviour tests.

## Speed and timing

- `pnpm check` finishes within 60 seconds on a developer machine, unless the repository's
  `AGENTS.md` states a lower budget. A check over budget is a defect to fix in the tests, never a
  limit to raise. A test that cannot be made fast moves to `pnpm test:slow`, outside `check`,
  only with a written justification: a `## Slow tests` section in `AGENTS.md` or a `docs/` file
  lists each slow test, why it is slow and why it cannot be fast (the audit requires the section).
  Run `test:slow` when changing what those tests cover and before a release, and say in the
  report whether it ran.
- A test is as small as its rule. A fixture is just past the cap or bound it proves ("no cap" is
  shown just past the old cap, not at 60,000 entries). A scenario repeated only to expose a leak or
  race is a performance test.
- Never sleep to prove that something does not happen. Wait on the fake's own signal (it delivered,
  it was asked, its queue drained), then assert that nothing else arrived. When the code under test
  needs a clock, use a fake clock.
- Every test is timed and bounded, in every kind. node:test runs get `--test-timeout=30000` (the
  audit checks each `node --test` script), and its reporter prints each test's duration and the
  total. A runner that is not node:test prints each test's name and elapsed time and a total, and
  fails a test that passes the same bound, naming it, instead of hanging.

## Smoke tests

- Start the built artifact the way a user does (the app, the CLI, the server) and check that it
  comes up: the process starts, its first screen or handler is ready, it exits
  cleanly. Nothing more; behaviour belongs in `test/`.
- Seconds, not minutes, and self-contained: no network, no accounts, no state outside a temporary
  directory.
- A repository that ships something a user runs (an app, a CLI, a server) has a smoke test. A library
  or plugin that only a host loads has none: importing its entry module is a behaviour test, loading
  it in the host is end-to-end. `check` runs it in its tail (`dx:repo-setup`, Scripts).

## Behaviour tests

- Test through the public surface: exported functions, the CLI, messages, files written, errors
  raised. That is the surface the spec describes; each test checks a rule of the spec and is named
  for the behaviour, not the function ("rejects a path outside the root", not "validatePath").
  Developer tooling that is not part of the product (a dev runner, a release script) has no spec; its
  tests check the behaviour its docs state.
- Never test the code's structure. Do not assert on private helpers, internal call order or call
  counts, class or file names, the shape of internal data, or a snapshot of incidental output.
  Do not mock the repository's own modules.
- Replace only what lies outside the process: the filesystem (a temporary directory), the clock,
  randomness, the network, a host API. Use a fake that behaves like the real thing over a mock that
  records calls. A host API the code imports at module load is replaced by aliasing that module to a
  fake in the test build.
- Hermetic and deterministic: no network, no files outside a temporary directory, no dependence on
  test order, the machine, or the time of day. Each test cleans up what it creates.
- A bug fix starts with a test that fails for the bug's cause, through the public surface.
- When a test breaks on a refactor that kept behaviour, the test was wrong: rewrite it against the
  behaviour, do not adjust it to the new structure.
- Delete a test only when the behaviour it checks was removed from the spec, or when it checks
  structure rather than behaviour (rewrite or delete it).

## App behaviour tests

- Behaviour tests that need the built product or a runtime the test runner cannot host (a desktop
  shell, a browser) and that still need nothing outside the repository: they drive the built app
  against fakes of its external parts. Every rule of behaviour tests applies.
- Write one only for what a behaviour test in `test/` cannot reach; they are slower and need the
  build. `check` runs them in its tail after the build (`dx:repo-setup`, Scripts).

## End-to-end tests

- For what needs something outside the repository: a real host application, a network service,
  an account, another repository, an installed tool. They show that the repository's assumptions
  about that boundary still hold.
- They are the integration tests: every check against the real thing (the real host, a real
  installed tool) is one, in `e2e/`, run by `pnpm test:e2e`. No separate `check:*` scripts.
- They live in `e2e/`, so `pnpm test` never runs them, and they are not part of `pnpm check`: done
  must not depend on the outside world. Run them when changing code at that boundary and before
  a release, and say in the report whether they ran.
- Each test checks its prerequisites first. When one is missing it is reported as skipped with the
  reason (which service, which variable); it never passes silently.
- Credentials come from the environment, never from the repository. A test that changes outside
  state uses a dedicated test account or namespace and undoes its changes.
- Keep them few: one per boundary contract. Everything that can be shown without the outside
  world is a behaviour test.

## Performance tests

- For a time or resource budget (a response time, a timer gap, a heap bound under a large input),
  or a scenario repeated only to expose a leak or race. The behaviour half of the scenario stays a
  behaviour or app behaviour test.
- Each budget is a rule of the spec, stated once in its owning section like any value
  (`dx:writing-specs`), set from a measurement with its reason stated. A budget no spec states is a spec gap: write it into the spec first.
- They live in `perf/` and run only with `pnpm test:perf`, never in `pnpm check`: timings depend
  on the machine and its load, and done must not. The script builds what it needs itself.
- Self-contained like app behaviour tests: fakes for the outside, nothing outside a temporary
  directory. Set each bound with margin for a slower machine, and print the measured value next to
  it.
- Run them when changing a path a budget covers and before a release, and say in the report
  whether they ran and what they measured.
