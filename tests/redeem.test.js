// 云函数逻辑测试：用内存里的假数据库 / 假云存储
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'redeem');
const lib = require(path.join(FN, 'lib.js'));
const realConfig = require(path.join(FN, 'config.js'));

const CODE = 'MW' + 'ABCDEFGHJKMN';
const PRETTY = 'mw-abcd efgh-jkmn';

function makeDeps(opts) {
  opts = opts || {};
  const state = {
    now: opts.now || 1_800_000_000_000,
    codes: new Map(),
    attempts: new Map(),
    tempCalls: [],
    missing: new Set(opts.missing || [])
  };
  const deps = {
    config: Object.assign({}, realConfig, opts.config || {}),
    now: () => state.now,
    getCode: async (c) => (state.codes.has(c) ? JSON.parse(JSON.stringify(state.codes.get(c))) : null),
    getAttempt: async (k) => state.attempts.get(k) || null,
    setAttempt: async (k, rec) => { state.attempts.set(k, rec); },
    bindDeviceTx: async (c, decide) => {
      const fresh = state.codes.has(c) ? JSON.parse(JSON.stringify(state.codes.get(c))) : null;
      const r = decide(fresh);
      if (r.error) return { error: r.error };
      state.codes.set(c, Object.assign(state.codes.get(c), r.patch));
      return r;
    },
    tempUrls: async (ids, maxAge) => {
      state.tempCalls.push({ ids, maxAge });
      const out = {};
      ids.forEach((id) => { if (!state.missing.has(id)) out[id] = 'https://tmp.example/' + encodeURIComponent(id) + '?sign=x&t=' + maxAge; });
      return out;
    }
  };
  return { deps, state };
}

function addCode(state, extra) {
  state.codes.set(CODE, Object.assign({ _id: CODE, code: CODE, status: 'active', createdAt: 1, boundDevices: [], maxDevices: 2, expiresAt: null, note: 't' }, extra || {}));
}

const ctx = { uid: 'anon-uid-1', ip: '1.2.3.4' };
const dev = (n) => 'device_' + String(n).padStart(4, '0');

test('normalizeCode handles dashes, spaces, lowercase and full-width chars', () => {
  assert.equal(lib.normalizeCode(PRETTY), CODE);
  assert.equal(lib.normalizeCode('ＭＷ-ＡＢＣＤ-ＥＦＧＨ-ＪＫＭＮ'), CODE);
  assert.ok(lib.isValidCode(CODE));
  assert.ok(!lib.isValidCode('MW' + 'ABCDEFGHJKM0')); // 0 不在字母表
  assert.equal(lib.formatCode(CODE), 'MW-ABCD-EFGH-JKMN');
});

test('success: binds device and returns short-lived temp URL for the member episode', async () => {
  const { deps, state } = makeDeps();
  addCode(state);
  const r = await lib.handle({ code: PRETTY, deviceId: dev(1), episodeId: '04-green' }, ctx, deps);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.code, 'OK');
  const key = 'episodes/04-green/green_episode4_1080x1920_web.mp4';
  assert.match(r.urls[key], /^https:\/\/tmp\.example\//);
  assert.equal(r.maxAge, 600);
  assert.equal(r.urlExpiresAt, state.now + 600_000);
  assert.equal(state.tempCalls[0].ids[0], realConfig.MEDIA_PREFIX + key);
  assert.equal(state.codes.get(CODE).boundDevices.length, 1);
  assert.equal(r.devicesUsed, 1);
  assert.equal(r.maxDevices, 2);
});

test('same device again does not use another slot', async () => {
  const { deps, state } = makeDeps();
  addCode(state);
  await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps);
  await lib.handle({ code: CODE, deviceId: dev(1), episodeId: '05-orange' }, ctx, deps);
  assert.equal(state.codes.get(CODE).boundDevices.length, 1);
});

