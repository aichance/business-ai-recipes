# Demo Forge: Turn a working app into a demo people can try

## English

Demo Forge turns a short browser operation into a real, replayable demonstration of a self-owned localhost app. The first slice fills a project name, launches the kit, verifies the app's final state, and produces WebM, MP4, GIF, and a cover image. The GIF is written as `demo-forge.gif` after conversion from the verified MP4 at 10 fps.

Try it with synthetic input:

```bash
python3 experiments/demo-forge/forge.py \
  --output .demo-forge-output/demo-forge
```

Run from the repository root with Python 3.11+, the Python Playwright package
and its Chromium browser installed, plus `ffmpeg` on `PATH`. This repository
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

For a 10-30 second share preview, add `--tail-seconds 8`. This holds the
verified final browser frame in the converted MP4 and GIF; it does not add a
new interaction or claim a live external session.

## 日本語

Demo Forgeは、短いブラウザ操作定義から、自作localhostアプリの実画面を使った再生可能な実演素材を作ります。最初の版では、プロジェクト名を入力して起動し、アプリ自身の成功状態を確認したうえで、WebM・MP4・GIF・表紙画像を出力します。GIFは確認済みMP4から10fpsで変換します。

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

10〜30秒の共有用プレビューを作る場合は`--tail-seconds 8`を追加します。
これはブラウザ操作の成功後に実際に確認した最終画面を、変換後のMP4とGIFで保持する
だけです。新しい操作を追加したり、外部のライブセッションを保証したりしません。

### Current limits / 現在の制約

- 対応アプリはこの自作Demo Forgeアプリ一つです。
- 外部APIキー、顧客データ、ログイン済みサービスは使いません。
- 失敗した操作を成功素材として出力しません。
