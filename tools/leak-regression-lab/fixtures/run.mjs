#!/usr/bin/env node
// This is fixture setup, not the read-only checker. Only a new loopback Supabase stack is allowed.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {spawnSync, spawn} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID, randomBytes, createHash} from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const {values} = parseArgs({options: {status: {type: 'string'}, out: {type: 'string'}, 'existing-fixture': {type: 'string'}}});
if (!values.status || !values.out) throw new Error('Usage: node fixtures/run.mjs --status PRIVATE_LOCAL_STATUS_JSON --out NEW_DIR');
const s = JSON.parse(await readFile(resolve(values.status), 'utf8'));
const api = new URL(s.API_URL); const db = new URL(s.DB_URL);
if (api.origin !== 'http://127.0.0.1:56521' || db.hostname !== '127.0.0.1' || db.port !== '56522') throw new Error('Fixture accepts only the documented new loopback stack');
const out = resolve(values.out); await mkdir(out, {mode: 0o700});
const fixtureDir = values['existing-fixture'] ? resolve(values['existing-fixture']) : out;
const pgEnv = {...process.env, PGHOST: db.hostname, PGPORT: db.port, PGUSER: decodeURIComponent(db.username),
  PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: db.pathname.slice(1)};
const sql = (text) => {
  const p = spawnSync('psql', ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-q'], {env: pgEnv, input: text, encoding: 'utf8', timeout: 15000});
  if (p.status !== 0) throw new Error('Owned fixture SQL failed; details kept local, not published');
};
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (v) => createHash('sha256').update(v).digest('hex');
if (!values['existing-fixture']) {
sql(await readFile(resolve(here, 'schema.sql'), 'utf8'));
const users = {}; const password = randomBytes(24).toString('base64url'); const suffix = randomBytes(5).toString('hex');
for (const who of ['a', 'b']) {
  const email = `leak-lab-${who}-${suffix}@example.test`;
  const response = await fetch(new URL('/auth/v1/admin/users', api), {method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: {apikey: s.SERVICE_ROLE_KEY, Authorization: `Bearer ${s.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({email, password, email_confirm: true})});
  const data = await response.json();
  if (response.status !== 200 && response.status !== 201) throw new Error('Synthetic user creation failed');
  if (!data.id) throw new Error('Synthetic user id missing');
  users[who] = {id: data.id, email, team: randomUUID(), note: randomUUID(), teamNote: randomUUID()};
}
let seed = 'begin;\n';
for (const [who, u] of Object.entries(users)) {
  seed += `insert into public.leak_lab_notes values (${lit(u.note)},${lit(u.id)},${lit(`LEAK_LAB_ONLY_NOTE_${who}_${suffix}`)});\n`;
  seed += `insert into public.leak_lab_members values (${lit(u.team)},${lit(u.id)});\n`;
  seed += `insert into public.leak_lab_team_notes values (${lit(u.teamNote)},${lit(u.team)},${lit(`LEAK_LAB_ONLY_TEAM_${who}_${suffix}`)});\n`;
}
seed += 'commit;'; sql(seed);
for (const kind of ['owner', 'team']) for (const [who, u] of Object.entries(users)) {
  const path = `${kind === 'owner' ? u.id : u.team}/private.txt`;
  const body = `LEAK_LAB_ONLY_FILE_${kind}_${who}_${suffix}`;
  const response = await fetch(new URL(`/storage/v1/object/leak-lab-${kind}/${path}`, api), {method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: {apikey: s.SERVICE_ROLE_KEY, Authorization: `Bearer ${s.SERVICE_ROLE_KEY}`, 'Content-Type': 'text/plain'}, body});
  if (response.status !== 200) throw new Error('Synthetic object upload failed');
}
const common = {schema_version: 1, environment: 'test', origin: api.origin, public_key_env: 'LEAK_LAB_PUBLIC_KEY',
  actors: {a: {email_env: 'LEAK_LAB_A_EMAIL', password_env: 'LEAK_LAB_A_PASSWORD'}, b: {email_env: 'LEAK_LAB_B_EMAIL', password_env: 'LEAK_LAB_B_PASSWORD'}}};
const envText = `LEAK_LAB_PUBLIC_KEY=${s.ANON_KEY}\nLEAK_LAB_A_EMAIL=${users.a.email}\nLEAK_LAB_A_PASSWORD=${password}\nLEAK_LAB_B_EMAIL=${users.b.email}\nLEAK_LAB_B_PASSWORD=${password}\n`;
await writeFile(resolve(out, '.env.fixture'), envText, {flag: 'wx', mode: 0o600});
for (const kind of ['owner', 'team']) {
  const config = {...common,
    rows: Object.entries(users).map(([who, u]) => ({id: `note-${who}`, table: kind === 'owner' ? 'leak_lab_notes' : 'leak_lab_team_notes', id_column: 'id',
      record_id: kind === 'owner' ? u.note : u.teamNote, owner: who,
      expect: {body: `LEAK_LAB_ONLY_${kind === 'owner' ? 'NOTE' : 'TEAM'}_${who}_${suffix}`}})),
    objects: Object.entries(users).map(([who, u]) => ({id: `attachment-${who}`, bucket: `leak-lab-${kind}`,
      path: `${kind === 'owner' ? u.id : u.team}/private.txt`, owner: who,
      sha256: hash(`LEAK_LAB_ONLY_FILE_${kind}_${who}_${suffix}`)}))};
  await writeFile(resolve(out, `${kind}.json`), JSON.stringify(config, null, 2), {flag: 'wx', mode: 0o600});
}
}
const secure = `
create policy leak_lab_notes_own on public.leak_lab_notes for select to authenticated using(owner_id=auth.uid());
create policy leak_lab_team_notes_own on public.leak_lab_team_notes for select to authenticated using(exists(select 1 from public.leak_lab_members m where m.team_id=leak_lab_team_notes.team_id and m.user_id=auth.uid()));
create policy leak_lab_objects_own on storage.objects for select to authenticated using(
 (bucket_id='leak-lab-owner' and (storage.foldername(name))[1]=auth.uid()::text)
 or (bucket_id='leak-lab-team' and exists(select 1 from public.leak_lab_members m where m.team_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid())));`;
const results = [];
for (const mode of ['secure', 'rows-leak', 'objects-leak', 'public-leak', 'deny-all', 'repaired']) {
  sql(`begin;drop policy leak_lab_notes_own on public.leak_lab_notes;drop policy leak_lab_team_notes_own on public.leak_lab_team_notes;drop policy leak_lab_objects_own on storage.objects;
    drop policy if exists leak_lab_rows_open on public.leak_lab_notes;drop policy if exists leak_lab_team_open on public.leak_lab_team_notes;
    drop policy if exists leak_lab_objects_open on storage.objects;
    update storage.buckets set public=${mode === 'public-leak' ? 'true' : 'false'} where id in('leak-lab-owner','leak-lab-team');
    ${secure}
    ${mode === 'rows-leak' ? 'create policy leak_lab_rows_open on public.leak_lab_notes for select to public using(true);create policy leak_lab_team_open on public.leak_lab_team_notes for select to public using(true);' : ''}
    ${mode === 'objects-leak' ? "create policy leak_lab_objects_open on storage.objects for select to public using(bucket_id in('leak-lab-owner','leak-lab-team'));" : ''}
    ${mode === 'deny-all' ? 'drop policy leak_lab_notes_own on public.leak_lab_notes;create policy leak_lab_notes_own on public.leak_lab_notes for select to authenticated using(false);drop policy leak_lab_team_notes_own on public.leak_lab_team_notes;create policy leak_lab_team_notes_own on public.leak_lab_team_notes for select to authenticated using(false);' : ''}
    commit;`);
  for (const kind of ['owner', 'team']) {
    const dest = resolve(out, `${mode}-${kind}`);
    const args = [`--env-file=${resolve(fixtureDir, '.env.fixture')}`, resolve(root, 'cli.mjs'), 'check', '--config', resolve(fixtureDir, `${kind}.json`), '--out', dest, '--live'];
    const result = await new Promise((res, rej) => {
      const p = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'pipe']}); let text = '';
      p.stdout.on('data', (v) => { text += v; }); p.stderr.resume(); p.once('error', rej); p.once('close', (exit) => res({exit, text}));
    });
    const report = JSON.parse(await readFile(resolve(dest, 'report.json'), 'utf8'));
    const expected = ['secure', 'repaired'].includes(mode) ? 'PASS' : mode === 'deny-all' ? 'INCONCLUSIVE' : 'FAIL';
    results.push({mode, ownership: kind, exit: result.exit, status: report.status, expected, counts: report.counts, coverage_complete: report.coverage_complete});
    await writeFile(resolve(out, 'measurements.json'), JSON.stringify({operator_synthetic_not_external_adoption: true, real_supabase_rest: true, results}, null, 2));
    if (report.status !== expected) throw new Error(`Fixture ${mode}/${kind}: expected ${expected}, got ${report.status}`);
  }
}
console.log(JSON.stringify({operator_synthetic_not_external_adoption: true, real_supabase_rest: true, results}, null, 2));
