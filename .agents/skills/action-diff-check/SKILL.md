---
name: action-diff-check
description: Review the uncommitted changes in the mod-publish-actions repository for correctness, action input stability, official platform API use, token and supply chain safety, package boundaries, simplicity, types and tests. Use before committing, or when asked to check the diff or review local changes in this repository.
---

# Action diff check

Review what is about to be committed. Report findings, and don't edit source files unless the user asks for fixes afterwards.

The request may ask for staged changes only, or name paths or globs that narrow the review.

## 1. Learn the repo's rules

Read `AGENTS.md`, `README.md`, `.oxlintrc.json` and `pnpm-workspace.yaml`. `AGENTS.md` overrides this checklist if they disagree.

## 2. Collect the change set

All uncommitted changes:

```bash
git status --porcelain=v1 --untracked-files=all
git diff HEAD --name-only --diff-filter=d
git ls-files --others --exclude-standard
```

Staged changes only:

```bash
git diff --cached --name-only --diff-filter=d
git diff --cached -- <file>
git show :<file>
```

- Review modified files through their diff, and read the whole file whenever the hunk alone can't show whether it is correct. Read new files completely.
- Skip deletions, `pnpm-lock.yaml` (except for the supply chain checks in step 5) and `**/dist/**` (step 3 covers it).
- If the repository has no commits yet, review every tracked and untracked file, or every staged file when asked for staged changes only.

## 3. Run the gates

When reviewing staged changes while other files have uncommitted changes, run the gates on a copy of the index, so they describe the commit rather than the working tree:

```bash
copy="$(mktemp -d)"
git checkout-index --all --prefix="$copy/"
cd "$copy"
pnpm install --frozen-lockfile
```

Then, in the copy or otherwise in the repository:

```bash
pnpm check
before="$(shasum */*/dist/index.cjs)"
pnpm build
test "$before" = "$(shasum */*/dist/index.cjs)"
```

- Every format, lint, type or test failure is a finding.
- If the last command fails, the `dist/` under review is out of date, which is a finding. A build in the repository also refreshes it, so say so in the report.
- Every folder with an `action.yml` must have a `dist/index.cjs`.
- If `pnpm` isn't on `PATH`, locate it before giving up, because Node may come from nvm.

## 4. Mechanical scans on the change set

- **Comments:** `//` and `/* */` in TypeScript, and `#` in YAML. The only allowed comments are tool directives and the version comment after a pinned action.
- **Type escapes:** `as X` (except `as const`), non-null `!`, `any`, `@ts-ignore`, `@ts-expect-error`.
- **`null`:** use `undefined`.
- **Unparsed data:** `response.json()`, or `JSON.parse` whose result does not go straight into a `zod/v4` schema.
- **Leftovers:** `console.*` (use `@actions/core` logging), `TODO`/`FIXME`, commented-out code, `.only`, `.skip`, real tokens or keys.
- **Commands:** `exec`, `execSync` or `promisify(exec)` from `node:child_process`, `shell: true`, and any variable inside the command line string passed to `@actions/exec`.
- **Action references:** every `uses:` is a full 40-character commit SHA followed by its version in a comment.

## 5. Review each dimension

**Correctness**

- Every promise is awaited, and failures reach `runAction` so the step fails. Nothing swallows an error.
- Responses are checked for a non-2xx status before they are parsed, and malformed bodies fail with a clear message.
- `file` fails clearly on zero or several matches, and can't pick up a `-sources` jar by accident.
- Partial failure is considered: what has already been published when a later request fails, and what a re-run then does.
- Code works in the bundle: Node 24, CommonJS output (no top-level await), and no runtime reads of files outside `dist/` that aren't the user's inputs.
- Every output declared in `action.yml` is set with `setOutput` on success.

**Action contract**

- `action.yml`, the code reading the inputs and the README agree: every declared input is read, every input read is declared, and required flags, defaults and allowed values match.
- Renaming or removing an input or output, or changing a default or its meaning, breaks users because tags cover the whole repository. That is a **Blocker** unless the user asked for it. Adding an optional input is fine.
- The same concept uses the same input name and values on every platform, and each action translates them for its API. Platform-only inputs stay in that action.
- `runs` stays `using: node24` with `main: dist/index.cjs`.
- A new action is added to `scripts/build-actions.ts` and the README table, and is covered by the globs in `pnpm-workspace.yaml` and `tsconfig.json`.

**Platform APIs**

- Only official, documented APIs are used. Private endpoints, captured dashboard traffic, scraping or browser sessions are a **Blocker**.
- Check every endpoint, header and field against the current official docs rather than memory, and cite the page for any mismatch:
  - CurseForge: https://support.curseforge.com/en/support/solutions/articles/9000197321-curseforge-api
  - Modrinth: https://docs.modrinth.com/api/
