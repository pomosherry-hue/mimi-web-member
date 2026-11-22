// 咪咪色彩英语网页版：兑换码云函数 redeem
// 网页（匿名登录）调用：{ code, deviceId, episodeId? }
// 成功：{ ok: true, code: 'OK', urls: { 'episodes/04-green/xx.mp4': 'https://临时链接' }, urlExpiresAt, ... }
// 失败：{ ok: false, code: 'NOT_FOUND' | 'DEVICE_LIMIT' | ..., message: '中文提示' }
'use strict';
const tcb = require('@cloudbase/node-sdk');
const config = require('./config');
const lib = require('./lib');

const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
const db = app.database();

// node-sdk 的 doc().get() 返回 { data: [doc] }；事务里返回 { data: doc }。两种都兼容。
function one(res) {
  if (!res) return null;
  const d = res.data;
  if (Array.isArray(d)) return d[0] || null;
  return d || null;
}

async function getDoc(coll, id) {
  try {
    return one(await db.collection(coll).doc(id).get());
  } catch (e) {
    return null;
  }
}

function stripId(obj) {
  const o = Object.assign({}, obj);
  delete o._id;
  return o;
}

const deps = {
  config,
  now: () => Date.now(),
  getCode: (code) => getDoc(config.CODES_COLLECTION, code),
  getAttempt: (key) => getDoc(config.ATTEMPTS_COLLECTION, key),
  setAttempt: async (key, rec) => {
    try {
      await db.collection(config.ATTEMPTS_COLLECTION).doc(key).set(stripId(rec));
    } catch (e) {
      console.error('setAttempt failed', e && e.message);
    }
  },
  bindDeviceTx: async (code, decide) => {
    return db.runTransaction(async (tx) => {
      const ref = tx.collection(config.CODES_COLLECTION).doc(code);
      const fresh = one(await ref.get());
      const r = decide(fresh);
      if (r.error) return { error: r.error };
      await ref.update(r.patch);
      return r;
    });
  },
  tempUrls: async (fileIDs, maxAge) => {
    const res = await app.getTempFileURL({
      fileList: fileIDs.map((fileID) => ({ fileID, maxAge }))
    });
    const out = {};
    (res.fileList || []).forEach((f) => {
      const ok = f && f.tempFileURL && (f.code === 'SUCCESS' || f.status === 0 || f.code === undefined);
      if (ok) out[f.fileID] = f.tempFileURL;
    });
    return out;
  }
};

exports.main = async (event) => {
  try {
    const auth = app.auth();
    const info = auth.getUserInfo() || {};
    let ip = '';
    try { ip = auth.getClientIP() || ''; } catch (e) { ip = ''; }
    const uid = info.uid || info.customUserId || info.openId || '';
    return await lib.handle(event, { uid, ip }, deps);
  } catch (e) {
    console.error('redeem failed', e && (e.stack || e.message));
    return lib.fail('INTERNAL');
  }
};
