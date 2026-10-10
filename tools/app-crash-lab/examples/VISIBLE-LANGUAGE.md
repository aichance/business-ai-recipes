# テストは PASS。でも画面は違う言語だった

保存値と DOM の文字列が一致しても、画面に見えている言語が正しいとは限りません。
**公開版 App Crash Lab 0.3.0 で、同じ合成故障を「見逃す設定」と「検出する設定」を比べられる実行例です。**

## 実測結果 — 2026-10-11

| 設定 | アプリ側の状態 | CLI / 出力された Playwright |
| --- | --- | --- |
| `language-naive.json` | 再読込すると表示だけ日本語へ戻る | PASS / 1 passed（取りこぼし） |
| `language-normal.json` | 英語表示も正しく復元する | PASS / 1 passed |
| `language-display-loss.json` | 1行目と同じ表示故障 | FAIL / 1 failed（意図した検出） |

故障ケースでも保存値は `en`、HTML の言語状態マーカーも `en` のままです。
見出しの `textContent` も `保存しましたSaved` のまま変わりません。
日本語と英語の両方が DOM にあり、CSS が片方を隠しているからです。

強い設定では、これらに加えて**見えている葉要素の数**を観測します。故障時の差分は次の2点です。

```text
visibleEnglish:  1 → 0
visibleJapanese: 0 → 1
```

保存内容や宣言上の状態だけを見ると検出できなかった、表示の取りこぼしです。
これは意図的に作った合成故障であり、特定の公開サービスの不具合報告ではありません。

## 自分で再現する

[実行例 ZIP をダウンロード](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-visible-language-example.zip)して展開します。中身はこの説明、`language.html`、3つの JSON の計5ファイルです。現在のリポジトリの `examples/` にも同じファイルがあります。元の 0.3.0 ソースアーカイブには、この後から追加した例は入っていません。

Node 22 以上、npm、Python 3 が必要です。展開した `visible-language` フォルダでサーバーを起動し、そのターミナルは開いたままにします。

```sh
python3 -m http.server 49726 --bind 127.0.0.1
```

別ターミナルで同じフォルダに移動し、Chromium を準備します。初回のダウンロードにはインターネット接続が必要です。

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
```

3つの設定を順に実行します。最後のコマンドは、故障を検出して終了コード `1` を返すことが期待結果です。

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-naive.json --out report-naive
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-normal.json --out report-normal
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-display-loss.json --out report-display-loss
```

各レポートの `index.html` で前後の値、スクリーンショット、差分を確認できます。再実行する場合は `--out` に新しいフォルダ名を指定してください。

## この設定が違うところ

現行の `source: "text"` は正確な `textContent` を読みます。親要素の CSS を `h1:visible` に変えるだけでは、隠れた子の文字を除外できません。今回は言語ごとの葉要素に対象を絞り、次を `observe` に加えました。

```json
{
  "visibleEnglish": {
    "source": "count",
    "target": { "css": "#message [data-copy=\"en\"]:visible" }
  },
  "visibleJapanese": {
    "source": "count",
    "target": { "css": "#message [data-copy=\"ja\"]:visible" }
  }
}
```

`expected` はそれぞれ `1` と `0` です。故障で英語要素が消えても、count は `0` を返すため差分として検出できます。
実際のアプリに移す際は、対象セレクタと期待値をそのアプリの仕様から決めてください。ページの版を示すタブと、保存した言語で変わるメニューは別の意味を持つ場合があります。

## Playwright だけで再実行する

サーバーを動かしたまま、いずれかのレポートフォルダへ移動して実行します。

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

`--prefix .` はインストール先を現在のレポートフォルダに固定します。出力されたテストは App Crash Lab 本体や LLM に依存しません。上の3ケースで、単独実行も同じ PASS / PASS / FAIL を確認しました（macOS arm64、Node 22.16.0、Playwright 1.64.0）。終わったらサーバーを Ctrl+C で停止します。

## きっかけと範囲

こどもニュースの作者による[英語モードの設計記事](https://qiita.com/kodomo-news/items/595f916fef0434f205e0)の、非表示の翻訳も `textContent` に含まれるという説明をきっかけに作りました。公開サイトでは英語設定が再読込後も保持され、日本語ページの現在地タブは日本語を示す動作を、私たちのブラウザ操作で確認しました。

ここにある HTML と設定は独自に作った合成例です。作者のソースは使っておらず、実サービスを App Crash Lab で検査した、作者が導入した、という意味ではありません。検査するのは今回の CSS による表示切替と選択した値だけです。画面全体の描画品質、重なり、読み上げ品質、他ブラウザの動作までを保証するものではありません。
