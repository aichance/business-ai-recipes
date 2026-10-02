# dots拡張 50案の優先順位（2026-10-02）

ユーザー直接指示の10/2〜10/4集中期間の候補。順位は編集仮説で、需要・スター予測ではない。A=初日に外部APIなしで最小経路可能、B=範囲/接続の追加検証が必要、C=継続イベント/運用基盤が先。略号: file=持込ファイル、global=sidebar、thread=会話panel、ctx=選択model context、form=入力form、mention=選択reference、event=継続通知（初版未実装）。列の拡張は企画要件で、実装済み一覧ではない。

上位3の共通原則は「選択→成果物export→同入力で再実行」。静的viewerだけなら不採用。初日はDots Studioという一つのportable MCP pluginに三つのviewをまとめて検証。1番は任意CSV2種×3条件の一致、2番は選択と根拠・次確認を持ち帰ること、3番は異なるrunの分岐と修復packを再計算できることを測る。LLMによる真偽判定・実dotログ自動収集・host接続を代替したことにはしない。

|順位|案|入力→成果|使う拡張|初日|
|---:|---|---|---|---|
|1|Scenario Lab|持込CSV＋条件変更→比較と再実行JSON|file/thread/ctx|A|
|2|Evidence-to-Action Canvas|主張・根拠選択→判断・不足・次の確認pack|file/thread/ctx|A|
|3|Run Lens / Repair Pack|失敗したrun→依存・停止点・再現pack|file/global/ctx|B|
|4|Living Brief Board|資料更新→変更箇所と未決質問付きbrief|global/event/ctx|B|
|5|Open Loop Closer|埋もれた未完了依頼→次成果物のboard|global/event|B|
|6|Proof Pack Builder|散在する検証→入力・before/after・手順pack|file/global|A|
|7|Feedback-to-Revision Desk|指摘→修正差分と未解決queue|file/thread|B|
|8|Request-to-Scoping Card|相談文→範囲・受入・逆質問card|form/ctx|A|
|9|Acceptance Matrix Maker|要件→操作・証拠のmatrix|file/form|A|
|10|Policy-to-Test Fixture|方針文→例外付き入力・期待fixture|file/form|A|
|11|Email Choice Board|背景→返信選択肢・不足情報・下書き|file/ctx|A|
|12|Calendar Prep Canvas|予定＋資料→pre-readと質問|global/event|B|
|13|Source FAQ Shelf|同じ質問→出典と更新必要回答|file/mention|A|
|14|Glossary Steward|用語揺れ→別名・原文例・採用判断|file/global|A|
|15|Question-to-Experiment Card|アイデア→入力・観測・撤退条件|form/ctx|A|
|16|Assumption Trial Board|暗黙の前提→反証・小テストboard|file/form|A|
|17|Recurring Input Workbench|毎週の同形式ファイル→追加・変更・失敗|file/event|B|
|18|Stale Artifact Repair|元資料更新→影響と修正版草案|file/event|B|
|19|Release Gate Canvas|散在するtest→根拠・未確認gate|file/global|B|
|20|Build Failure-to-Patch Brief|エラー→再現条件・候補・検証pack|file/thread|B|
|21|Config Preview Lab|設定変更→差分と戻せる設定例|file/form|A|
|22|Dependency Upgrade Packet|依存更新→互換表・確認順|file/ctx|B|
|23|Fixture Curator|重複テスト例→例外と期待のpack|file/form|A|
|24|Schema-to-Form Preview|schema→入力画面と検証sample|file/form|A|
|25|Data Quality Decision Card|欠損・重複→影響・選択肢・出力spec|file/form|A|
|26|Table-to-Review Form|要確認行→選択理由・判定・差分CSV|file/form|A|
|27|Survey Theme-to-Action|回答→引用付きテーマ・反証・実験|file/global|B|
|28|Image Inventory Board|自作素材→採用・保留・使用先|file/form|A|
|29|Asset Request Board|仕様変更→必要素材・依存・完了sample|file/event|B|
|30|Deck-to-Agenda|slides→目的別進行と未回答一覧|file/global|A|
|31|Proposal Option Simulator|提案条件→比較と採用理由|form/thread|A|
|32|Scope Calculator|係数表→範囲・工数・未確定card|file/form|A|
|33|Onboarding Path Maker|資料群→段階path・理解check・実習|file/global|B|
|34|SOP Branch Tester|手順書→例外分岐・不足入力|file/thread|A|
|35|FAQ-to-Interactive Guide|FAQ→ケース別手順とchecklist|file/form|A|
|36|Objection Practice Arena|FAQと事例→反論分岐と根拠|file/thread|A|
|37|Product Brief-to-Launch Kit|新機能→README片・QA・demo入力|file/global|A|
|38|Case Study Composer|実例→出典付きbefore/afterと制約|file/ctx|A|
|39|Change Evidence Pack|変更→目的・影響・検証・未観測|file/event|B|
|40|Recurring Release Notes|前回版→差分・検証・未確認notes|file/event|B|
|41|Research Watchboard|継続調査→新規source・反証・次調査|global/event|C|
|42|Skill Progress Board|練習結果→次課題・誤りpattern|file/global|A|
|43|Code Example Teaching Cards|コード→入力・期待と実行card|file/thread|B|
|44|Attachment-to-Reply Pack|添付→引用・回答候補・追加質問|file/mention|A|
|45|Pre-read Question Board|会議資料→論点・質問・確認箇所|file/form|A|
|46|Contradiction Resolver|資料の食い違い→差異・正本・解消note|file/ctx|B|
|47|Experiment Runbook Generator|成功条件→操作・観測・成果物手順|global/form|A|
|48|Output Contract Checker|出力揺れ→schema・sample・fixture|file/form|A|
|49|Portfolio Storyboard|複数成果→before/after・証拠・制約page|global/file|A|
|50|Follow-up Committer|判断→期限・確認依頼草案・証拠欄|thread/event|B|

公式根拠: [拡張機能](https://developers.openai.com/plugins/build/extensions)、[dotsの対応plugin](https://learn.chatgpt.com/docs/dots/computers-and-apps)。段階提供とhost capabilitiesを実際に検証する。MCP Eventsは別仕様で、今回のローカル初版は通知購読を実装しない。

実装状況: 初版は1〜3をローカルMCP Appとして実装。4〜50は未実装の企画。実際のdots内の連携は未検証です。
