# Baseline configuration

Copy these into a new repository, then fill in the name, description and any repository-specific
entries. Versions come from `versions.md`; keep the ranges here equal to that list. A dx test fails when
this file, `versions.md` and the audit script disagree.

## `package.json` fragment

Merge into the repository's `package.json`. The `test` script is `node --test --test-timeout=30000 test/` for the
node-esm profile; a bundled repository names its own runner.

```json
{
  "type": "module",
  "private": true,
  "packageManager": "pnpm@12.18.0",
  "engines": { "node": ">=26" },
  "scripts": {
    "test": "node --test --test-timeout=30000 test/",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint .",
    "fmt": "oxfmt .",
    "fmt:check": "oxfmt --check .",
    "check": "pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm test"
  },
  "devDependencies": {
    "@types/node": "^26.6.6",
    "oxfmt": "^0.77.0",
    "oxlint": "^1.93.0",
    "typescript": "^7.0.2"
  }
}
```

A bundled repository's `typecheck` runs one `tsc -p` per target, for example
`tsc -p tsconfig.app.json && tsc -p tsconfig.server.json`. Its `check` ends with the tail the
Scripts section of `SKILL.md` requires, for example `&& pnpm build && pnpm smoke && pnpm test:app`. Its `engines` lists no `pnpm` key: `packageManager` is the
pin.

`@types/node` stays in a node-esm repository, whose `tsconfig.json` names `types: ["node"]`. A bundled
repository whose targets use no Node types may omit it, and then drops `types` from its targets.

## `.oxlintrc.json`

The `.pi` entry in `ignorePatterns` is the one name in this file that is not generic: some tools
keep local state in a `.pi/` directory, and lint must not read it.

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "ignorePatterns": ["node_modules", "dist", ".pi"],
  "env": { "node": true },
  "categories": { "correctness": "error" },
  "rules": {
    "@typescript-eslint/consistent-type-assertions": ["error", { "assertionStyle": "never" }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "no-console": "error",
    "no-else-return": "error",
    "no-shadow": "error",
    "no-warning-comments": "error",
    "unicorn/no-array-sort": "error",
    "unicorn/no-negated-condition": "error",
    "unicorn/no-useless-undefined": "error"
  },
  "overrides": [
    {
      "files": ["test/**"],
      "rules": {
        "@typescript-eslint/consistent-type-assertions": "off",
        "unicorn/no-useless-undefined": "off"
      }
    }
  ]
}
```

## `.oxfmtrc.json`

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "ignorePatterns": ["dist", "pnpm-lock.yaml"]
}
```

## `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

## `.config/wt.toml`

The one Worktrunk hook sets a new worktree up so it is fully operational before anyone works in
it: dependencies installed, and built where the repository has a build. A repository that needs
more (a generated file, a copied cache: `wt step copy-ignored`) appends it with ` && `. No other
hook: agents run tests and checks (dx context).

```toml
pre-start = "pnpm install --frozen-lockfile && pnpm run --if-present build"
```

## `tsconfig.json` (node-esm)

One file, no build. `.ts` files run directly, so imports name the `.ts` extension and nothing is
emitted. Add any other source root to `include`.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true
  },
  "include": ["index.ts", "lib/**/*.ts", "test/**/*.ts"]
}
```

## Bundled set

`tsconfig.base.json` holds the flags both profiles share. Each target has a `tsconfig.<target>.json`
that extends it. The sample below is the `app` target; repeat the file for every other target.
The bundler emits the output; typecheck runs each target with `noEmit`.

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true
  }
}
```

`tsconfig.app.json` (sample browser target; a target that Node loads, such as an Electron main
process, uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` instead):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/app/**/*.ts"]
}
```

A repository may add flags to its target files (for example `noUnusedLocals`); the base holds only
the shared floor.

## `pnpm-workspace.yaml` (generic part)

Repository-specific keys (for example a release-age exclusion list) sit beside these. The
`allowBuilds` values are booleans, one decision per dependency. Each `overrides` entry has a `#`
line above it saying why it exists. Fill in the `<...>` placeholders; delete the `overrides` block
when nothing is pinned.

```yaml
allowBuilds:
  esbuild: true
  <package>: false

overrides:
  # <why this pin exists>
  <package>: <version>
```

## `.gitignore`

```gitignore
node_modules/
```

A bundled repository also ignores its build output, for example `dist/`. Do not ignore the terms
tool's storage file: it is committed.
