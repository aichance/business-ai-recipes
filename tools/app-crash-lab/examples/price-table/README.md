# 底値表 / Price Table: actual JSON backup round-trip

**実測：PASS** — 商品と価格を通常のUIから登録し、アプリ自身が出力したJSONを
別の空のブラウザ環境へ読み込み、再読み込み後まで同じ内容を保持しました。
作者の実行報告ではなく、AIを使ったローカル互換試験です。

対象は個人作者の[底値表](https://github.com/ryomeblog/price-table)、未変更の
[`02a4d498`](https://github.com/ryomeblog/price-table/tree/02a4d49845e7ab5e31de591250d7418f2ec2876b)。
公開サービスの現行版、作者による採用、アプリ全体の正しさは主張しません。
上流コードや実データはこの例に同梱していません。

## 同じ検査を動かす

2026-10-15、macOS arm64 / Node22.16.0 / Playwright1.64.0 Chromium、
App Crash Lab0.6.1でCLIと生成Playwrightを実行。Node22+、Python3が必要です。
App Crash Lab0.6.1のsource ZIPを展開したフォルダを以下では `CRASH_LAB` とします。
シェル変数の値は自分の絶対パスに置き換えてください。

ターミナル1で、上流の使い捨てのコピーを起動します。

```sh
git clone https://github.com/ryomeblog/price-table.git price-table-local
cd price-table-local
git checkout 02a4d49845e7ab5e31de591250d7418f2ec2876b
npm ci --ignore-scripts
CI=false npm run build
CRASH_LAB=/absolute/path/to/app-crash-lab-0.6.1
python3 "$CRASH_LAB/examples/price-table/serve.py" "$PWD/build"
```

`CI=false` はCRAの既存lint警告をローカルビルドのエラーにしないための指定です。
上流ファイルを修正しません。サーバーは `127.0.0.1:54441` のみで待ち受け、
元の `/price-table/` パスを維持し、service workerを無効化します。

ターミナル2で、App Crash Labのフォルダへ移動して実行します。

```sh
cd /absolute/path/to/app-crash-lab-0.6.1
npm ci --ignore-scripts
npx playwright install chromium
node cli.mjs run examples/price-table/roundtrip.json
```

期待値は `PASS backup-roundtrip` / 終了コード0。
表示されたレポートの生成テストも実行できます。

```sh
npx playwright test --config /absolute/path/to/report/playwright.config.mjs
```

## 何を比べたか

合成の商品「Crash Lab 合成米」、単位kg、説明と、価格1480円・数量5・店舗・
メモ・日付を通常UIで入力。保存された商品配列 `price-table-products` と
価格配列 `price-table-price-records` を**全体で**比較します。
動的IDや時刻も元値との一致対象です。画面の価格件数と296円/kgの要約も確認。

1. 商品・価格の保存と画面表示を確認。
2. 「エクスポート」が返す本物のJSONを取得し、選択した全保存値と一致するか確認。
3. 別の新規contextで商品・価格が空であることを確認。
4. 「インポート」がその場で作る未接続のfile inputへ、実際のfile chooser経由で
   **元ファイルの未変更bytes**を渡す。入力要素の注入・アプリコード改変はしない。
5. アプリの自動reload後、および検査側の追加reload後に全選択値を比較。

最初の実測は859bytes / 元bytesアップロード / 全4比較一致、約10秒でした。
サイズと時間は生成時刻や実行環境で変わります。レポートは保存データを含まない
metadata-only形式ですが、宣言した合成入力と契約は保存されます。

買い物リスト、設定、offline/PWA、異常ファイル拒否、容量制限、スマホ、別ブラウザ、
公開デプロイ版は対象外。これは障害の発見報告ではなく正常系の回帰検査です。
[自分のアプリへ移す方法と制約](../../BACKUP.md)も確認してください。
