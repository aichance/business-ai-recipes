# App Crash Lab

[日本語で試す・自分のアプリへ導入する](#japanese-setup)

**Your app says “Saved.” Does the data survive the next mistake?**

Describe one working save flow and the values worth keeping. App Crash Lab
checks **reload** and **rejected updates**, then gives you the changed values,
a browser trace and ordinary Playwright tests you can rerun after a fix.

Local Node CLI. No account, LLM call or API key during a test run. MIT licensed.
Built for disposable local web apps, including apps made with coding agents.

```text
Synthetic Notes         Save → reload       Reject empty note
Deliberate reload bug   FAIL: "Buy coffee"→"" PASS
Deliberate update bug   PASS                FAIL: "Buy coffee"→""
Fixed version          PASS                PASS
```

These are deliberately seeded defects in the included demo, not claims of
new bugs discovered in someone else's software. The same contract runs on
the broken and fixed versions.

## Try it

You need **Node 22+** and npm. In an empty folder, run these two commands.
The second downloads the pinned 0.3.0 package from this project's GitHub release;
you do not need to clone or extract the repository:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab demo
```

Open the **absolute `index.html` path printed by the command**. Reports are
written under `.crash-lab/` in your current folder, not inside npm's cache.
The first run downloads dependencies and Chromium. On Linux, browser system
libraries may also be required; replace the first command with
`npx --yes --package=@playwright/test@1.64.0 playwright install --with-deps chromium`.
Installing system libraries may require administrator access on your machine.

Prefer a source checkout? From this directory in the checkout or
[0.3.0 source ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-0.3.0.zip):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run demo
```

Both routes start a disposable demo server, run both checks against three
versions, write the actual reports, and stop the server. These are synthetic
fixtures; running the demo does not test your own app.

## Check your app

1. Start a **disposable local development instance** of your app.
2. Save [`examples/notes.json`](examples/notes.json) as `my-app.json` in your working folder (use **Raw → Save As** on GitHub, or copy it from the source ZIP).
3. Set both `baseURL` (the local origin) and `path` (your app's route). The copied `/?mode=fixed` path belongs only to the demo. Set save steps (`save: true` on the save trigger), saved values and invalid input/rejection signal.
4. Run:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run my-app.json
```

From a source checkout, `node cli.mjs run my-app.json` also works. Each run
prints its report path and creates a new output directory by default. If
you set `--out`, choose a new directory for each run. Nothing is uploaded. Test actions
write to your app: use synthetic records, not an app containing real work.
The browser starts with a fresh context for each check; server-side records
need an explicit reset or a setup flow that replaces the complete fixture.

The two essential questions in your contract are:

```json
{
  "observe": {
    "savedNote": { "source": "text", "target": { "testId": "saved" } }
  },
  "expected": { "savedNote": "Buy coffee" }
}
```

This is a fragment, not a complete contract. `observe` selects what must
survive; `expected` proves the normal save reached a known-good result.
For rejected updates, separately describe how rejection is acknowledged.
Why wait for that signal? The [failure-boundary example](examples/failure-boundary/README.md)
holds a synthetic failed response and shows how an input assertion passes
before the failure handler erases it. Waiting for the exact failure first
catches the broken version and passes the fixed control.
An error message can change while the saved note must stay unchanged.

Use [`CONTRACT.md`](CONTRACT.md) for the complete format and supported actions.
If an error message appears only after invalid input, use the
[conditional-message example](CONTRACT.md#error-elements-that-appear-only-after-invalid-input).
[`examples/inventory.json`](examples/inventory.json) combines UI actions,
HTTP 422 and server JSON. [`examples/glypha.json`](examples/glypha.json) is a
real-app adapter for [Glypha](https://github.com/kuny/glypha), with setup
instructions in [`examples/GLYPHA.md`](examples/GLYPHA.md).
For a browser-only JSON importer, [`examples/tunoron.json`](examples/tunoron.json)
uploads a synthetic song and observes its saved record through a dynamic
localStorage key. See [`examples/TUNORON.md`](examples/TUNORON.md) for the two
checks, local setup and verification limits. Requires runner 0.2 or later.
For native `alert()` rejection, the [Sethera example](examples/SETHERA.md)
checks a synthetic piece across reload and malformed JSON import. Requires
runner 0.3 or later. The [annotate.js example](examples/ANNOTATE.md) checks a
synthetic review comment and its malformed-import toast.
The [Multi-Counter example](examples/MULTI-COUNTER.md) compares two saved names,
counts and a three-event history in local mode, with a reload-only contract.

The [Fala Gringo example](examples/FALA-GRINGO.md) preserves synthetic learning
progress and saved goals while excluding an intentional visit counter. It
shows how a whole-storage assertion can report a false data-loss failure.

### Ask your coding agent to configure it

[Copy a self-contained setup prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#agent)
from the project page. It includes pinned format/example links and the current
no-clone commands. Paste it inside your disposable app project in your existing
coding agent. Review the generated contract and actual results.

```text
Use App Crash Lab against my disposable local app. Read CONTRACT.md and the
notes.json example. Inspect my app's real save flow, selectors and validation.
Write my-app.json with a known-good saved value and an invalid update that
the app should reject. Observe saved/domain data, not the editable draft or
error message. Add server reset steps if browser isolation is insufficient.
Do not change application code or loosen expected values to make tests pass.
Run both checks and show me the report, differences and reproduction spec.
If a required observation or rejection signal is unavailable, explain it.
```

Using an agent to author the config is optional and uses your existing
agent account. The runner itself does not call a model.

### Already use Playwright?

You can add these checks directly to an existing suite. Choose App Crash Lab
when you want the same contract-driven checks, phase/status, saved-state
differences and generated reproduction together. Playwright also provides
reports, traces, screenshots and assertion diffs.

[Run the direct-Playwright comparison and choose your route](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab/examples/direct-playwright).
Both paths passed the same two normal-case Glypha checks. This does not prove
faster setup or better bug detection. The comparison is available in the
current checkout; the original v0.1.0 source ZIP predates these extra examples.

## Keep the evidence; rerun the test

Every run writes:

- `index.html` and `report.json`: verdicts, phases, baseline, final state and diffs.
- `contract.json`: exact normalized input plus a SHA-256 in the report.
- `reload.trace.zip` / `rejected-update.trace.zip` and final screenshots.
- `repro.spec.mjs` and `playwright.config.mjs`: self-contained tests depending
  only on `@playwright/test`, not this CLI or an AI service.

With the target app still running, from this package directory:

```sh
npx playwright test --config .crash-lab/my-first-run/playwright.config.mjs
npx playwright show-trace .crash-lab/my-first-run/reload.trace.zip
```

If you used the no-clone route, change into the **printed report directory**,
then install the test runner there before rerunning. Use the directory name
from your run, not the illustrative `.crash-lab/my-first-run` above:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

The generated spec embeds the exact contract. If your app moves to a new
port, update its `baseURL`; record that change when comparing results. To
use the spec in another project, install `@playwright/test@1.64.0` and its
Chromium browser there. Run with one worker so server resets do not race.

Using Playwright directly and missing a trace after a failed local run?
[Reproduce the first-attempt / first-retry difference](examples/FIRST-FAILURE-TRACE.md)
with one deliberately failing test and a `--trace on` comparison.

### Rerun a generated test from the demo

`npm run demo` stops its temporary server when finished. To try the complete
run-and-rerun workflow with the fixed Notes fixture, keep this running in one terminal:

```sh
npm run demo:serve
```

In another terminal, from this package directory:

```sh
node cli.mjs run examples/notes.json --out .crash-lab/fixed-repro
npx playwright test --config .crash-lab/fixed-repro/playwright.config.mjs
```

Both checks should pass. Use a new output directory for another run.
The server defaults to `http://127.0.0.1:4173`; stop it with Ctrl+C afterward.
To rerun a spec from the earlier three-version demo instead, change `baseURL`
in that output's `repro.spec.mjs` to this server's address, keeping its `path`
and expected values unchanged. Its original temporary port is no longer live.

`PASS` means the selected values matched after the configured check.
`FAIL` means the selected state changed or the expected rejection did not
occur. `INCONCLUSIVE` means setup, selectors, observations or infrastructure
prevented a trustworthy verdict. CLI exit codes are `0`, `1`, `2` respectively
(any inconclusive result takes priority over failure). The demo has its own
exit status: intentionally failing fixture checks are expected demo success.

## What this doesn't infer

You supply the app's intended behavior. A URL alone cannot specify it.
This is a small, versioned `state-preservation@1` check pack, not autonomous
exploration or a proof of app quality. It waits for the expected final state, then samples it for a short stability
window (default 250 ms), not every transient write, power loss or concurrent user.
Values not selected in `observe` are outside the test.

Only the configured loopback HTTP(S) origin is allowed. No browser profile
reuse, cross-origin services or service workers in this first version.
Apps requiring those features need a different test setup. Raw contracts,
screenshots and traces may contain app data; inspect them before sharing.

Playwright can implement these checks directly. This package supplies the
two patterns, a reusable contract and consistent debugging output. It does
not claim a new testing technique or better bug detection than every other tool.

## More real-app examples

The [TypeTrail check](examples/TYPETRAIL.md) completes a chapter through the UI and verifies its progress, completion marker and saved JSON after reload. Japanese instructions and an unchanged-source compatibility result are included.

For a synthetic example of a misleading PASS, [compare saved language with visible language](examples/VISIBLE-LANGUAGE.md). The same display defect passes a full-text/storage check but fails once visible-language observations are added. Download the five-file example pack and reproduce all three outcomes with the existing 0.3.0 runner.

The [Creator Frame Studio check](examples/CREATOR-FRAME.md) tests one wrong-schema project import against 11 unchanged editor values. It selects rejection only; file save/reopen is outside its automated coverage. A runnable JSON and standalone-test instructions are included.

The [CereusDB check](examples/CEREUSDB.md) creates one synthetic OPFS row, reloads the page, explicitly attaches the database and compares a fresh SQL result. It includes setup with the official 0.4.0 package and a reload-only contract; machine-crash durability is outside coverage.

## Contribute a real use case

If you tried it on **your own app**, an issue with the app/framework, which
checks ran, setup friction and a sanitized result helps improve the next
version. A failing selector is useful feedback too. Do not include secrets
or production records. Stars are optional; access and support do not depend
on them.

Development: `npm test` runs actual browser checks, fault controls, HTTP-state
checks and reruns the generated specs. See `tests/`. Maintained by aichance
with AI assistance; report facts and limitations are reviewed against runs.


---

<a id="japanese-setup"></a>
## 日本語：試すところから、自分のアプリへ

**「保存しました」の後も、その値は残っていますか？**
App Crash Labは、正常に保存できる操作を1つ設定し、次の2つを検査します。

- 再読み込みした後も、保存した値が残る。
- 無効な更新が拒否された後も、直前の正常な値が壊れない。

結果には、保存値の前後の差分・ブラウザtrace・単独で再実行できるPlaywrightテストが含まれます。
実行する操作と期待値はJSONで指定します。アプリの仕様や保存場所を自動で推測するツールではありません。

### まず、インストールせずに体験する

[日本語のブラウザ体験ページ](https://aichance.github.io/business-ai-recipes/test-the-test-ja.html)で、
「英語を保存 → 再読込」を押し、実際の本文を検査対象に加えてください。
同じ画面でも、確認する値によってPASSとFAILが変わる例を試せます。
これは故障を仕込んだ教材です。自分のアプリの検査や、Node CLIの実行ではありません。

### CLIのデモを2コマンドで動かす

**Node.js 22以上とnpm**が必要です。書き込み可能な作業フォルダーで実行します。
初回は依存パッケージとChromiumをダウンロードします。cloneは不要です。

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab demo
```

終了時に表示される **`index.html`の絶対パス**をブラウザで開きます。
結果は作業フォルダーの`.crash-lab/`配下に保存されます。
Linuxでブラウザ用のシステムライブラリが不足する場合は、最初のコマンドを
`npx --yes --package=@playwright/test@1.64.0 playwright install --with-deps chromium`
へ変えてください。システムライブラリの導入には管理者権限が必要になる場合があります。

| デモの種類 | 再読み込み | 無効な更新の拒否後 |
| --- | --- | --- |
| 保存を忘れる故障例 | FAIL | PASS |
| 拒否した更新で値を壊す故障例 | PASS | FAIL |
| 修正版 | PASS | PASS |

このFAILは教材に仕込んだ故障を検出した結果です。デモだけでは、あなたのアプリは検査していません。

### 自分のアプリを検査する

合成データを使う、使い捨てのローカル開発環境を起動してください。
テストはアプリを操作して保存するので、実データが入った環境では実行しないでください。

1. [notes.json](examples/notes.json)を`my-app.json`として保存します。GitHubなら **Raw → 名前を付けて保存**で取得できます。
2. `baseURL`と`path`を自分のアプリへ合わせます。元の`/?mode=fixed`はデモ専用です。
3. 以下の対応表に沿って、画面の項目・保存操作・期待値を書き換えます。
4. 同じ作業フォルダーから実行します。

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run my-app.json
```

| JSONの項目 | 自分のアプリで指定するもの |
| --- | --- |
| `setup` | 正常な入力、保存ボタン、保存完了の確認。保存のきっかけとなる操作に`save: true`を付ける |
| `observe` / `expected` | 保存後に残るべきデータと、その既知の正常値。編集中の下書きやエラー文だけを見ない |
| `rejectedUpdate.steps` | アプリの仕様上、拒否される無効な更新操作 |
| `rejectedUpdate.observe` / `expected` | 今回の拒否が完了したことを確認できる表示や応答 |
| `reset` | 必要な場合のデータ初期化。ブラウザを分けてもサーバー側の記録は初期化されない |

完全な形式と対応アクションは[CONTRACT.md](CONTRACT.md)にあります。
拒否の表示と保存値は別に観測します。[失敗処理の完了を待つ比較例](examples/failure-boundary/README.md)では、
値が正しくても早く読みすぎると故障を見逃すケースを再現できます。
ネイティブ`alert()`でJSON読込を拒否するアプリなら、[Setheraの設定例](examples/SETHERA.md)も参照できます。

### 設定作成を、普段のコーディングエージェントに頼む

次の依頼文を、**検査対象のアプリのプロジェクト内**で使ってください。
エージェントの利用は任意で、CLI自体はLLMやAPIキーを使いません。
作られた設定と結果は確認してください。アプリのソースや個人データをIssueへ貼る必要はありません。

```text
App Crash Lab 0.3.0で、この使い捨てのローカル開発アプリを検査してください。
形式と設定例を読んでから、実際の保存操作・画面要素・入力検証を確認してください。
https://github.com/aichance/business-ai-recipes/blob/app-crash-lab-v0.3.0/tools/app-crash-lab/CONTRACT.md
https://github.com/aichance/business-ai-recipes/blob/app-crash-lab-v0.3.0/tools/app-crash-lab/examples/notes.json

合成データを正常に保存し、再読み込みと無効な更新の拒否後に同じ保存値を確認する
my-app.jsonを作ってください。編集中の下書きやエラー文を、保存済みデータと混同しないでください。
拒否処理の完了も確認し、必要ならサーバー側データのresetを設定してください。
アプリ本体を書き換えたり、PASSにするために期待値を緩めたりしないでください。

Node 22以上を確認して、次を実行してください。
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run my-app.json

検査結果、前後の値の差分、レポートの絶対パス、生成されたrepro.spec.mjsを示してください。
観測や拒否の確認がこの形式で表せなければ、検査できない点を説明してください。
```

### 結果を読む・再実行する

**PASS**は設定した値が保たれたこと、**FAIL**は確認した差異や失敗があることを示します。
基準値・拒否の確認・必要な観測が得られない場合は、PASSと解釈しないでください。
レポートの段階・メッセージを読み、設定の不備とアプリの挙動を区別します。

生成されたPlaywrightテストを再実行するときは、対象アプリを起動したまま、
表示された**レポートのフォルダー**へ移動して次を実行します。

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

デモは実行後に一時サーバーを停止するため、そのままでは再実行できません。
デモの再実行手順は[こちら](#rerun-a-generated-test-from-the-demo)です。
利用者のアプリ・対応環境全体の安全性や品質を保証する検査ではありません。
実行にはアカウント・APIキー・有料プランは不要です。MITライセンスで公開しています。

試した結果や設定で止まった箇所は、[GitHub Issues](https://github.com/aichance/business-ai-recipes/issues)へ
日本語で書けます。実データや認証情報は含めず、環境・実行した検査・結果を教えてください。
