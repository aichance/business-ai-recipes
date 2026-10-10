# Apply the same runner to Glypha

[Glypha by Kunihisa Matsuda](https://github.com/kuny/glypha) is a real signage
app. This example checks the saved HTTP scene after browser reload and an
invalid scene update (HTTP 422). It uses synthetic event text. Glypha is the
normal control here; do not describe its correct rejection as a discovered bug.

1. Build a disposable Glypha checkout following its README. The version used
   for our fixture is `05183171e567ad285d718f08b6ff64620fb9c0c2`, with Node 24
   and Go 1.26+. These are Glypha's build requirements, not this runner's.
2. After building the renderer, run these commands from Glypha's repository
   root. The first command creates the executable used below; start it with a
   **fresh temporary DB**:

```sh
go build -o ./glypha-trial ./cmd/glypha
glypha_trial_dir=$(mktemp -d)
GLYPHA_ADDR=127.0.0.1:4394 GLYPHA_DB_PATH="$glypha_trial_dir/glypha.db" ./glypha-trial
```

3. Confirm this is your newly started process; `/display` should initially
   return 204. Do not use an existing signage deployment: the trial replaces
   its complete content package.
4. From App Crash Lab, run:

```sh
node cli.mjs run examples/glypha.json --out .crash-lab/glypha-first-run
```

The raw multipart body is included in the JSON contract; it sends no external
files. Each pattern publishes the complete known-good fixture as setup, then
compares the entire `/display` JSON and ETag captured in that trial. A new
generation ID between trials is allowed; a changed generation during one
preservation check fails. No changes to the generic runner are required.

The invalid scene positions a 1680-wide element at x=1900 on a 1920-wide
canvas. Expected rejection: 422. The baseline caption is
`会場 A / 14:00 開始`. The canvas must be present after publication/reload.

This contract checks the saved scene and canvas presence, not pixel equality,
daily scheduling, long-running appliance behavior or every possible scene.
The upstream source and product remain their author's work. This example is
an independent local compatibility check, not author adoption or endorsement.
