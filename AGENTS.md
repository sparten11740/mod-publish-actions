# mod-publish-actions

GitHub Actions for publishing mods to CurseForge and Modrinth, in one pnpm monorepo.

## Layout

- `packages/core`: code shared between actions (input parsing, HTTP, running an action). `@mod-publish-actions/core/testing` holds test helpers and is never imported by action code.
- `packages/modrinth`: the Modrinth API client that the Modrinth actions share.
- `curseforge/upload`, `modrinth/upload`, `modrinth/gallery`: one action each, with `action.yml`, `src/index.ts` as the entry point and the bundled `dist/index.cjs`.
- `scripts/build-actions.ts`: bundles every action with esbuild and writes the license notices of the packages in each bundle to `dist/THIRD_PARTY_LICENSES.txt`. A new action has to be added to its list.
- `scripts/check-staged.ts`: runs the checks and build on a copy of the staged files, so a commit is checked on its own.
- `.agents/skills`: skills in the agent-agnostic [Agent Skills](https://agentskills.io) format. Claude Code only documents `.claude/skills`, so each skill also needs a symlink there: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.

## Commands

The package manager is **pnpm**, pinned in `packageManager`. Never use npm, npx, yarn or bun.

```bash
pnpm format   # oxfmt: formats and sorts imports
pnpm lint     # oxlint, every rule is an error
pnpm typecheck
pnpm test     # vitest
pnpm check    # format:check + lint + typecheck + test
pnpm build    # bundles every action into its dist/
pnpm check:staged  # check + build on a copy of only the staged files
```

## Supply chain

- **Pin GitHub Actions to commit SHAs.** Every `uses:` reference must be a full 40-character commit SHA, never a tag or branch, because those can be moved. Look the SHA up from the release tag in the action's own repository and put the exact version in a trailing comment: `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`. `scripts/pinned-actions.test.ts` fails on anything else in `.github/workflows`.
- **Only install packages that are at least 14 days old.** `minimumReleaseAge: 20160` in `pnpm-workspace.yaml` refuses anything newer, including transitive dependencies. If an install fails on this, use an older version or wait. Never lower the limit or add `minimumReleaseAgeExclude` unless the user asks.
- **Install scripts are opt-in.** `allowBuilds` in `pnpm-workspace.yaml` lists which dependencies may run them.

## Rules for the actions

- **Official APIs only.** Use documented platform APIs. If a feature has no official API, leave it out rather than using private endpoints, browser sessions, or response fields and URL formats the docs leave out. This is why there is no `curseforge/gallery`.
- **`dist/` is committed.** GitHub runs an action straight from the repository, so run `pnpm build` and commit the result. CI fails when `dist/` is out of date.
- **Keep the inputs stable.** Inputs are the public API and tags cover the whole repository. Adding an optional input is fine; renaming or removing one is a breaking change.
- **Same concept, same input.** Inputs that mean the same thing use the same name and values on every platform, and each action translates them for its API. Platform-only inputs live in that action.
- **Fail loudly.** Throw an `Error` with a message naming the input or file at fault. `runAction` turns it into a failed step.
- **Parse at the boundary.** Data from outside TypeScript is parsed where it enters the program, so the types inside it can be trusted without re-checking or casting. Server responses go through a `zod/v4` schema with `parseReply`, and action inputs through `readInputs`.

## Skills

Skills must work in any agent. Use only the standard frontmatter fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`), keep `name` equal to the folder name, and avoid agent-specific syntax such as `$ARGUMENTS`. Give each skill a name of its own, because a personal skill with the same name overrides a project skill in Claude Code.

## Code conventions

- kebab-case file names, `type` aliases rather than `interface`, and named exports.
- No file for a single function named after it, such as `find-single-file.ts`. Put functions in a module named for their topic, such as `fs.ts`, which related helpers can join.
- No code comments, except the version comment after a pinned action.
- Never `null`; use `undefined`.
- Regular expressions are named module-level constants, not inline.
- No single-letter names.
- Ideally no type casts.
- Import order: packages, then `@mod-publish-actions/`, then relative.
- Tests use Vitest and sit next to the module as `*.test.ts`. Test names describe what they assert.
- HTTP in tests is mocked with MSW through `useMockServer` from `@mod-publish-actions/core/testing`. Never stub `fetch` directly. Unhandled requests fail the test.

## Commits

- **Conventional Commits.** Messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): subject`, for example `fix(modrinth-upload): send the User-Agent header`.
  - Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
  - Scopes: `core`, `modrinth`, `curseforge-upload`, `modrinth-upload`, `modrinth-gallery`, left out for changes across the repository.
  - Subject: imperative, lower case, no trailing period, about 70 characters at most.
  - Body: what changed and why, wrapped at 72 columns. Mark a breaking change to an input or output with `!` after the type or a `BREAKING CHANGE:` footer.
- **Commit atomically.** Each commit is one logical change, together with its tests, docs, lockfile changes and rebuilt `dist/`, and passes `pnpm check` and `pnpm build` on its own. Split unrelated changes into separate commits.
- **Review before each commit.** Stage the change, run the `action-diff-check` skill on the staged changes, and fix every finding or consciously defer it before committing.
- **Commit hook.** In Claude Code, `.claude/settings.json` has a separate agent run `action-diff-check` on the staged changes whenever `git commit` runs, and a Blocker or Should fix finding blocks the commit. Stage changes in a separate command first, and commit with a plain `git commit` rather than from a script, or the hook cannot review what will be committed. The reviewer can only run commands that have an allow rule, so `Bash(pnpm check:staged)` must be allowed or it blocks every commit. If it cannot finish, for example on a timeout, Claude Code lets the commit through.

## Definition of done

1. `pnpm format` has been run and `pnpm check` passes.
2. New or changed behaviour has tests.
3. `pnpm build` has been run and `dist/` is committed with the source.
4. `action.yml`, `README.md` and this file describe any new input, command or convention.
5. It is committed as described in [Commits](#commits), with a review before each commit.
