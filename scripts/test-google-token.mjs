/* ============================================================
   test:google-token — the pure half of supabase/functions/google-token
   ------------------------------------------------------------
   Node, no browser, no network: the encryption (AES-256-GCM with the user
   id as AAD), the request shapes, what each Google answer means, and three
   reads of the function source that keep its promises honest — no token
   in a URL, no token in a log, JWT-derived identity only.
       npm run test:google-token
   ============================================================ */
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const G = await import('../supabase/functions/_shared/google-token.js');

let n = 0, failed = 0;
const ok = (cond, msg) => { n++; if (cond) console.log('  ✓ ' + msg); else { failed++; console.error('  ✗ ' + msg); } };
const throws = async (fn) => { try { await fn(); return false; } catch { return true; } };

const keyB64 = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
const key = await G.importKey(keyB64);
const UID = '0b0c8e2a-1111-4222-8333-444455556666';
const OTHER = '0b0c8e2a-1111-4222-8333-444455557777';
const RT = '1//0gExampleRefreshToken-abcdefghijklmnopqrstuvwxyz0123456789_ABCDEFG';

console.log('encryption');
const blob = await G.encryptToken(key, RT, UID);
ok(typeof blob === 'string' && !blob.includes(RT) && !blob.includes('1//'), 'the ciphertext does not contain the token');
ok(G.b64decode(blob).length === 12 + Buffer.byteLength(RT) + 16, 'layout is iv[12] || ciphertext || tag[16]');
ok(blob.length >= 40 && blob.length <= 8192, 'fits §66’s length check (40..8192)');
ok((await G.decryptToken(key, blob, UID)) === RT, 'round trip with the same key and user id');
ok((await G.encryptToken(key, RT, UID)) !== blob, 'a random IV: the same token encrypts differently each time');
ok(await throws(() => G.decryptToken(key, blob, OTHER)), 'the AAD binds it: a row moved to another user id does not decrypt');
const key2 = await G.importKey(Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64'));
ok(await throws(() => G.decryptToken(key2, blob, UID)), 'another key does not decrypt it');
const raw = G.b64decode(blob); raw[raw.length - 1] ^= 1;
ok(await throws(() => G.decryptToken(key, G.b64encode(raw), UID)), 'a flipped bit in the tag is refused');
ok(await throws(() => G.decryptToken(key, G.b64encode(raw.subarray(0, 20)), UID)), 'a truncated blob is refused');
ok(await throws(() => G.decryptToken(key, 'not base64!!', UID)), 'garbage is refused');
ok(await throws(() => G.importKey(Buffer.from(new Uint8Array(16)).toString('base64'))), 'a 16-byte key is refused (32 bytes only)');
ok(await throws(() => G.importKey('%%%')), 'a key that is not base64 is refused');
try { await G.importKey('AAAA'); } catch (e) { ok(!/AAAA/.test(e.message) && /GOOGLE_TOKEN_KEY/.test(e.message), 'a bad key’s error names the setting, not the value'); }
ok(await throws(() => G.encryptToken(key, RT, '')), 'no AAD, no encryption');
ok(G.b64encode(G.b64decode(G.b64encode(new Uint8Array(70000).fill(7)))).length > 90000, 'base64 survives a buffer larger than one chunk');

console.log('requests');
ok(G.parseRequest({ action: 'mint' }).action === 'mint', 'mint');
ok(G.parseRequest({ action: ' MINT ' }).action === 'mint', 'action is trimmed and lower-cased');
ok(G.parseRequest({ action: 'steal' }).status === 400 && G.parseRequest(null).status === 400 && G.parseRequest([]).status === 400, 'an unknown action, null or an array is a 400');
ok(G.parseRequest({ action: 'store', refresh_token: RT, scope: 'a b' }).refreshToken === RT, 'store carries the token');
ok(G.parseRequest({ action: 'store' }).status === 400, 'store without a token is a 400');
ok(G.parseRequest({ action: 'store', refresh_token: 'has a space in it' }).status === 400, 'a token with spaces is refused');
ok(G.parseRequest({ action: 'store', refresh_token: 'x'.repeat(3000) }).status === 400, 'an absurdly long one too');
ok(G.parseRequest({ action: 'revoke' }).userId === undefined, 'revoke with no user_id is about the caller');
ok(G.parseRequest({ action: 'revoke', user_id: OTHER.toUpperCase() }).userId === OTHER, 'an admin’s target is a lower-cased uuid');
ok(G.parseRequest({ action: 'revoke', user_id: "'; drop table x; --" }).status === 400, 'a user_id that is not a uuid is a 400');
ok(G.parseRequest({ action: 'mint', user_id: OTHER }).userId === undefined, 'mint ignores a user_id: identity is the JWT’s');
ok(G.parseRequest({ action: 'store', refresh_token: RT, user_id: OTHER }).userId === undefined, 'so does store');

console.log('the refresh form');
const form = new URLSearchParams(G.refreshForm({ clientId: 'cid', clientSecret: 's3cret', refreshToken: RT }));
ok(form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === RT && form.get('client_secret') === 's3cret', 'grant_type=refresh_token, the token and the secret in the BODY');
ok(new URLSearchParams(G.revokeForm(RT)).get('token') === RT, 'revoke sends the token in the body');
ok(!/[?&](key|token|refresh_token|client_secret)=/.test(G.TOKEN_URL + G.REVOKE_URL), 'neither endpoint URL carries a secret');

console.log('mint outcomes');
let o = G.mintOutcome(200, { access_token: 'ya29.fresh', expires_in: 3599, scope: 'drive.file', token_type: 'Bearer' });
ok(o.status === 200 && o.body.access_token === 'ya29.fresh' && o.body.expires_in === 3599 && !o.drop && !o.rotate, '200: an access token and its lifetime');
ok(!('refresh_token' in o.body), 'the body never carries a refresh token');
o = G.mintOutcome(200, { access_token: 'ya29.fresh', expires_in: 3599, refresh_token: '1//rotatedRefreshToken' });
ok(o.rotate === '1//rotatedRefreshToken' && !('refresh_token' in o.body), 'a rotated refresh token is stored, not returned');
ok(G.mintOutcome(200, { access_token: 'ya29.x' }).body.expires_in === 3600, 'no expires_in reads as an hour');
o = G.mintOutcome(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
ok(o.status === 409 && o.body.code === 'regrant' && o.drop, 'invalid_grant: 409 regrant, and the dead row is dropped');
o = G.mintOutcome(401, { error: 'invalid_client' });
ok(o.status === 503 && o.body.code === 'client' && !o.drop, 'invalid_client: 503, the row kept (the studio’s config is wrong, not the grant)');
o = G.mintOutcome(500, null);
ok(o.status === 502 && !o.drop && /500/.test(o.body.error), 'a 5xx is reported as observed, the row kept');
o = G.mintOutcome(0, null, { threw: true });
ok(o.status === 502 && o.body.code === 'unreachable' && !o.drop, 'no answer: 502 unreachable, the row kept');
ok(G.mintOutcome(200, {}).status === 502, 'a 200 without a token is not a success');
ok(!/likely|probably|mismatch|misconfigur/i.test(JSON.stringify([400, 401, 403, 500].map((s) => G.mintOutcome(s, { error: 'x' }).body))), 'no message guesses a cause');

console.log('revoke outcomes');
ok(G.revokeOutcome(200, {}).revoked && G.revokeOutcome(200, {}).drop, '200: revoked, row dropped');
ok(G.revokeOutcome(400, { error: 'invalid_token' }).drop, '400 invalid_token: Google already forgot it, row dropped');
ok(!G.revokeOutcome(503, null).drop && !G.revokeOutcome(0, null, { threw: true }).drop, 'a 5xx or no answer keeps the row for a later revoke');

console.log('redaction');
ok(G.redact('bad 1//0gAbcdefghijklmnop and ya29.a0AfH6SMBabcdefghij here') === 'bad [token] and [token] here', 'refresh and access tokens are cut out of a string');

console.log('the function source');
const src = fs.readFileSync(new URL('../supabase/functions/google-token/index.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const logs = code.match(/console\.(log|warn|error|info|debug)\([^)]*\)/g) || [];
ok(logs.length > 0 && logs.every((l) => !/refresh|access_token|enc_refresh|row\b|body|json\b|g\.json|keyB64|clientSecret/i.test(l.replace(/^console\.\w+\('\[google-token\] \w+'/, ''))),
  `no log line names a token, a body or a secret (${logs.length} log calls, status and codes only)`);
ok(!/\?(key|token|access_token|refresh_token)=/.test(code), 'no URL carries a key or a token');
ok(/auth\.getUser\(\)/.test(code) && /const me = who\.user\.id/.test(code), 'the caller is the JWT’s user');
ok(/studio_role/.test(code) && /role !== 'owner'/.test(code), 'revoking somebody else’s grant needs the owner role, asked as the caller');
ok(!/refresh_token:\s*refresh\b/.test(code.replace(/refreshForm\(\{[^}]*\}\)/g, '')) && !/json\(\s*200,\s*\{[^}]*refresh/.test(code), 'no response carries the refresh token');
ok(/from '\.\.\/_shared\/google-token\.js'/.test(code), 'it uses this tested module, not a copy');

console.log(`${failed ? '✗' : '✓'} google-token: ${n - failed} of ${n} checks passed`);
process.exit(failed ? 1 : 0);