test('device limit: third device rejected; maxDevices on the code overrides default', async () => {
  const { deps, state } = makeDeps();
  addCode(state);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).ok, true);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(2) }, ctx, deps)).ok, true);
  const r = await lib.handle({ code: CODE, deviceId: dev(3) }, ctx, deps);
  assert.equal(r.code, 'DEVICE_LIMIT');
  state.codes.get(CODE).maxDevices = 3;
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(3) }, ctx, deps)).ok, true);
});

test('missing maxDevices falls back to DEFAULT_MAX_DEVICES (2)', async () => {
  const { deps, state } = makeDeps();
  addCode(state, { maxDevices: undefined });
  await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps);
  await lib.handle({ code: CODE, deviceId: dev(2) }, ctx, deps);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(3) }, ctx, deps)).code, 'DEVICE_LIMIT');
});

test('disabled and expired codes', async () => {
  const { deps, state } = makeDeps();
  addCode(state, { status: 'disabled' });
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).code, 'DISABLED');
  addCode(state, { expiresAt: state.now - 1 });
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).code, 'EXPIRED');
  addCode(state, { expiresAt: new Date(state.now + 86400000).toISOString() });
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).ok, true);
  addCode(state, { expiresAt: { $date: new Date(state.now - 1000).toISOString() } });
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).code, 'EXPIRED');
});

test('input validation error codes', async () => {
  const { deps, state } = makeDeps();
  addCode(state);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, { uid: '' }, deps)).code, 'AUTH_REQUIRED');
  assert.equal((await lib.handle({ code: CODE, deviceId: 'x' }, ctx, deps)).code, 'BAD_DEVICE');
  assert.equal((await lib.handle({ code: CODE, deviceId: '../../etc' }, ctx, deps)).code, 'BAD_DEVICE');
  assert.equal((await lib.handle({ code: '', deviceId: dev(1) }, ctx, deps)).code, 'EMPTY_CODE');
  assert.equal((await lib.handle({ code: 'hello', deviceId: dev(1) }, ctx, deps)).code, 'BAD_FORMAT');
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1), episodeId: '01-red' }, ctx, deps)).code, 'BAD_EPISODE');
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1), episodeId: '../secret' }, ctx, deps)).code, 'BAD_EPISODE');
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1), episodeId: 'toString' }, ctx, deps)).code, 'BAD_EPISODE');
  const nc = makeDeps({ config: { MEDIA_PREFIX: '' } });
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, nc.deps)).code, 'NOT_CONFIGURED');
  // 每个错误都有中文提示
  for (const k of Object.keys(lib.MESSAGES)) assert.ok(lib.MESSAGES[k]);
});

test('missing file in storage -> FILE_MISSING (device still bound)', async () => {
  const id = realConfig.MEDIA_PREFIX + 'episodes/04-green/green_episode4_1080x1920_web.mp4';
  const { deps, state } = makeDeps({ missing: [id] });
  addCode(state);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1), episodeId: '04-green' }, ctx, deps)).code, 'FILE_MISSING');
});

test('PRIVATE_DIR is inserted into the fileID', async () => {
  const { deps, state } = makeDeps({ config: { PRIVATE_DIR: 'members/' } });
  addCode(state);
  await lib.handle({ code: CODE, deviceId: dev(1), episodeId: '13-mixing' }, ctx, deps);
  assert.equal(state.tempCalls[0].ids[0], realConfig.MEDIA_PREFIX + 'members/episodes/13-mixing/mixing_episode13_1920x1080_web.mp4');
});

