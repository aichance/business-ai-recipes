# Demo Forge: Turn a working app into a demo people can try

## Keep explanations attached to the operation

With Playwright 1.59+, `--narrate` uses its native Screencast API to show a
chapter before selected steps. Add `"chapter": "Save the brief"` to a step,
instead of choosing a video timestamp. Put a result chapter **after** a
`wait_for_selector` step so it follows the app's actual completion.

```bash
python3 experiments/demo-forge/forge.py --doctor --narrate
python3 experiments/demo-forge/forge.py --narrate \
  --operation experiments/demo-forge/operation.narrated.json \
  --tail-seconds 2 --output .demo-forge-output/narrated
```

**Try the new chapters without installing anything locally:** fork this repo,
open **Actions → Verify → Run workflow** on `main`, and download the
**demo-forge-chapters** artifact after its job succeeds. It runs this exact
narrated operation on Ubuntu 24.04 with Playwright 1.63.0. Play
`demo-forge.mp4` to inspect the result; the ZIP also contains the GIF, WebM,
cover and three JSON reports. Artifacts expire after one day. This requires
a GitHub account and Actions-enabled fork, and uses the included Launch Kit
app, not the 3-second-delay fixture. The separate **demo-forge-first-run**
artifact still demonstrates the ordinary Playwright 1.58 recording path.

The sample runs the included app. For your own running app, add
`--url http://127.0.0.1:PORT/` and use its selectors. Provide 1–8 short chapter
texts, up to 90 characters each. Each title appears for two seconds plus the
native fade; actions also receive native visual hints. Long app waits remain
in the video. This does not generate text or voice, trim waiting time, or
upgrade a UI assertion into proof of a backend write.

Chapter cards are burned into the recording: change the text and rerun to
edit them. The separate `present.py` workflow below is still useful for
editing explanations after recording, with manually chosen times. The
ordinary recorder still supports Playwright 1.48+; only `--narrate` needs
1.59+. Update Playwright and its Chromium in your project virtual environment
if the narration doctor reports a missing capability. Native behavior was
tested with Playwright 1.63.0 / Chromium on macOS.

`run.json` records the chapter text, step number and diagnostic elapsed wall
time; those times are not frame-exact media cue points. A failed operation or
final check exports no new successful media. Chapter order still depends on
the operation you authored; review the actual video before sharing it.

