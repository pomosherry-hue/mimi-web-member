// 兑换码核心逻辑（不依赖云开发 SDK，方便本地测试）。
// index.js 负责把真实的数据库 / 云存储接进来。
'use strict';

// 不含容易看错的 0 O 1 I L U
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_PREFIX = 'MW';
const CODE_BODY_LEN = 12;
const CODE_RE = new RegExp('^' + CODE_PREFIX + '[' + ALPHABET + ']{' + CODE_BODY_LEN + '}$');
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

const MESSAGES = {
  OK: '兑换成功',
  EMPTY_CODE: '请输入兑换码',
  BAD_FORMAT: '兑换码格式不对，请检查一下（形如 MW-XXXX-XXXX-XXXX）',
  BAD_DEVICE: '设备信息异常，请刷新页面再试',
  AUTH_REQUIRED: '登录状态失效，请刷新页面再试',
  NOT_FOUND: '没有找到这个兑换码，请检查是否输错',
  DISABLED: '这个兑换码已停用，请联系卖家',
  EXPIRED: '这个兑换码已过期',
  DEVICE_LIMIT: '这个兑换码已经在其他设备上使用，达到设备上限',
  RATE_LIMITED: '输错次数太多，请稍后再试',
  BAD_EPISODE: '这一集不需要兑换码，或者没有这一集',
  FILE_MISSING: '这一集的视频暂时打不开，请联系卖家',
  NOT_CONFIGURED: '服务还没配置好，请联系卖家',
  INTERNAL: '服务器开小差了，请稍后再试'
};

function fail(code, extra) {
  return Object.assign({ ok: false, code, message: MESSAGES[code] || code }, extra || {});
}

// 去掉空格、横线，转大写；去掉中文输入法常见的全角字符
function normalizeCode(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isValidCode(code) {
  return CODE_RE.test(code);
}

function formatCode(code) {
  const body = code.slice(CODE_PREFIX.length);
  return CODE_PREFIX + '-' + body.match(/.{1,4}/g).join('-');
}

function toMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && v.$date != null) return toMs(v.$date);
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}

// 码本身的状态检查（不含设备）
function checkCodeDoc(doc, now) {
  if (!doc) return 'NOT_FOUND';
  if (doc.status && doc.status !== 'active') return 'DISABLED';
  const exp = toMs(doc.expiresAt);
  if (exp && now > exp) return 'EXPIRED';
  return null;
}

// 计算绑定设备后的新列表；返回 { error } 或 { devices, changed }
function bindDevice(doc, deviceId, defaultMax, now) {
  const max = Number(doc.maxDevices) > 0 ? Number(doc.maxDevices) : defaultMax;
  const list = Array.isArray(doc.boundDevices) ? doc.boundDevices.slice() : [];
  const idx = list.findIndex((d) => (typeof d === 'string' ? d : d && d.id) === deviceId);
  if (idx >= 0) {
    return { devices: list, changed: false, max };
  }
  if (list.length >= max) return { error: 'DEVICE_LIMIT', max };
  list.push({ id: deviceId, at: now });
  return { devices: list, changed: true, max };
}

// ---- 防爆破 ----
function rateKeys(ctx) {
  const keys = [];
  if (ctx.uid) keys.push('u_' + ctx.uid);
  if (ctx.deviceId) keys.push('d_' + ctx.deviceId);
  if (ctx.ip) keys.push('ip_' + String(ctx.ip).replace(/[^0-9a-zA-Z]/g, '-'));
  return keys.map((k) => k.slice(0, 120));
}

function lockedFor(rec, now) {
  if (rec && rec.lockedUntil && rec.lockedUntil > now) return rec.lockedUntil;
  return 0;
}

function nextFailRecord(rec, now, rl) {
  const windowMs = rl.WINDOW_MINUTES * 60000;
  let fails = rec && rec.windowStart && now - rec.windowStart < windowMs ? (rec.fails || 0) : 0;
  const windowStart = fails ? rec.windowStart : now;
  fails += 1;
  const out = { fails, windowStart, lockedUntil: (rec && rec.lockedUntil) || 0, updatedAt: now };
  if (fails >= rl.MAX_FAILS) {
    out.lockedUntil = now + rl.LOCK_MINUTES * 60000;
    out.fails = 0;
    out.windowStart = now;
  }
  return out;
}