test('brute force: 8 wrong codes lock uid/device/ip for 30 minutes, then unlock', async () => {
  const { deps, state } = makeDeps();
  addCode(state);
  const wrong = 'MW' + 'ZZZZZZZZZZZZ';
  for (let i = 0; i < 8; i++) {
    const r = await lib.handle({ code: wrong, deviceId: dev(1) }, ctx, deps);
    assert.equal(r.code, 'NOT_FOUND');
  }
  // 正确的码也被拒绝（锁住了）
  let r = await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps);
  assert.equal(r.code, 'RATE_LIMITED');
  assert.equal(r.retryAfter, 1800);
  // 换设备号、换匿名账号，但 IP 一样，仍然被锁
  r = await lib.handle({ code: CODE, deviceId: dev(9) }, { uid: 'other', ip: '1.2.3.4' }, deps);
  assert.equal(r.code, 'RATE_LIMITED');
  // 另一个 IP + 新账号 + 新设备不受影响
  r = await lib.handle({ code: CODE, deviceId: dev(8) }, { uid: 'other2', ip: '5.6.7.8' }, deps);
  assert.equal(r.ok, true);
  state.now += 31 * 60000;
  r = await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps);
  assert.equal(r.ok, true);
});

test('failures spread over more than the window do not lock', async () => {
  const { deps, state } = makeDeps();
  const wrong = 'MW' + 'ZZZZZZZZZZZZ';
  for (let i = 0; i < 20; i++) {
    await lib.handle({ code: wrong, deviceId: dev(1) }, ctx, deps);
    state.now += 3 * 60000; // 每 3 分钟错一次，15 分钟最多 5 次
  }
  addCode(state);
  assert.equal((await lib.handle({ code: CODE, deviceId: dev(1) }, ctx, deps)).ok, true);
});

test('BAD_FORMAT does not count as a failed attempt', async () => {
  const { deps, state } = makeDeps();
  for (let i = 0; i < 20; i++) await lib.handle({ code: 'nope', deviceId: dev(1) }, ctx, deps);
  assert.equal(state.attempts.size, 0);
});

test('IPv6 address becomes a safe document id', () => {
  const keys = lib.rateKeys({ uid: 'u', deviceId: dev(1), ip: '2001:db8::1' });
  keys.forEach((k) => assert.match(k, /^[A-Za-z0-9_-]+$/));
});

test('index.js wires @cloudbase/node-sdk correctly (mocked SDK)', async () => {
  const calls = { update: [], set: [], temp: [] };
  const docs = { redeem_codes: { [CODE]: { _id: CODE, code: CODE, status: 'active', boundDevices: [], maxDevices: 2 } }, redeem_attempts: {} };
  const fakeDb = {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ data: docs[name][id] ? [docs[name][id]] : [] }),
        set: async (data) => { calls.set.push({ name, id, data }); docs[name][id] = data; }
      })
    }),
    runTransaction: async (fn) => fn({
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({ data: docs[name][id] }),
          update: async (patch) => { calls.update.push({ name, id, patch }); Object.assign(docs[name][id], patch); }
        })
      })
    })
  };
  const fakeSdk = {
    SYMBOL_CURRENT_ENV: Symbol('env'),
    init: () => ({
      database: () => fakeDb,
      auth: () => ({ getUserInfo: () => ({ uid: 'anon-1', isAnonymous: true }), getClientIP: () => '9.9.9.9' }),
      getTempFileURL: async ({ fileList }) => {
        calls.temp.push(fileList);
        return { fileList: fileList.map((f) => ({ fileID: f.fileID, tempFileURL: 'https://t/' + f.fileID, code: 'SUCCESS' })) };
      }
    })
  };
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === '@cloudbase/node-sdk') return fakeSdk;
    return origLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(path.join(FN, 'index.js'))];
    const fn = require(path.join(FN, 'index.js'));
    const r = await fn.main({ code: PRETTY, deviceId: dev(1), episodeId: '06-purple' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(calls.temp[0][0].maxAge, 600);
    assert.equal(calls.update[0].patch.boundDevices[0].id, dev(1));
    const bad = await fn.main({ code: 'MW' + 'YYYYYYYYYYYY', deviceId: dev(1) });
    assert.equal(bad.code, 'NOT_FOUND');
    assert.ok(calls.set.some((c) => c.id === 'ip_9-9-9-9'));
    assert.ok(calls.set.some((c) => c.id === 'u_anon-1'));
  } finally {
    Module._load = origLoad;
  }
});
