import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig, credentials, sha256, contractFingerprint} from '../lib/config.mjs';
import {inspect, compare} from '../lib/probe.mjs';
import {html} from '../lib/report.mjs';

// Deliberately unsigned synthetic tokens. Only this scripted transport accepts
// them; the real Supabase integration must reject a modified signature.
const jwt = (payload) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture-signature`;
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
const claims = (who, extra = {}) => ({role: 'authenticated', sub: `user-${who}`, exp: Math.floor(Date.now() / 1000) + 600, ...extra});
function setup({mode = 'secure', sameUser = false, anonymousA = false, authStatus = 200, userOverride} = {}) {
  const env = {PUBLIC: 'sb_publishable_synthetic-local-only',
    A_TOKEN: jwt(claims('a', {is_anonymous: anonymousA, ...(sameUser ? {sub: 'same-user'} : {})})),
    B_TOKEN: jwt(claims('b', sameUser ? {sub: 'same-user'} : {})),
    A_EMAIL: 'fixture-a@example.invalid', A_PASSWORD: 'synthetic-password-a',
    B_EMAIL: 'fixture-b@example.invalid', B_PASSWORD: 'synthetic-password-b'};
  const input = {schema_version: 1, environment: 'test', origin: 'https://test-project.example', public_key_env: 'PUBLIC',
    actors: {a: {access_token_env: 'A_TOKEN'}, b: {access_token_env: 'B_TOKEN'}},
    rows: ['a', 'b'].map((who) => ({id: `note-${who}`, table: 'notes', id_column: 'id', record_id: `row-${who}`, owner: who, expect: {body: `private-note-${who}`}})),
    objects: ['a', 'b'].map((who) => ({id: `photo-${who}`, bucket: 'private-files', path: `${who}/private.txt`, owner: who, sha256: sha256(`private-file-${who}`)}))};
  const calls = [];
  const fetchImpl = async (url, options) => {
    const u = new URL(url); calls.push({url: String(url), ...options});
    const who = ['a', 'b'].find((id) => options.headers.Authorization === `Bearer ${env[id.toUpperCase() + '_TOKEN']}`);
    if (u.pathname === '/auth/v1/user') {
      if (authStatus !== 200 || !who) return json({error: 'synthetic rejected user session'}, authStatus === 200 ? 401 : authStatus);
      return json(userOverride ?? {id: sameUser ? 'same-user' : `user-${who}`, role: 'authenticated', is_anonymous: who === 'a' && anonymousA});
    }
    if (u.pathname === '/auth/v1/token') {
      const id = JSON.parse(options.body).email === env.A_EMAIL ? 'a' : 'b';
      return json({access_token: env[id.toUpperCase() + '_TOKEN'], user: {id: `user-${id}`, role: 'authenticated'}});
    }
    assert.equal(options.method, 'GET');
    if (u.pathname.startsWith('/rest/v1/')) {
      const owner = u.searchParams.get('id') === 'eq.row-a' ? 'a' : 'b';
      return json(who === owner ? [{id: `row-${owner}`, body: `private-note-${owner}`}] : []);
    }
    const owner = u.pathname.includes('/a/') ? 'a' : 'b';
    const publicRoute = u.pathname.includes('/public/');
    if ((!publicRoute && who === owner) || mode === 'public-leak') return new Response(`private-file-${owner}`);
    return json({statusCode: '404', error: 'not_found'}, 400);
  };
  return {env, input, calls, fetchImpl};
}

test('existing user JWTs verify against Auth then run the same14 controls using only GETs', async () => {
  const s = setup(); const c = validateConfig(s.input); const r = await inspect(c, s.env, s);
  assert.equal(r.status, 'PASS'); assert.equal(r.authentication, 'TWO_DISTINCT_NORMAL_USERS');
  assert.deepEqual(r.counts, {PASS: 14, FAIL: 0, INCONCLUSIVE: 0});
  assert.equal(s.calls.length, 16); assert.ok(s.calls.every((x) => x.method === 'GET' && !x.body));
  assert.equal(s.calls.filter((x) => new URL(x.url).pathname === '/auth/v1/user').length, 2);
  assert.ok(s.calls.every((x) => x.headers.apikey === s.env.PUBLIC && x.redirect === 'error'));
  assert.ok(s.calls.every((x) => x.headers.Authorization !== `Bearer ${s.env.PUBLIC}`));
  const text = JSON.stringify(r) + html(r);
  for (const value of [...Object.values(s.env), 'user-a', 'private-note-a', 'a/private.txt', 'test-project.example']) assert.equal(text.includes(value), false);
});

test('an authenticated anonymous-sign-in user is distinct from the JWT-free anon probes', async () => {
  const s = setup({anonymousA: true}); const r = await inspect(validateConfig(s.input), s.env, s);
  assert.equal(r.status, 'PASS');
  const userA = s.calls.filter((x) => x.headers.Authorization === `Bearer ${s.env.A_TOKEN}`);
  assert.ok(userA.some((x) => new URL(x.url).pathname === '/auth/v1/user'));
  const anon = s.calls.filter((x) => !x.headers.Authorization);
  assert.equal(anon.length, 6); assert.ok(anon.every((x) => !x.url.includes('/auth/')));
});

test('one existing session and one password account are supported without sending token in login body', async () => {
  const s = setup(); s.input.actors.b = {email_env: 'B_EMAIL', password_env: 'B_PASSWORD'};
  const r = await inspect(validateConfig(s.input), s.env, s); assert.equal(r.status, 'PASS');
  const posts = s.calls.filter((x) => x.method === 'POST'); assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].body), {email: s.env.B_EMAIL, password: s.env.B_PASSWORD});
  assert.equal(s.calls.filter((x) => x.url.endsWith('/auth/v1/user')).length, 1);
});

test('each actor selects exactly one environment-referenced authentication method', () => {
  const s = setup();
  for (const actor of [{}, {email_env: 'A_EMAIL'}, {access_token_env: 'TOKEN', password_env: 'A_PASSWORD'},
    {access_token_env: 'TOKEN', email_env: 'A_EMAIL'}, {access_token_env: 'actual.jwt.value'}, {access_token_env: null}]) {
    assert.throws(() => validateConfig({...s.input, actors: {...s.input.actors, a: actor}}), {code: 'ONE_ACTOR_AUTH_METHOD_REQUIRED'});
  }
  const c = validateConfig(s.input); assert.throws(() => credentials(c, {...s.env, A_TOKEN: ''}), {code: 'MISSING_ENV'});
  const withUnknown = validateConfig({...s.input, actors: {...s.input.actors, a: {...s.input.actors.a, unused: 'not copied'}}});
  assert.deepEqual(withUnknown.actors.a, {access_token_env: 'A_TOKEN'});
});

test('privileged, anon-key, malformed and expired session inputs never reach the network or become PASS', async () => {
  const invalid = ['sb_secret_synthetic', 'sb_publishable_synthetic', 'not-a-jwt', jwt(claims('a', {role: 'service_role'})),
    jwt(claims('a', {role: 'anon'})), jwt(claims('a', {exp: 1})), jwt(claims('a', {exp: undefined})),
    jwt(claims('a', {exp: '9999999999'})), jwt(claims('a', {nbf: Math.floor(Date.now() / 1000) + 300})),
    jwt(claims('a', {sub: ''})), jwt(claims('a')) + '\r\nnot-a-header'];
  for (const token of invalid) {
    const s = setup(); const r = await inspect(validateConfig(s.input), {...s.env, A_TOKEN: token}, s);
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.authentication, 'INCONCLUSIVE');
    assert.equal(r.cases.length, 0); assert.equal(s.calls.length, 0);
    assert.equal(JSON.stringify(r).includes(token), false);
  }
});

test('server rejection, malformed user, role and subject mismatch cannot reach resource probes', async () => {
  for (const options of [{authStatus: 401}, {authStatus: 403}, {authStatus: 503}, {userOverride: {}},
    {userOverride: {id: 'different-user', role: 'authenticated'}}, {userOverride: {id: 'user-a', role: 'service_role'}},
    {userOverride: {id: 'user-a'}}, {userOverride: {id: 'user-a', role: null}}]) {
    const s = setup(options); const r = await inspect(validateConfig(s.input), s.env, s);
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.cases.length, 0);
    assert.equal(s.calls.length, 1); assert.ok(s.calls[0].url.endsWith('/auth/v1/user'));
  }
  const s = setup(); const r = await inspect(validateConfig(s.input), s.env, {fetchImpl: async () => { throw new Error('synthetic private server diagnosis'); }});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.reason, 'AUTH_FAILED'); assert.equal(r.cases.length, 0);
  assert.equal(JSON.stringify(r).includes('private server diagnosis'), false);
});

test('two valid session tokens for the same authenticated user do not form an isolation check', async () => {
  const s = setup({sameUser: true}); assert.notEqual(s.env.A_TOKEN, s.env.B_TOKEN);
  const r = await inspect(validateConfig(s.input), s.env, s);
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.reason, 'DISTINCT_USERS_REQUIRED');
  assert.equal(r.cases.length, 0); assert.equal(s.calls.length, 2);
});

test('authentication input may change while the same resource contract still detects regressions and repairs', async () => {
  const before = setup(); before.input.actors = {a: {email_env: 'A_EMAIL', password_env: 'A_PASSWORD'}, b: {email_env: 'B_EMAIL', password_env: 'B_PASSWORD'}};
  const after = setup({mode: 'public-leak'}); const repaired = setup();
  const c1 = validateConfig(before.input); const c2 = validateConfig(after.input);
  assert.equal(contractFingerprint(c1), contractFingerprint(c2));
  const a = await inspect(c1, before.env, before); const b = await inspect(c2, after.env, after);
  const c = await inspect(validateConfig(repaired.input), repaired.env, repaired);
  assert.equal(a.status, 'PASS'); assert.equal(b.status, 'FAIL'); assert.equal(c.status, 'PASS');
  assert.equal(compare(a, b).regressions.length, 6); assert.equal(compare(b, c).resolved.length, 6);
});
