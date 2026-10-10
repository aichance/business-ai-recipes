# Avonture SSH generator: keep saved inputs and generated output together

**Observed on 2026-10-10: `PASS reload`; the exported Playwright test also passed.**
The unchanged [Avonture blog](https://github.com/cavo789/blog) at commit
`67437e66aaaa3010867959f90d3282085f1b721d` restored synthetic user/host values,
both browser-storage records, and the complete generated config after reload.

This adapter turns that expected behavior into a repeatable regression check.
It is our compatibility run, not a report that the author adopted App Crash Lab.

## Already running the blog locally?

Save [`avonture.json`](avonture.json) into a separate working directory
(GitHub **Raw → Save As**). With Node 22+ and the local blog still running:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run avonture.json
```

The tested origin is `http://127.0.0.1:49681`. If your development server uses
another loopback origin, append `--base-url http://127.0.0.1:3000` to the second
command, replacing the port as needed. Keep the `/blog/ssh-config-tips/` route.
First-time Chromium/dependency downloads need internet access and disk space.

Open the absolute `index.html` report path printed in the terminal. The test
uses a fresh browser context and enters only `crashlab-demo` and
`bastion.example.test` through the article's **Your values for this page** panel.

| Observation | Expected baseline | After reload |
| --- | --- | --- |
| Visible username and hostname | The two synthetic inputs | Same |
| Vars storage username and hostname | The two synthetic inputs | Same |
| Generator storage username and hostname | The two synthetic inputs | Same |
| Generated config text | Captured after the known-good inputs reach storage | Identical text |
| Generated output containing the synthetic ProxyJump | One matching output | One matching output |

These are eight observations. The storage keys are
`docusaurus:vars:/blog/ssh-config-tips/` and `cfg:ssh-config`.
The generated output must contain `ProxyJump crashlab-demo@bastion.example.test`
before it becomes the baseline; an empty unchanged panel cannot pass.

## Keep the exported test

Leave the blog running. The CLI prints an absolute path ending in `index.html`.
Remove that final filename and `cd` into its parent directory. For example, if
it prints `/your/work/app-crash-lab-report/index.html`, run
`cd /your/work/app-crash-lab-report`. Then run:

```sh
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

That exported test depends on Playwright only. It can be rerun after changing
the component; a new CLI run writes a new report directory.

## Reproduce the local source environment

For a fresh disposable copy, download and extract the
[fixed source ZIP](https://github.com/cavo789/blog/archive/67437e66aaaa3010867959f90d3282085f1b721d.zip).
Inside the extracted directory, our macOS arm64 / Node 22.16.0 / Yarn 1.22.22 run used:

```sh
yarn install --frozen-lockfile --ignore-scripts --non-interactive
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm rebuild sharp --no-audit --no-fund
yarn start --host 127.0.0.1 --port 49681 --no-open
```

The native Sharp rebuild was needed after intentionally skipping install scripts;
its prebuilt-binary setting avoided this machine's global libvips build path.
The original 6,473 source files, including the lockfile, remained byte-identical.
This is a full Docusaurus development build, so starting an existing environment
is quicker than downloading and installing the entire blog.

## Scope

Only `reload` is selected. The text fields have no explicit invalid-update
rejection signal, so this example does not claim rejected-update coverage.
It checks selected state for a 250 ms stability window, not every field, a
production build, service-worker behavior, or all future writes.
The generated config is compared as text; SSH connectivity and configuration
correctness are outside this check. No SSH command or connection is made.
The synthetic values and defaults are retained in the report and exported test.