// ---- 主流程 ----
// deps: {
//   config, now(): number,
//   getCode(code) -> doc|null,
//   bindDeviceTx(code, fn(doc) -> {patch}|{error}) -> {doc}|{error}   // 事务里读+写
//   getAttempt(key) -> rec|null, setAttempt(key, rec),
//   tempUrls(fileIDs[], maxAge) -> { fileID: url }
// }
// event: { code, deviceId, episodeId? }   ctx: { uid, ip }
async function handle(event, ctx, deps) {
  const cfg = deps.config;
  const now = deps.now();
  event = event || {};
  ctx = ctx || {};

  if (!cfg.MEDIA_PREFIX || !cfg.MEMBER_FILES) return fail('NOT_CONFIGURED');
  if (!ctx.uid) return fail('AUTH_REQUIRED');

  const deviceId = typeof event.deviceId === 'string' ? event.deviceId : '';
  if (!DEVICE_RE.test(deviceId)) return fail('BAD_DEVICE');

  const code = normalizeCode(event.code);
  if (!code) return fail('EMPTY_CODE');
  if (!isValidCode(code)) return fail('BAD_FORMAT');

  let episodeId = null;
  if (event.episodeId != null && event.episodeId !== '') {
    episodeId = String(event.episodeId);
    if (!Object.prototype.hasOwnProperty.call(cfg.MEMBER_FILES, episodeId)) return fail('BAD_EPISODE');
  }

  // 1. 先看有没有被锁
  const keys = rateKeys({ uid: ctx.uid, deviceId, ip: ctx.ip });
  const recs = {};
  let lockUntil = 0;
  for (const k of keys) {
    recs[k] = await deps.getAttempt(k);
    lockUntil = Math.max(lockUntil, lockedFor(recs[k], now));
  }
  if (lockUntil) return fail('RATE_LIMITED', { retryAfter: Math.ceil((lockUntil - now) / 1000) });

  // 2. 查码
  const doc = await deps.getCode(code);
  const bad = checkCodeDoc(doc, now);
  if (bad === 'NOT_FOUND') {
    for (const k of keys) await deps.setAttempt(k, nextFailRecord(recs[k], now, cfg.RATE_LIMIT));
    return fail('NOT_FOUND');
  }
  if (bad) return fail(bad);

  // 3. 绑定设备（事务里再读一次，防止两台设备同时抢最后一个名额）
  const r = await deps.bindDeviceTx(code, (fresh) => {
    const again = checkCodeDoc(fresh, now);
    if (again) return { error: again };
    const b = bindDevice(fresh, deviceId, cfg.DEFAULT_MAX_DEVICES, now);
    if (b.error) return { error: b.error };
    const patch = { lastUsedAt: now };
    if (b.changed) patch.boundDevices = b.devices;
    if (!fresh.firstUsedAt) patch.firstUsedAt = now;
    return { patch, devices: b.devices, max: b.max };
  });
  if (r.error) return fail(r.error);

  const result = {
    ok: true,
    code: 'OK',
    message: MESSAGES.OK,
    displayCode: formatCode(code),
    expiresAt: toMs(doc.expiresAt) || null,
    devicesUsed: r.devices.length,
    maxDevices: r.max
  };

  // 4. 发临时链接
  if (episodeId) {
    const maxAge = Number(cfg.TEMP_URL_MAX_AGE) || 600;
    const paths = cfg.MEMBER_FILES[episodeId] || [];
    const fileIDs = paths.map((p) => cfg.MEDIA_PREFIX + (cfg.PRIVATE_DIR || '') + p);
    const got = fileIDs.length ? await deps.tempUrls(fileIDs, maxAge) : {};
    const urls = {};
    paths.forEach((p, i) => { if (got[fileIDs[i]]) urls[p] = got[fileIDs[i]]; });
    if (!urls[paths[0]]) return fail('FILE_MISSING');
    result.episodeId = episodeId;
    result.urls = urls;
    result.maxAge = maxAge;
    result.urlExpiresAt = now + maxAge * 1000;
  }
  return result;
}

module.exports = {
  ALPHABET, CODE_PREFIX, CODE_BODY_LEN, MESSAGES,
  normalizeCode, isValidCode, formatCode, checkCodeDoc, bindDevice,
  rateKeys, nextFailRecord, lockedFor, handle, fail
};