The recording and chapter rendering are provided by
[Playwright Screencast](https://playwright.dev/python/docs/api/class-screencast).

## Add an explanation to the real recording

`present.py` turns a successful Demo Forge run plus your caption JSON into a
1280×720 H.264 explainer. It keeps the original video unmodified, fits the whole
frame below a separate explanation area, and writes to a **new** directory.
No API key, TTS, external fonts, or FFmpeg `drawtext` build is required.
Playwright/Chromium, FFmpeg **and ffprobe** must be installed.

```bash
python3 experiments/demo-forge/forge.py --tail-seconds 8 \
  --output .demo-forge-output/recording
python3 experiments/demo-forge/present.py \
  --run-dir .demo-forge-output/recording \
  --story experiments/demo-forge/story.example.json \
  --output .demo-forge-output/explainer
```

Open `explainer.mp4`. `presentation.json` records the input video hash, actual
output duration, and the captions. Edit `label` and `cues` in the JSON: each cue
has an `at` time in seconds and `text`. The first starts at zero. Use 1–8 cues,
up to 90 characters each, within a recording of at most 120 seconds. Times are
rounded to a 25 fps frame boundary. Overlong captions and failed source runs
are rejected; an existing output directory is never reused.

**Captions are authored explanations, not facts checked by the UI assertions.**
Review every new recording: app speed can change, so the caption times are
manual, not automatically synchronized. The presentation is silent and does
not change playback speed or crop the app. A tiny original recording remains
low resolution when enlarged. Rendering speed and setup savings are unmeasured.

For an app that exports media, a wait can explicitly allow up to 60 seconds:

```json
{"type": "wait_for_selector", "selector": "#output-panel", "timeout_ms": 45000}
```

Then bring its result into the recording with:

```json
{"type": "scroll_into_view", "selector": "#output-panel"}
```

### 日本語

実録画に、作者が書いた説明を重ねるローカル後処理です。上の2コマンドで
録画→説明付きMP4を生成できます。`story.example.json`の秒数と本文を自分の
用途に合わせ、再録画するたびに説明と映像を確認してください。説明の内容を
自動検証・自動同期する機能ではありません。元動画は変更せず、画面の切抜きや
速度変更は行いません。音声は付きません。FFmpeg同梱のffprobeも必要です。

検証では付属Briefアプリに加え、Cutroomの合成動画49.36秒から1つの字幕を
キーワードで選び、8.1秒の動画と字幕を書き出す操作を録画しました。
実利用・第三者採用や速度向上の証明ではありません。

## English

Demo Forge turns a short browser operation into a real, replayable demonstration of a self-owned localhost app. The first slice fills a project name, launches the kit, verifies the app's final state, and produces WebM, MP4, GIF, and a cover image. The GIF is written as `demo-forge.gif` after conversion from the verified MP4 at 10 fps.

### Try the included app in GitHub Actions

Generate a sample recording without installing Python, Chromium, or FFmpeg on
your computer:

1. Fork this repository into your own GitHub account.
2. In your fork, open **Actions** and enable workflows if GitHub prompts you.
3. Select **Verify**, choose **Run workflow** on `main`, and start the run.
4. Open the completed run. After `demo-forge-first-run` succeeds, download the
   **demo-forge-first-run** artifact from the run's summary. Artifacts expire
   after one day.

The ZIP contains an MP4, GIF, WebM, cover image, `run.json`, `doctor.json`, and
`verification.json`. The verification report includes the actual MP4 duration,
file sizes, and hashes. This workflow installs the recording dependencies on
Ubuntu 24.04, operates the included synthetic Brief app, and checks all six UI
steps before exporting the media. A GitHub account and an Actions-enabled fork
are required. To record your own app, follow the local instructions below.


### Run locally

Try it with synthetic input:

```bash
python3 experiments/demo-forge/forge.py \
  --output .demo-forge-output/demo-forge
```

Run from the repository root with Python 3.11+, the Python Playwright package
1.48+ and its Chromium browser installed, plus `ffmpeg` on `PATH`. This repository
does not install those tools or require an external API key.

Before starting a run, check the local prerequisites without launching the
server or browser:

```bash
python3 experiments/demo-forge/forge.py --doctor
```

If the command reports a missing item, its JSON output includes the exact
repair step. A `missing` result is a setup diagnostic, not a failed demo run.
When Playwright is missing from a system Python, the repair steps create the
named `.demo-forge-venv` first so the install does not write into an
OS-managed interpreter. Use that environment's Python for the run as well:

```bash
python3 -m venv .demo-forge-venv
.demo-forge-venv/bin/python -m pip install playwright
.demo-forge-venv/bin/python -m playwright install chromium
.demo-forge-venv/bin/python experiments/demo-forge/forge.py \
  --output .demo-forge-output/demo-forge
```

The JSON doctor result includes `python_environment: "system"` or
`"virtualenv"` so the repair path is explicit.

The app stays on `127.0.0.1`. The input is `Launch Kit`. Success means the app itself reports `Ready to share`, the result card has `data-state="success"`, and the result says `Launch Kit is ready`.

This is a local demonstration route, not a claim of generic browser automation or a speedup. In a same-machine three-run comparison, Demo Forge had a 2.420s median versus 1.421s for direct Playwright; human setup time remains unmeasured.

The runner also accepts `--server` and `--operation` for a self-owned app
with the documented ready-line contract. The checked-in `examples/brief-app`
uses the same command shape and is a portability example, not proof of
generic browser compatibility.

### Record your already-running app

Your app can keep its normal startup command. Supply its URL and your own
operation JSON; URL mode needs no ready-line contract and leaves the app running.

For a complete trial, keep this included app running in terminal one:

```bash
python3 experiments/demo-forge/examples/brief-app/server.py --port 3000
```

In terminal two, record it with no startup handling:

```bash
python3 experiments/demo-forge/forge.py \
  --url http://127.0.0.1:3000/ \
  --operation experiments/demo-forge/examples/brief-app/operation.json \
  --output .demo-forge-output/brief-url
```

```bash
python3 experiments/demo-forge/forge.py \
  --url http://127.0.0.1:3000/ \
  --operation my-operation.json \
  --output .demo-forge-output/my-app \
  --tail-seconds 8
```

Adapt the selectors and expected text to your own app. This example works with
the checked-in `examples/brief-app` when it is already running on port 3000:

```json
{
  "name": "my-app-demo",
  "input": {"title": "Release Brief"},
  "steps": [
    {"type": "fill", "selector": "#brief-input", "value": "Release Brief"},
    {"type": "click", "selector": "#save-button"},
    {"type": "wait_for_selector", "selector": "#result-card[data-state='success']"}
  ],
  "success": {"selector": "#result-title", "text": "Release Brief is ready"}
}
```

Use an explicit `http://127.0.0.1:PORT/path`. `--operation` is required with
`--url`; credentials and fragments are rejected. Requests stay on that exact
port. Redirects, WebSockets, service workers and cross-origin assets are
unsupported. `run.json` describes the latest attempt; only a successful attempt
exports media at the top level.
URL mode records `managed_by_forge: false` and does not stop the running app.

For a 10-30 second share preview, use `--tail-seconds 8`. This holds the
verified final browser frame in the converted MP4 and GIF; a shorter tail is
useful for a smoke check but produces a shorter preview. It does not add a new
interaction or claim a live external session.

## 日本語

Demo Forgeは、短いブラウザ操作定義から、自作localhostアプリの実画面を使った再生可能な実演素材を作ります。最初の版では、プロジェクト名を入力して起動し、アプリ自身の成功状態を確認したうえで、WebM・MP4・GIF・表紙画像を出力します。GIFは確認済みMP4から10fpsで変換します。

### GitHub Actionsでサンプルを試す

ローカルへPython・Chromium・FFmpegを導入する前に、付属アプリの録画を
GitHub上で生成できます。

1. このリポジトリを自分のGitHubアカウントへForkします。
2. Fork先の **Actions** を開き、表示された場合はワークフローを有効にします。
3. **Verify → Run workflow → main** で実行します。
4. `demo-forge-first-run` の成功後、実行結果のSummaryから同名のArtifactを
   ダウンロードします。保存期間は1日です。

ZIPにはMP4・GIF・WebM・表紙と3つのJSONレポートが入ります。
`verification.json`で実際の動画尺・ファイルサイズ・hashを確認できます。
Ubuntu 24.04に依存関係を導入し、合成データを使う付属Briefアプリの6操作を
確認する試用経路です。GitHubアカウントとActionsを有効にしたForkが必要です。
自分のアプリを録画する場合は、下記のローカル実行手順を使ってください。

### ローカルで実行する

合成入力で試す:

```bash
python3 experiments/demo-forge/forge.py \
  --output .demo-forge-output/demo-forge
```

リポジトリのルートから実行し、Python 3.11以上、PlaywrightのPython
パッケージとChromium、PATH上の`ffmpeg`を用意してください。外部APIキーや
ログイン済みブラウザは不要です。成功後は`run.json`の`status: success`と、
`Ready to share` / `Launch Kit is ready`を確認します。

実行前に、アプリやブラウザを起動せず前提条件を確認できます。

```bash
python3 experiments/demo-forge/forge.py --doctor
```

JSONに不足項目と修復コマンドが表示されます。`missing`は実演失敗ではなく、
実行前のセットアップ診断です。

操作対象は `127.0.0.1` のみです。入力は `Launch Kit`。成功条件は、アプリの表示が `Ready to share` になり、結果カードの `data-state="success"` と `Launch Kit is ready` を確認できることです。

これはローカル実演経路の最小版であり、汎用ブラウザ自動化や速度向上を保証するものではありません。同一マシンで3回比較したところ、中央値はDemo Forge 2.420秒、直接Playwright 1.421秒でした。人手の準備時間は未測定です。

`--server`と`--operation`を指定すれば、自作localhostアプリと操作定義を
差し替えられます。`examples/brief-app`に別の最小アプリ例を保存していますが、
これは差し替え経路の確認であり、汎用ブラウザ互換性の証明ではありません。

既に起動済みのアプリには`--url http://127.0.0.1:3000/`と、自分の画面に
合わせた`--operation my-operation.json`を指定できます。専用の起動メッセージや
サーバー変更は不要で、実行後もアプリを終了させません。操作定義例は上のJSONを
参照してください。HTTPの同じポート内を対象とし、リダイレクト・WebSocket・
service worker・別originの素材には対応しません。最新の`run.json`の成功・失敗を確認してください。手作業の準備時間短縮は未測定です。

10〜30秒の共有用プレビューを作る場合は`--tail-seconds 8`を追加します。
これはブラウザ操作の成功後に実際に確認した最終画面を、変換後のMP4とGIFで保持する
だけです。新しい操作を追加したり、外部のライブセッションを保証したりしません。

### Repeat a recording / 同じ出力先で再実行

You can reuse `--output`. Before a new attempt, previous Demo Forge media and
its original report move into `previous-runs/run-*/`. `previous_run_dir` in the
new report identifies that folder. Archived reports preserve their original
paths; archived media is beside the report under the same filenames.

The current MP4/GIF/WebM/cover appear only after the UI checks and both
conversions pass. A failed attempt leaves a failed `run.json`, not an older
successful clip at the current media paths. Other files such as your notes stay
untouched. Unrecognized files occupying the artifact names are preserved and
the command asks for a different output directory. Use a separate output
directory for each concurrent process; simultaneous writers are unsupported.

同じ`--output`で再実行できます。前回の動画・表紙・元のreportは
`previous-runs/run-*/`へ保存し、新しいreportの`previous_run_dir`で場所を示します。
今回の操作確認と動画/GIF変換が全部成功してから、直下へ新しい素材を出力します。
失敗時に古い成功動画を今回の成果と取り違えないための動作です。
メモなど他のファイルはそのまま残します。同じ出力先への同時実行は未対応です。

### Current limits / 現在の制約

- 既定アプリ、別アプリ例、合成の起動済みHTTPアプリで検証しています。任意のアプリへの互換性は保証していません。
- 外部APIキー、顧客データ、ログイン済みサービスは使いません。
- 失敗した操作を成功素材として出力しません。
