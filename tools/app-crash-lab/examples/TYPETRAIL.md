# TypeTrail: クリアした章が再読込後も残ることを確かめる

**2026-10-11 に公開版 App Crash Lab 0.3.0 で `PASS reload`、出力された Playwright テストも 1 件 PASS。**
対象は [TypeTrail](https://github.com/dkdk443/TypeTrail/tree/68c34286f58fcd9ccba82151685455b8e90e7d10) のコミット `68c34286f58fcd9ccba82151685455b8e90e7d10` です。
これは私たちによる互換性検証で、TypeTrail 作者による導入報告ではありません。

第1章「型注釈と型推論」を画面上の13操作でクリアし、次の3点が再読込の前後で一致するかを確認します。

| 観測対象 | 期待値 |
| --- | --- |
| 進捗表示 | `7%` |
| 第1章のボタン | `✓ 型注釈と型推論 クリア済み・見なおし中` が1件 |
| `localStorage` の `typetrail:done` | `{"ts":{"0":true},"js":{}}` |

`localStorage` を先に書き換えるテストではありません。新しいブラウザ環境で第1章の3ステップに正解し、アプリ自身に保存させます。

## ローカル版で試す

Node 22 以上と npm を用意し、自分の TypeTrail 開発用コピーでサーバーを起動します。確認したソースは作者の [固定コミットの ZIP](https://github.com/dkdk443/TypeTrail/archive/68c34286f58fcd9ccba82151685455b8e90e7d10.zip) から取得できます。

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 49720 --strictPort
```

別の作業フォルダに [`typetrail.json`](typetrail.json) を保存します（GitHub の **Raw → Save As**）。別ターミナルでそのフォルダに移動し、次を実行します。

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run typetrail.json
```

既存の開発サーバーを使う場合、2つ目のコマンドに `--base-url http://127.0.0.1:5173` のように実際のポートを指定します。初回は依存パッケージと Chromium のダウンロードが必要です。実行時に LLM や API キーは使いません。

CLI が表示する絶対パスの `index.html` を開くと、結果・比較値・スクリーンショットを確認できます。テストは専用の新しいブラウザ環境で動くため、普段使っているブラウザの学習進捗を初期化しません。

## 出力されたテストを手元に残す

TypeTrail サーバーを動かしたまま、レポートの `index.html` があるフォルダに移動して実行します。

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

`--prefix .` はインストール先をレポートフォルダに固定するための指定です。このテストは Playwright だけで実行でき、App Crash Lab 本体には依存しません。確認環境は macOS arm64、Node 22.16.0、Playwright 1.64.0 です。

## 検証範囲

- Chromium の 1120×760 の画面で、第1章クリア後の1回の再読込を確認しました。
- 比較するのは上記3点と 250 ms の安定確認です。他の章・モバイル・別ブラウザ・長期保存を保証するものではありません。
- 途中の解答や現在のステップは、このバージョンの保存対象ではありません。再読込で第1ステップに戻る動作を不具合として扱いません。
- TypeTrail のソース42ファイルは変更せずに検証しました。このリポジトリには作者のソースや画像を転載せず、独自のテスト設定と手順だけを置いています。
- 今後の UI・問題・保存形式の変更に応じて JSON を更新してください。初期値に書き換えて PASS にするのではなく、意図した保存仕様から期待値を決めます。

使い終えたら開発サーバーを Ctrl+C で停止します。
