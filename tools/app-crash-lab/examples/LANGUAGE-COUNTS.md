# Visible counts can pass while the text is wrong

[日本語](#日本語要素数と本文は別の観測)

The [two-span example](https://github.com/aichance/business-ai-recipes/blob/main/tools/app-crash-lab/examples/VISIBLE-LANGUAGE.md) detects a `display: none` language
switch. Counting language-labelled elements is not a general translation check.
This second, independently written synthetic fixture has **one text node**.
After reload, its `data-copy="en"` marker and visibility remain unchanged while
its text deliberately changes from `Saved` to `保存しました`.

| Contract | Behavior | Published 0.3.0 CLI | Exported Playwright test |
| --- | --- | --- | --- |
| `language-single-count-only.json` | Deliberately wrong text | PASS: misses it | 1 passed |
| `language-single-normal.json` | Correct text | PASS | 1 passed |
| `language-single-text-loss.json` | Same wrong text as first row | FAIL: catches it | 1 failed |

The stronger contract retains the counts and adds an exact text observation:

```json
{
  "displayedLeafText": {
    "source": "text",
    "target": { "css": "#message:visible" }
  }
}
```

Its expected value is `Saved`. App Crash Lab 0.3.0's `source: "text"` reads
`textContent`, not `innerText`. This fixture's heading has one text node and no
hidden descendants; a parent containing hidden translations needs a different
observation. The failing report changes only `displayedLeafText`; the stored
language, declared marker and both counts still match.

## Run it

Use Node 22+, npm and Python 3. [Download this comparison ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-single-text-example.zip)
and enter the extracted `single-text-language` folder. Alternatively, in a current
checkout enter `tools/app-crash-lab/examples`. These four `language-single*` files
were added after the original release and are **not in the earlier five-file
visible-language example ZIP**.
Start a local server and leave this terminal open:

```sh
python3 -m http.server 49734 --bind 127.0.0.1
```

In another terminal in that same examples folder:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-single-count-only.json --out report-single-count
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-single-normal.json --out report-single-normal
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run language-single-text-loss.json --out report-single-loss
```

The last command intentionally exits `1`. Open each report's `index.html` to
compare the values and screenshots. Use a new `--out` folder for a repeat run.
While the server is running, enter any report folder to rerun its unedited test:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

All six outcomes above were verified on 2026-10-11, macOS arm64, Node 22.16.0,
Playwright 1.64.0. Initial downloads need an internet connection. Stop the server
with Ctrl+C when finished.

## Visibility is only one boundary

Playwright's [visibility definition](https://playwright.dev/docs/actionability#visible)
considers an element's box and `visibility`; an element with `opacity: 0` still
counts as visible. [ARIA `aria-hidden`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden)
controls exposure to the accessibility tree, not visual hiding. This text-node
example tests neither opacity/occlusion nor screen-reader behavior. Choose
observations for the actual DOM and the requirement being tested.

Thanks to [Florian's feedback on the original article](https://qiita.com/aichance/items/bf9ba7667a260879acc2#comment-d7c5a893cfa3800906f1)
for prompting this explicit counterexample. This is our own seeded fault, not a
bug claim about someone else's app or an additional third-party adoption report.

## 日本語：要素数と本文は別の観測

前の例は、日本語と英語の2つの子要素を `display: none` で切り替えていました。
今回の追加例は、1つの見出しの文字を書き換える実装です。再読込後に本文だけ
`Saved` から `保存しました` へ壊し、`data-copy="en"` と可視要素数は変えません。

数だけの設定は PASS し、本文の完全一致も確認する設定は同じ故障で FAIL しました。
正常な実装は PASS します。3つとも、公開版CLIとその出力テストの単独実行で
同じ結果を確認しています。本文観測は `textContent` なので、今回のように隠れた
子要素を含まない単一テキストの対象を選んでください。

[追加例専用のZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-single-text-example.zip)を展開した
`single-text-language` フォルダ、または現在のリポジトリの
`tools/app-crash-lab/examples` で上の手順を実行できます。
この追加例は従来の5ファイルZIPには含めていません。最後の FAIL と終了コード1は
意図した故障の検出です。レポートごとの `index.html` に差分が残ります。

要素が可視と判定されること、本文が期待通りであること、アクセシビリティツリーに
公開されることは別々です。`aria-hidden` だけでは画面から消えず、`opacity: 0` も
Playwrightでは可視に数えられます。今回の本文比較から、ピクセル表示や読み上げまで
正常だとは判断できません。元記事への具体的な指摘を受け、この限界を実行例にしました。
