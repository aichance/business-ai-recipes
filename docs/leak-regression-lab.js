/* Render recorded, sanitized operator evidence only. No credential form or live scan. */
(() => {
  const byId = (id) => document.getElementById(id);
  const titles = {secure:'正常な設定', 'rows-leak':'DBの許可を広げる', 'objects-leak':'ファイルの許可を広げる', 'public-leak':'バケットを公開する', 'deny-all':'DBを全員拒否', repaired:'修復後'};
  const descriptions = {secure:'持ち主は自分のデータを取得でき、別ユーザーと匿名には返りませんでした。指定した14の検査はPASSです。', 'rows-leak':'添付ファイルは保護されていますが、DBの行を別ユーザーと匿名が取得できました。', 'objects-leak':'DBはPASSでも、非公開バケットのファイルを別ユーザーと匿名が取得できました。公開URLの拒否だけでは足りません。', 'public-leak':'DBの6検査はすべてPASS。それでも公開バケットのファイルは別ユーザー・匿名・公開URLから取得できました。', 'deny-all':'DBを全員に拒否すると、持ち主も読めません。拒否を安全性の合格にせず、DBの6検査を判定不能にします。', repaired:'同じテスト契約で再実行。持ち主の読み取りを保ったまま、6つのファイル露出が解消しました。'};
  const actors = {owner:'持ち主',other:'別ユーザー',anonymous:'匿名','anonymous-public':'匿名'};
  const routes = {row:'DB / REST','authenticated-object':'Storage / authenticated','public-object':'Storage / public'};
  let evidence, mode='public-leak';
  function render() {
    if (!evidence) return;
    const run = evidence.runs.find((r) => r.mode===mode && r.ownership===byId('layout').value);
    if (!run || run.report.cases.length!==14) throw Error('Missing recorded case set');
    const report=run.report;
    byId('scenario-title').textContent=titles[mode];
    byId('verdict').textContent=report.status;
    byId('verdict').className='verdict status-'+report.status;
    byId('explanation').textContent=descriptions[mode];
    for (const [id,status] of [['pass','PASS'],['fail','FAIL'],['unknown','INCONCLUSIVE']]) byId(id).textContent=report.cases.filter((r)=>r.status===status).length;
    byId('version').textContent='v'+report.version+' / 14 CHECKS';
    byId('timestamp').textContent='実測日時 '+new Date(report.measured_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' JST · 同じ検査コード、設定のみ変更';
    byId('cases').replaceChildren(...report.cases.map((r)=>{
      const tr=document.createElement('tr');
      for (const value of [r.resource,actors[r.actor]??r.actor,routes[r.route]??r.route,r.http_status??'未観測',r.status]) {
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      tr.lastElementChild.className='status-'+r.status;
      return tr;
    }));
    document.querySelectorAll('[data-mode]').forEach((button)=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  }
  function fail() {
    evidence=null;byId('verdict').textContent='読み込めませんでした';byId('verdict').className='verdict status-INCONCLUSIVE';
    byId('explanation').textContent='実測JSONを取得できません。ページを再読み込みするか「全12実測のJSON」を開いてください。';
    byId('cases').replaceChildren();for (const id of ['pass','fail','unknown']) byId(id).textContent='—';
  }
  document.querySelectorAll('[data-mode]').forEach((button)=>button.addEventListener('click',()=>{mode=button.dataset.mode;try{render();}catch{fail();}}));
  byId('layout').addEventListener('change',()=>{try{render();}catch{fail();}});
  byId('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(byId('command').textContent);byId('copy').textContent='コピーしました';}catch{byId('copy').textContent='コードを選択してコピー';}});
  fetch('./leak-regression-lab-measurements.json').then((r)=>{if(!r.ok)throw Error('HTTP');return r.json();}).then((data)=>{
    if(data.evidence_kind!=='operator-synthetic-fixture-recording'||data.external_adoption!==false||data.runs?.length!==12)throw Error('Invalid evidence');
    evidence=data;render();
  }).catch(fail);
})();
