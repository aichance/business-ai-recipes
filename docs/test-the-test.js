const japanese = document.documentElement.lang === 'ja';
const text = (english, translated) => japanese ? translated : english;
const frame = document.querySelector('#fixture');
const runButton = document.querySelector('#run');
const modeSelect = document.querySelector('#mode');
const includeText = document.querySelector('#include-text');
const status = document.querySelector('#status');
const explanation = document.querySelector('#explanation');
const table = document.querySelector('#values');
const storageKey = 'example-single-language';
const names = {
  storedLanguage: text('Stored language', '保存された言語'), declaredLanguage: text('Declared language', 'ページが示す言語'),
  visibleEnglish: text('Visible elements labelled en', 'enラベルの表示要素数'), visibleJapanese: text('Visible elements labelled ja', 'jaラベルの表示要素数'),
  displayedLeafText: text('Actual message text', '実際のメッセージ本文')
};
const expected = {storedLanguage:'en', declaredLanguage:'en', visibleEnglish:1, visibleJapanese:0, displayedLeafText:'Saved'};
let latest = null;

function readState() {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  const leaf = doc?.querySelector('#message');
  if (!leaf || leaf.children.length) throw new Error(text('The expected single-text fixture is missing.', '検査対象の単一テキスト要素が見つかりません。'));
  const style = win.getComputedStyle(leaf);
  const rect = leaf.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0 && !['hidden','collapse'].includes(style.visibility);
  return {
    storedLanguage: win.localStorage.getItem(storageKey),
    declaredLanguage: doc.documentElement.dataset.uiLanguage,
    visibleEnglish: Number(visible && leaf.dataset.copy === 'en'),
    visibleJapanese: Number(visible && leaf.dataset.copy === 'ja'),
    displayedLeafText: leaf.textContent
  };
}

function navigateFixture(action) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(text('The fixture did not load within 5 seconds.', '検査用ページを5秒以内に読み込めませんでした。'))), 5000);
    const onLoad = () => finish();
    function finish(error) {
      clearTimeout(timeout);
      frame.removeEventListener('load', onLoad);
      error ? reject(error) : resolve();
    }
    frame.addEventListener('load', onLoad);
    try { action(); } catch (error) { finish(error); }
  });
}

function showResult() {
  if (!latest) return;
  const keys = Object.keys(expected).filter(key => includeText.checked || key !== 'displayedLeafText');
  const differences = keys.filter(key => latest.after[key] !== latest.before[key]);
  document.querySelector('#before').textContent = text(`Recorded ${latest.mode === 'normal' ? 'normal' : 'broken'} run: before reload, Saved · language en · labelled en 1 / ja 0`, `記録した${latest.mode === 'normal' ? '正常系' : '故障例'}：再読込前は Saved・言語 en・表示要素 en 1 / ja 0`);
  const missed = !differences.length && latest.after.displayedLeafText !== latest.before.displayedLeafText;
  status.dataset.result = differences.length ? 'caught' : missed ? 'missed' : 'pass';
  status.textContent = differences.length ? text('FAIL · caught the text change', 'FAIL · 本文の変化を検出') : missed ? text('PASS · but the UI is wrong', 'PASS · でも画面は壊れている') : text('PASS · the selected values survived', 'PASS · 選んだ値は保持された');
  explanation.textContent = differences.length
    ? text('The text observation catches Saved → 保存しました. The stored language, marker and counts still match.', '本文の検査で Saved → 保存しました の変化を検出。保存された言語・ラベル・要素数は同じままです。')
    : missed ? text('The check did not observe the changed text. Add the checkbox above to detect it from the same run.', 'この検査は変化した本文を見ていません。上のチェックを追加すると、同じ実行で記録した値から検出できます。')
    : text('This is the normal control. Its recorded values remain the same after reload.', 'これは正常系との比較です。再読込後も記録した値が保たれています。');
  table.replaceChildren();
  for (const [key, label] of Object.entries(names)) {
    const row = document.createElement('tr');
    const included = keys.includes(key);
    row.dataset.included = String(included);
    for (const value of [label, latest.before[key], latest.after[key], included ? text('Yes', '含める') : text('No — not checked', '含めない')]) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    table.append(row);
  }
}

includeText.addEventListener('change', showResult);
modeSelect.addEventListener('change', () => {
  if (latest) explanation.textContent = text('Behavior changed. Run again to collect this mode; the table still shows the previous run.', '動作の選択を変更しました。再実行すると新しい結果を記録します。今の表は前回の実行結果です。');
});
runButton.addEventListener('click', async () => {
  latest = null;
  runButton.disabled = modeSelect.disabled = includeText.disabled = true;
  status.dataset.result = '';
  status.textContent = text('Saving English, then reloading the fixture…', '英語を保存し、検査用ページを再読込しています…');
  explanation.textContent = text('Collecting actual before/after values.', '実際の再読込前後の値を記録しています。');
  table.replaceChildren();
  document.querySelector('#before').textContent = text('Before reload: not recorded', '再読込前：まだ記録していません');
  let previous, restoreNeeded = false, result, failure;
  const selectedMode = modeSelect.value;
  try {
    previous = localStorage.getItem(storageKey);
    restoreNeeded = true;
    localStorage.removeItem(storageKey);
    const url = new URL('app-crash-lab-language-single.html', location.href);
    url.searchParams.set('mode', selectedMode);
    document.querySelector('#frame-wrap').hidden = false;
    await navigateFixture(() => { frame.src = url.href; });
    const save = frame.contentDocument.querySelector('#english');
    if (!save) throw new Error(text('The fixture save button is missing.', '検査用ページの保存ボタンが見つかりません。'));
    save.click();
    const before = readState();
    if (Object.keys(expected).some(key => before[key] !== expected[key])) throw new Error(text('The saved-English baseline was not confirmed.', '基準となる英語の保存状態を確認できませんでした。'));
    document.querySelector('#before').textContent = text('Recorded before reload: Saved · language en · labelled en 1 / ja 0', '再読込前の記録：Saved・言語 en・表示要素 en 1 / ja 0');
    await navigateFixture(() => frame.contentWindow.location.reload());
    result = {mode:selectedMode, before, after:readState()};
  } catch (error) {
    failure = error;
  } finally {
    if (restoreNeeded) {
      try { previous === null ? localStorage.removeItem(storageKey) : localStorage.setItem(storageKey, previous); }
      catch (error) { failure = new Error(text('The fixture storage value could not be restored.', '検査用の保存値を実行前の状態へ戻せませんでした。')); }
    }
    runButton.disabled = modeSelect.disabled = includeText.disabled = false;
  }
  if (failure) {
    status.dataset.result = 'error';
    status.textContent = text('ERROR · no test verdict', 'ERROR · 判定できません');
    explanation.textContent = failure.message || text('The fixture could not be checked.', '検査用ページを確認できませんでした。');
    return;
  }
  latest = result;
  showResult();
});
