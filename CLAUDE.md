# ZKPassport Monorepo

<git_workflow>

<critical_never_assume_base>
New branches and PRs target `develop` by default: branch from `origin/develop` and open PRs with `--base develop`. Target `main` only when the user explicitly says so (releases, hotfixes). There is no `master` in this repo.

If a PR is already open, its existing base is authoritative:

```bash
gh pr view --json baseRefName -q '.baseRefName'
```

Use the discovered base in `git diff origin/<base>...HEAD` and `git log origin/<base>..HEAD`. Always `git fetch` before creating branches so the base is not stale.
</critical_never_assume_base>

<commits_and_prs>
Follow Conventional Commits: `fix(scope): Subject`, `feat(scope): Subject`, `chore(scope): Subject`, `refactor(scope): Subject`, `docs(scope): Subject`, `test(scope): Subject`. PRs are squashed to a single commit on merge, so during development just create normal commits — do not amend unless explicitly asked.

Scope must match one of: (contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace)(,(contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace))*

Subject must start with an uppercase letter.

</commits_and_prs>

<git_staging>
When staging files, prefer `git add -u` or name specific files rather than `git add -A` or `git add .`. The aggregate flags will pick up unrelated untracked working directories (e.g. personal scratch projects at the repo root) and quietly stage them. Subagents must always name specific files in `git add` — never `-u`, `-A`, or `.` — because they lack the main conversation's context for judging which changes belong to the current task.
</git_staging>

</git_workflow>

<red_green_testing>
When fixing a bug, CI failure, or regression, follow red/green. First, write or run a test that demonstrates the failure and show that it fails — this proves both the problem is understood and that there is a reliable way to detect it. Then make the fix and rerun the same test to show it passes. The same pattern applies to refactors: run existing tests to establish a baseline before changing code. If a failing test is not feasible (non-deterministic behavior, infra not available locally, etc.), say so explicitly rather than skipping the step silently.
</red_green_testing>

<test_failure_skepticism>
When a test fails, assume your changes caused it until proven otherwise. Pre-existing test failures are rare in this repo; the default hypothesis is that the current change introduced the regression, not that the test was already broken. Investigate the failure against your diff before concluding it is unrelated.
</test_failure_skepticism>

<unexpected_file_changes>
If a file contains changes you did not make (e.g. formatting diffs, new imports, reorganized code), assume a post-edit hook, the user, or another agent made them deliberately. Do not revert, "clean up," or overwrite those changes. If the changes conflict with your work, ask the user rather than silently discarding them.
</unexpected_file_changes>

<test_behavior_not_mocks>
Tests should validate behavior, not mock call-count. Prefer `expect(result).toEqual(...)` over `expect(spy).toHaveBeenCalledWith(...)` unless call-count is literally the behavior under test. Mock-counting tests pin the implementation and make every unrelated refactor look like a regression.
</test_behavior_not_mocks>

<reuse_before_writing>
Before writing a new helper, utility, or component, search for an existing one with Grep or Glob. Reuse or refactor to a shared module; do not introduce a parallel implementation.
</reuse_before_writing>

<agent_and_workflow_restraint>
Do the work in this session by default. Do not spawn parallel subagents (the Agent/Task tool) or launch dynamic workflows (the Workflow tool) unless the user explicitly asks for it. Each extra agent multiplies token spend — roughly 2x for one helper and far more when a request fans out to many — and the user cannot see the fan-out coming or stop it; a single prompt that quietly started ~30 agents has exhausted an operator's budget. Searching the codebase, summarizing, researching, and ordinary multi-file edits are inline work: run the tool calls yourself. Reach for a subagent only when the user requested orchestration, or when one clearly-scoped read-heavy helper genuinely needs isolation from the main context — prefer a single agent over many, and never start a dynamic workflow by default. If a task would benefit from parallel agents but the user has not asked, either do it directly or describe the multi-agent option and ask before spending the budget.
</agent_and_workflow_restraint>

<preserve_todos>
Preserve existing `// TODO`, `// TODO(name)`, and `// NOTE:` comments unless the current task is to resolve them. A "tidy up" refactor that deletes another author's deferred-work markers destroys context that is not recoverable from git history.

During cleanup or review passes, do not delete useful explanatory comments merely to reduce diff size. Remove or rewrite a comment only when it is incorrect, obsolete, noise, or directly resolved by the current task.
</preserve_todos>

<bash_hygiene>
Never append `; echo "EXIT: $?"` or similar exit-code suffixes to any command. The Bash tool already reports exit codes directly; adding these suffixes is redundant and causes unnecessary permission prompts.
</bash_hygiene>

<do_not_edit>
Never edit vendored submodules (all paths listed in `.gitmodules`) or files that contain a `DO NOT EDIT` / `generated` header. Edit the upstream source or the generator input and regenerate. CI enforces this — hand edits to generated files will be overwritten or rejected.
</do_not_edit>

<editorial_test>
Before adding a line to any `CLAUDE.md` file: answer in one sentence what specific wrong action the line would have prevented in a past session. If no such action exists, do not add the line. General knowledge, motivation, and historical rationale do not qualify — those belong in commit messages or subdirectory READMEs. This rule applies equally to every `CLAUDE.md` in the tree.
</editorial_test>

<writing_comments>
Default to writing no inline comments. Add one only when the *why* is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, or behavior that would surprise a reader. If removing the comment would not confuse a future reader, do not write it.

Do write jsdoc, rustdoc, or natspec comments for documenting public methods.

Do not explain *what* the code does — well-named identifiers cover that. Comments of the form `// increment counter` / `// loop over peers` / `// return early on error` are noise and should be deleted rather than added.

Do not reference the current task, PR, caller, or author (`// used by X`, `// fix for issue #123`, `// AI-generated`), and do not add banner-style section comments (`// ===== HELPERS =====`). Both rot the moment the surrounding code is moved.

Keep comments self-contained: whatever a comment points to must be understandable from the repo alone. The repo is public but Linear issues are private, so never cite them (`// see A-1234`). Likewise do not reference an implementation plan that lives outside the repo (`// this fixes item 4`, `// tackles section C`) — describe the actual constraint or behavior instead.
</writing_comments>

<jargon>
Avoid recurring AI-isms in chat replies, PR descriptions, commit messages, code comments, and docs. Substitutes:

- **"load bearing"** → *important*, *critical*, *required*, or describe the actual dependency (e.g. "the scheduler relies on this invariant").
- **"seam"** (for an interaction point or boundary) → *interface*, *boundary*, *call site*, *integration point*.
- **"north star"** → *goal*, *main goal*, *objective*.
- **"sharpening"** (for adding detail or refining wording) → *clarifying*, *adding detail*, *tightening*, *refining*.
- **"You're absolutely right"** and effusive agreement openers (*"Great catch!"*, *"Excellent point!"*) → never lead a reply with these. A short acknowledgement (*"Right — …"*, *"Agreed."*) is fine, and a closing *"you're right"* at the end of a long reply is acceptable when warranted. Lead with substance, not validation.
</jargon>

<attribution>
Attribute work to the git author, not to Claude. Do not add `Co-Authored-By: Claude` trailers or `Generated with Claude Code` in PR descriptions. The git author (from `git config user.name`) is the author of record.
</attribution>