- CurseForge: the token goes in the `X-Api-Token` header, never the `token` query parameter. Ambiguous game version names resolve to one exact entry or fail.
- Modrinth: every request sends a uniquely identifying `User-Agent`. Tokens need only the scope in use (`VERSION_CREATE` or `PROJECT_WRITE`). A rate limit response gives a failure message saying how long to wait, and is retried only when the request is safe to repeat.
- Every network call has a timeout. Only safe requests are retried, because retrying an upload could publish it twice.
- Gallery sync creates no duplicates on a re-run, deletes nothing unless `remove-missing` is true, and fails early on files over Modrinth's 5 MiB limit.

**Security and supply chain**

- Tokens never appear in logs, error messages, URLs or test fixtures. Check any code that logs a request or response.
- Commands never run through a shell, because a value containing shell syntax could then run commands of its own. `exec`, `execSync`, `promisify(exec)` and `shell: true` from `node:child_process` are a **Blocker**, even when the values look trusted.
- Run commands with `execFileSync`, or with `execFile` or `spawn` without a shell, and pass arguments as an array.
- `exec` from `@actions/exec` is also fine, because it spawns normal programs without a shell. It does split its command line string into arguments, so that string must be a fixed tool name, with every variable value in its `args` array.
- A value that could start with `-` can't be read as an option, for example because it follows `--`.
- Workflows have minimal `permissions`, don't use `pull_request_target`, don't put untrusted `${{ }}` values inside `run:`, and pass secrets only to the steps that need them.
- The version comment after each pinned action matches its SHA. Confirm new or changed pins with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
- `minimumReleaseAge` isn't lowered, `minimumReleaseAgeExclude` isn't added, and `allowBuilds` isn't widened without the user asking.
- `pnpm-lock.yaml` changes match the `package.json` changes.
- A new runtime dependency ends up in a committed bundle, so it needs a reason. Prefer Node built-ins.

**Package boundaries**

- `packages/core` holds only what several actions share, and knows nothing about any platform.
- Platform knowledge stays in that platform's package, such as `packages/modrinth`, or in its action, and actions never import each other.
- Actions import core through `@mod-publish-actions/core`, never through relative paths into another package.
- `@mod-publish-actions/core/testing` is imported only by tests, and neither it nor `vitest` reaches `dist/`.
- Logic repeated in two actions moves to core once it is the same concept, not merely similar code.

**Performance**

- Requests are sequential or bounded, and stay within rate limits.
- Lookups aren't repeated when one response can be reused.
- Large files aren't read into memory more often than needed.
- A jump in the size of `dist/` has a reason.

**Code hygiene**

- Clear, descriptive names and no single-letter identifiers.
- No dead code or unused exports, inputs or outputs.
- Nesting no deeper than about three levels.
- kebab-case files and named exports.
- Imports ordered as packages, then `@mod-publish-actions/`, then relative.
- Functions small enough to read in one go.
- No file for a single function named after it, such as `find-single-file.ts`. Functions live in a module named for their topic, such as `fs.ts`, which related helpers can join. Only `index.ts` entry points are exempt.

**Open/closed**

- Translations between shared inputs and platform values are records keyed by the shared type, such as `Record<Environment, string[]>`, so a new value fails the type check. Avoid `if` and `switch` chains over kinds.
- No growing boolean flag parameters.

**Simplicity**

- No indirection, abstraction or generality the change doesn't need. Could it be fewer concepts or fewer lines?
- Don't add support for other games or platforms ahead of need, and don't add an input nobody has asked for, because inputs are hard to remove.

**Duplication**

- Check within the change set and against existing code. Search for similar names and strings before calling something new.

**Types**

- Data from outside TypeScript is parsed where it enters the program, so the code inside trusts its types without re-checking or casting. Server responses go through a `zod/v4` schema with `parseReply`, and schemas follow the official docs, including nullable fields.
- Precise unions over loose `string`, derived from one source such as `(typeof CHOICES)[number]`.
- `type` aliases rather than `interface`.
- No optional parameters that every caller passes.

**Tests**

- New behaviour has tests next to the module, and test names describe what they assert.
- Tests use no real network or tokens. Stub `fetch` and assert the real request: URL, headers and multipart fields.
- Failure paths are covered: non-2xx responses, malformed bodies and invalid inputs.
- Tests stub inputs with `stubInputs` and clean up with `vi.unstubAllEnvs`.
- Nothing makes a test pass falsely.

**Docs**

- `action.yml` descriptions, the README, including its status line and table, and `AGENTS.md` describe any new input, command or convention.

## 6. Verify, then report

Re-read the code behind every finding and confirm a concrete failure scenario or rule violation. Drop anything speculative.

Report:

1. One line: files reviewed and the gate result.
2. Findings grouped as **Blocker**, **Should fix** and **Nit**, most severe first. Each is `path:line` followed by the problem and the suggested fix.
3. One line listing the dimensions with no findings.

End by offering to fix the findings.

For more than about 20 files, split the review between subagents if your agent supports them: give each a few dimensions, this checklist and the file list, then verify and merge their findings into one report.
