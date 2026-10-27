# Inspect startup guidance without extracting a ZIP

From your project's startup directory, run the published common v0.1.4 tool:

```sh
npx --yes --ignore-scripts --allow-remote=root \
  --package="https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.4-npx1.tgz" \
  agent-relay-check inspect --project "$PWD"
```

Requires **Node22+, npm/npx and an already-installed Codex CLI**. The separate byte estimate supports stable Codex0.163.0/0.164.0; other versions can remain inconclusive. This downloads the versioned package to npm's cache and executes it. There are no npm dependencies or install hooks; it does not add a dependency to your project or install/authenticate Codex. The command-scoped `--allow-remote=root` opts into this direct URL download, which npm12 otherwise refuses by default; it changes no saved npm settings. The package has no dependencies. Your other npm configuration still applies. If URL packages are disallowed in your environment, use the ZIP route below. [npm exec behavior](https://docs.npmjs.com/cli/v11/commands/npm-exec/) · [tarball URL package specs](https://docs.npmjs.com/cli/v11/using-npm/package-spec/) · [official allow-remote setting](https://docs.npmjs.com/cli/using-npm/config/#allow-remote).

Inspection requests **zero model turns** and leaves your instruction files unchanged. Normal Codex initialization can communicate and write local metadata. Read [the source, commands and limitations](agent-relay-runtime-options.md) before execution. Native file selection, the separate local byte estimate, marker receipt and instruction compliance are different results.

The entry was checked on macOS with Node22.23.4/npm12.2.1 and installed Codex0.164.0 in an isolated synthetic project, using zero model turns. This is operator packaging verification, not a new external user.

## Windows / PowerShell

Run from the intended project directory. Use `npx.cmd` when PowerShell policy blocks the `npx.ps1` shim:

```powershell
npx.cmd --yes --ignore-scripts --allow-remote=root --package="https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.4-npx1.tgz" agent-relay-check inspect --project "$($PWD.Path)"
```

Native Windows support is experimental. The portable package and shell command are not a new Windows test result. [Existing Windows controls and limits](../tools/agent-relay-check/README.md#native-windows--powershell).

## Read the result

- `estimate.native_project_sources`: project file paths listed by Codex.
- `estimate.rows`: separate version-pinned local estimates, including partial or skipped files. A listed file can be partial.
- `INCONCLUSIVE`: an unknown version/configuration, unsupported source or uncertain cleanup is not a successful check.

No CLI or no usable result? [The GitHub Actions route](agent-relay-ci.md) provides a separately pinned Linux check without a local installation. For a local installation/download problem, report your OS, Node/npm/Codex versions and the error, with private paths/configuration removed. Don't publish your instruction contents, credentials or raw configuration. [Open a technical issue](https://github.com/aichance/business-ai-recipes/issues/new).

## Review or run the archive directly

The tarball is an alternate container for **all24 byte-identical files from the existing v0.1.4 ZIP**. Those24 files, including the original package manifest and CLI, remain unchanged under `common/`. The2 additional files are a launcher and its npm entry manifest (`0.1.4-npx.1`); total26 files. The launcher resolves the core CLI to its real file so npm bin symlinks do not suppress startup. It is served by this repository's GitHub Pages, not published under a new npm registry name.

- [Download tarball](agent-relay-check-v0.1.4-npx1.tgz) · [SHA-256 sidecar](agent-relay-check-v0.1.4-npx1.tgz.sha256)
- SHA-256: `57a1faf5704e97888c34e622f43c14a7172d3e8076a95f46d6c99b98cef9b2ec`
- Preserved [ZIP](agent-relay-check-v0.1.4.zip) / [ZIP checksum](agent-relay-check-v0.1.4.zip.sha256).

You can keep using the ZIP: extract it, open `agent-relay-check`, then run `node cli.mjs inspect --project "/absolute/path/to/your project"`. No npm is needed on that route. To inspect the tarball before execution, download/check its SHA-256, extract it with your archive tool and review `package/` first.

The [standard-library packager](../experiments/relay-package/package.py) reads only the immutable checksum-pinned ZIP, retains every member's bytes, uses the npm `package/` root, adds the reviewed launcher, normalizes tar/gzip metadata and marks the entry executable. It creates no new tool release or model measurement. Reproduce from this repository root with Python3.11+:

```sh
python3 -B experiments/relay-package/package.py
python3 -B experiments/relay-package/package.py --check
```

## Need a receipt check?

The separate authenticated marker test uses inference and explicit existing model access. Preparation/comparison remain offline; defaults are gpt-6.1-sol/MAX with no automatic fallback. Follow [the full temporary-workspace and restore instructions](../README.md#first-run-keep-the-check-files-outside-your-project). The same `agent-relay-check` executable exposes `prepare`, `run` and `compare`; don't put challenge/result files inside the project under test or paste expected marker values into its question.
