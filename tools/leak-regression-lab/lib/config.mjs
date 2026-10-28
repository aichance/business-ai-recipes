import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';

export class CheckError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const need = (yes, code = 'INVALID_CONFIG') => { if (!yes) throw new CheckError(code); };
const envName = (s) => typeof s === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(s);
const identifier = (s) => typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(s);
const simpleID = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(s);
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const equal = isDeepStrictEqual;
export const ROW_PROJECTION = 'declared-id-and-expected-fields';

export function validateConfig(input) {
  need(plain(input) && input.schema_version === 1 && input.environment === 'test');
  let origin;
  try { origin = new URL(input.origin); } catch { throw new CheckError('INVALID_ORIGIN'); }
  need(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === '/', 'INVALID_ORIGIN');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  need(origin.protocol === 'https:' || (origin.protocol === 'http:' && local), 'HTTPS_OR_LOOPBACK_REQUIRED');
  need(origin.hostname !== '169.254.169.254', 'INVALID_ORIGIN');
  need(envName(input.public_key_env) && plain(input.actors));
  need(equal(Object.keys(input.actors).sort(), ['a', 'b']));
  const actors = {};
  for (const who of ['a', 'b']) {
    const a = input.actors[who];
    need(plain(a));
    if (Object.hasOwn(a, 'access_token_env')) {
      need(envName(a.access_token_env) && !Object.hasOwn(a, 'email_env') && !Object.hasOwn(a, 'password_env'), 'ONE_ACTOR_AUTH_METHOD_REQUIRED');
      actors[who] = {access_token_env: a.access_token_env};
    } else {
      need(envName(a.email_env) && envName(a.password_env), 'ONE_ACTOR_AUTH_METHOD_REQUIRED');
      actors[who] = {email_env: a.email_env, password_env: a.password_env};
    }
  }
  const seen = new Set();
  for (const group of ['rows', 'objects']) {
    need(Array.isArray(input[group]) && input[group].length >= 2 && input[group].length <= 20);
    need(['a', 'b'].every((who) => input[group].some((r) => r.owner === who)));
    for (const r of input[group]) {
      need(plain(r) && simpleID(r.id) && !seen.has(r.id)); seen.add(r.id);
      need(['a', 'b'].includes(r.owner));
      if (group === 'rows') {
        need(identifier(r.table) && identifier(r.id_column));
        need(typeof r.record_id === 'string' && r.record_id.length > 0 && r.record_id.length <= 200);
        need(plain(r.expect) && Object.keys(r.expect).length > 0);
        need(Object.keys(r.expect).every(identifier));
      } else {
        need(typeof r.bucket === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(r.bucket));
        need(typeof r.path === 'string' && r.path.length > 0 && r.path.length <= 1000);
        need(r.path.split('/').every((part) => part && part !== '.' && part !== '..'));
        need(typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.sha256));
      }
    }
  }
  const timeoutMs = input.timeout_ms ?? 10000;
  need(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 30000);
  // Keep only the declared contract: raw unknown properties never reach reports or transport.
  return {
    schema_version: 1, environment: 'test', origin: origin.origin,
    public_key_env: input.public_key_env,
    actors, rows: structuredClone(input.rows),
    objects: structuredClone(input.objects), timeout_ms: timeoutMs,
  };
}

export function credentials(config, env) {
  const read = (key) => { const v = env[key]; need(typeof v === 'string' && v.length > 0, 'MISSING_ENV'); return v; };
  const publicKey = read(config.public_key_env);
  if (publicKey.startsWith('sb_secret_')) throw new CheckError('PRIVILEGED_KEY_REFUSED');
  if (!publicKey.startsWith('sb_publishable_')) {
    try {
      const fields = publicKey.split('.');
      need(fields.length === 3 && JSON.parse(Buffer.from(fields[1], 'base64url')).role === 'anon', 'PRIVILEGED_OR_UNKNOWN_KEY_REFUSED');
    } catch { throw new CheckError('PRIVILEGED_OR_UNKNOWN_KEY_REFUSED'); }
  }
  const actors = {};
  for (const who of ['a', 'b']) {
    const actor = config.actors[who];
    actors[who] = Object.hasOwn(actor, 'access_token_env')
      ? {accessToken: read(actor.access_token_env)}
      : {email: read(actor.email_env), password: read(actor.password_env)};
  }
  if (actors.a.email && actors.b.email) need(actors.a.email.toLowerCase() !== actors.b.email.toLowerCase(), 'DISTINCT_USERS_REQUIRED');
  return {publicKey, actors};
}

export function contractFingerprint(config) {
  return sha256(JSON.stringify({origin: config.origin, rows: config.rows, objects: config.objects,
    row_projection: ROW_PROJECTION}));
}
