# Check your Codex startup guidance in GitHub Actions

Catch a required `AGENTS.md` disappearing or becoming locally estimated partial after a guidance/configuration change. This action inspects **your checked-out repository**, using the unchanged Agent Relay Check **v0.1.4** package and official Codex **0.164.0** on a temporary GitHub-hosted Linux runner. You do not need a local CLI, Codex login, or API key. It requests **zero model turns**; normal GitHub Actions usage limits still apply.

The original [`tools/agent-relay-ci` consumer at its fixed v0.1.3 revision](https://github.com/aichance/business-ai-recipes/tree/406b8ae0702c5fb8c5a2221c5fd98cd39ccfe663/tools/agent-relay-ci) remains unchanged. Existing SHA-pinned workflows keep that older package. The entry below deliberately selects **the same v0.1.4** as the current local download; results from the two versions are not combined as one user cohort.

## First run on your own repository

Review the [action source at the pinned revision](https://github.com/aichance/business-ai-recipes/tree/daab5bc86f063b5cae21ce6c80d3489da72a117b/tools/agent-relay-ci-v014), then add this as `.github/workflows/check-guidance.yml` in a repository you control:

```yaml
name: Check Codex startup guidance
on: [push, pull_request, workflow_dispatch]
permissions:
  contents: read
jobs:
  guidance:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          persist-credentials: false
      - uses: aichance/business-ai-recipes/tools/agent-relay-ci-v014@daab5bc86f063b5cae21ce6c80d3489da72a117b
        with:
          project-directory: '.'
          required-files: AGENTS.md
```

No secret or provider credential is needed. Open the resulting run's **Summary** to see the status, required paths, native membership, and separate local byte estimates. The action fails the step unless all required files pass. It does not modify the instruction files or make a commit.

Start in the directory where you would start Codex. For example, if Codex starts in `apps/web`, change the inputs to:

```yaml
          project-directory: apps/web
          required-files: |
            AGENTS.md
            apps/web/AGENTS.md
```

`project-directory` is relative to the checkout; every required path is relative to **that project's Git root**, not the startup directory. Paths containing spaces are supported. List the actual required files: an override can replace `AGENTS.md`, so requesting the replaced file will fail. The startup directory and its Git root must resolve inside the caller checkout; absolute/outside paths and escaping symlinks are rejected. Required paths are literal, with no globs or `..` segments.

Commit the guidance and `.codex/config.toml` that the CI job should inspect. The temporary Codex home trusts only the validated caller Git root so project configuration is loaded, instead of silently ignored. Personal global configuration and login are not copied; this checks **the CI startup context**, which can differ from your desktop session.

## What a green result means

`PASSED` requires all of the following:

- Both native inspection servers closed, the source snapshot stayed stable, and no model turn was requested.
- Native startup paths and the version-specific local selection estimate agree, with no unknown outside source/configuration issue.
- Every required path is selected and native-listed, with a separate local `FULL` estimate covering every file byte.

`REJECTED` covers a missing/partial required source or an invalid target. Unsupported, unknown, interrupted, or unconfirmed inspection results are `INCONCLUSIVE` and also fail the step. A native-listed path alone does not prove that all bytes were included.

**Model receipt and instruction compliance are always `NOT_TESTED`.** Use the separate [marker-receipt check](../tools/agent-relay-check/README.md) in an authenticated local environment when that evidence is needed. This action does not test conditional `.agents/rules` reads, compaction, tool behavior, or general adherence.

## Historical v0.1.3 controls

The historical **v0.1.3** [first hosted integration run](https://github.com/aichance/business-ai-recipes/actions/runs/40129495148) used synthetic caller guidance, not a third-party adoption:

| Caller condition | Native paths | Separate local estimate | Action result |
| --- | --- | --- | --- |
| Root 40 B + child 80 B, normal budget | Both listed | Both `FULL` | `PASSED` |
| Same files, committed project budget 64 B | Both listed | Child 24/80 B, `TRUNCATED` | `REJECTED` |
| Required `MISSING.md` | Missing required path | No matching row | `REJECTED` |
| Startup directory `..` outside checkout | Inspection not started | Not estimated | `REJECTED` before download/install |

Those three historical inspections each requested zero model turns, confirmed two servers closed, and left the fixture files unchanged. They do not establish the new v0.1.4 consumer. The current [workflow](../.github/workflows/relay-ci-v014.yml) also requires an immutable-SHA **remote-consumer** job: the runner downloads the action separately and must still inspect the caller's 40/80 B files. Operator CI and test counts are not independent use or reuse.

## Execution, output, and limits

- GitHub-hosted Linux only (`ubuntu-24.04` in the example), on ordinary `push`, `pull_request`, or `workflow_dispatch`. No privileged `pull_request_target` or `workflow_run`, no self-hosted runner, and no schedule is provided. The caller sets read-only job permissions and must not add secrets or credential-dependent setup to this job.
- Downloads the common ZIP from this project's Pages, verifies exactly 54,863 bytes and SHA-256 `d21cf2f75c069b244b212f8988085d952b2159e4e07842ed806235c52998dcda` **before extraction**, and installs official `@openai/codex@0.164.0` from npm with lifecycle scripts disabled. It needs network access; Codex initialization can communicate and write temporary native metadata even without a model turn.
- CLI home, trust configuration, npm prefix/cache/configuration, extracted code, and reports live under the runner's temporary directory. Child environments omit provider/GitHub/npm credentials and preload configuration. The wrapper does not upload raw guidance, configuration, or native stdout/stderr. Required relative path names and sanitized results appear in the run Summary; review that visibility before using it in a public repository.
- The `status` output is `PASSED`, `REJECTED`, or `INCONCLUSIVE`. `report_path` points to sanitized JSON in the runner temporary directory. No artifact is uploaded automatically. Do not publish raw native logs/configuration when reporting a problem.
- Temporary trust is **not a filesystem sandbox**: native path-valued project configuration may read outside the checkout before the inspection can be classified unknown. Use committed guidance/configuration you have reviewed on a disposable runner; this is not a security boundary for arbitrary hostile repositories.
- Timeout/cancellation forwards termination, gives cooperative native cleanup a bounded grace period, and never produces a success. A non-cooperative direct child is force-killed; runner job-end tracking is a fallback for descendants. This is not a guarantee of universal process containment.

If setup fails, report the sanitized status/failure code, OS/CLI version, startup directory relative to the Git root, and whether the required files are native-listed or partial. A short public result on [the repository](https://github.com/aichance/business-ai-recipes) is enough; no API key, private project path, or full instruction text is needed.
