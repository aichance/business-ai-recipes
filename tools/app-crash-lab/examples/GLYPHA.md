# Apply the same runner to Glypha

[Glypha by Kunihisa Matsuda](https://github.com/kuny/glypha) is a real signage
app. This example checks the saved HTTP scene after browser reload and an
invalid scene update (HTTP422). It uses synthetic event text. Glypha is a
passing control; correct rejection is not a discovered bug.

## Quick trial / 日本語で試す（App Crash Labのclone不要）

Glyphaの開発環境がある場合は、そのcheckoutを使えます。以下は**使い捨てDBの
全コンテンツを合成の案内表示で置き換える**検査です。営業中のサイネージや
既存DBを指すインスタンスへ実行しないでください。必要なのはNode22+と
Chromiumです。Glyphaをソースからbuildする場合はGo1.26+ / Node24も必要です。

### 1. Glypha側で空のDBを起動

rendererをbuild済みのGlyphaフォルダから、ターミナル1で実行します。
初めてGlyphaをbuildする場合は[後半の手順](#build-glypha-from-pinned-source)を先に実行。

```sh
go build -o ./glypha-trial ./cmd/glypha
glypha_trial_dir=$(mktemp -d)
GLYPHA_ADDR=127.0.0.1:4394 GLYPHA_DB_PATH="$glypha_trial_dir/glypha.db" ./glypha-trial
```

自分で起動したこのプロセスを使い、初期 `GET /display` が204であることを確認します。
ポート4394が使用中なら既存プロセスを使わず、空いているポートで起動して、
検査コマンドへ `--base-url http://127.0.0.1:新しいポート` を追加し、下の初回HTTP確認URLも同じポートに変更してください。

### 2. 設定を取得して公開CLIを実行

ターミナル2の新しい作業フォルダで、初回だけChromiumを準備します。
既にPlaywright1.64のChromiumがあれば、このインストールは不要です。

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
```

次のブロックで、固定版の設定取得と初回確認付きの検査を実行できます。
App Crash Lab本体のcloneやsource ZIP展開は不要です。

```sh
curl --fail --location --output glypha.json https://raw.githubusercontent.com/aichance/business-ai-recipes/app-crash-lab-v0.6.1/tools/app-crash-lab/examples/glypha.json
glypha_first_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4394/display)
if [ "$glypha_first_status" = "204" ]; then
  npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.6.1/aichance-app-crash-lab-0.6.1.tgz app-crash-lab run glypha.json --out report
else
  printf '%s\n' 'Stopped: the disposable Glypha instance must return HTTP204 before its first run.' >&2
  false
fi
```

期待結果は `PASS reload` と `PASS rejected-update`。表示された `report/index.html`
で全表示データとETagの差分、保存場所、生成したPlaywrightテストを確認できます。
配布版の初回取得にはネット接続が必要です。macOSでChromiumキャッシュを使った
当方の0.6.1確認で2PASSでした。初回のブラウザdownload時間や他OSは未検証です。
これは作者本人の利用報告ではありません。

初回はHTTP204以外なら検査を実行せず停止します。204だけで所有権を証明できるわけではないため、上で自分が起動した空DBのプロセスであることも確認してください。

### 3. 次の変更後に同じ検査を再実行

ターミナル1の使い捨てインスタンスを起動したまま、同じCLIコマンドを実行します。
初回後はDBに合成表示が入るため、上の204確認ブロックではなく、確定済みの自分の使い捨てプロセスへ次を実行します。既存の出力先は上書きしません。

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.6.1/aichance-app-crash-lab-0.6.1.tgz app-crash-lab run glypha.json --out report-after-change
```

生成した単独Playwrightテストを使う場合は、この新しい作業フォルダで依存を用意します。

```sh
npm init --yes
npm install --save-dev --ignore-scripts @playwright/test@1.64.0
npx playwright test --config report/playwright.config.mjs
```

テストは同じ使い捨てサーバーへ合成データを送ります。故障検出の範囲は下記の通りです。
実行結果や導入で止まった手順は[試用報告](https://github.com/aichance/business-ai-recipes/issues/new?title=Glypha%20first-run%20feedback)へ、秘密情報を除いて共有できます。

## Build Glypha from pinned source

For a first local build, use two terminals. This example was tested on
`05183171e567ad285d718f08b6ff64620fb9c0c2`; the author's main branch was still
that commit when checked on2026-10-15. Go1.26+ / Node24 are Glypha's build
requirements. Start in a directory without `glypha-local`:

```sh
git clone https://github.com/kuny/glypha.git glypha-local
cd glypha-local
git checkout 05183171e567ad285d718f08b6ff64620fb9c0c2
cd renderer
npm ci --ignore-scripts
npm run build
cd ..
```

Then run the fresh-DB launch commands above. The first screenshot/rendering
and source-build checks were performed on2026-10-09; the0.6.1 fast-path trial
reused that local build with a new DB. We did not rebuild the app in that trial.
No upstream source/binary is bundled with App Crash Lab.

## What is compared

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
