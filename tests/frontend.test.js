// 前端测试：用 jsdom 打开 index.html / play.html，假的 cloudbase SDK
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SITE = path.join(__dirname, '..');
const SCRIPTS = ['js/config.js', 'js/catalog.js', 'js/member.js', 'js/media.js'];

function fakeCloudbase(handler, log) {
  return {
    init: (opts) => {
      log.push(['init', opts.env]);
      return {
        auth: () => ({
          getLoginState: async () => null,
          signInAnonymously: async () => { log.push(['anon']); return {}; }
        }),
        callFunction: async ({ name, data }) => { log.push(['call', name, data]); return { result: handler(data) }; }
      };
    }
  };
}

function open(page, query, handler, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(SITE, page), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'https://pomosherry-hue.github.io/mimi-web-member/' + page + (query || ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  const log = [];
  w.cloudbase = fakeCloudbase(handler || (() => ({ ok: false, code: 'NOT_FOUND', message: 'x' })), log);
  if (opts.code) w.localStorage.setItem('mimi_redeem_code', opts.code);
  if (opts.expiresAt != null) w.localStorage.setItem('mimi_member_expires_at', String(opts.expiresAt));
  const list = SCRIPTS.concat(page === 'index.html' ? ['js/home.js'] : ['js/play.js']);
  list.forEach((f) => w.eval(fs.readFileSync(path.join(SITE, f), 'utf8')));
  return { w, log, doc: w.document };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 20));
const GREEN = 'episodes/04-green/green_episode4_1080x1920_web.mp4';

const FAR_EXP = new Date(2027, 10, 22, 12, 0, 0).getTime(); // 本地 2027-11-22

function okHandler(data) {
  if (data.code !== 'MWABCDEFGHJKMN') return { ok: false, code: 'NOT_FOUND', message: '没有找到这个兑换码，请检查是否输错' };
  const urls = {};
  if (data.episodeId === '04-green') urls[GREEN] = 'https://tmp.example/green.mp4?sign=1';
  return { ok: true, code: 'OK', urls, urlExpiresAt: Date.now() + 600000, memberExpiresAt: FAR_EXP };
}

test('media helpers: member videos have no public/cloud/GitHub URL; free ones unchanged', () => {
  const { w } = open('index.html', '', null);
  const M = w.MIMI;
  const cat = w.MIMI_CATALOG;
  const ep1 = M.findEpisode(cat, '01-red');
  const ep4 = M.findEpisode(cat, '04-green');
  const ep13 = M.findEpisode(cat, '13-mixing');
  const lesson = M.findEpisode(cat, 'wanzhuan-secai-10');
  assert.equal(M.memberLocked(ep1), false);
  assert.equal(M.memberLocked(ep4), true);
  assert.equal(M.memberLocked(ep13), true);
  assert.equal(M.memberLocked(lesson), false, '玩转色彩不锁');
  assert.match(M.videoOf(ep1), /red_episode1_final\.mp4$/);
  assert.equal(M.videoOf(ep4), '');
  assert.equal(M.videoFallbacks(ep4).length, 0);
  assert.equal(M.publicUrl(ep4.video), '');
  assert.equal(M.cloudUrl(ep4.video), '');
  assert.ok(M.mediaUrl(ep4.cover), '封面仍然公开');
  M.setMemberUrls({ [GREEN]: 'https://tmp.example/g.mp4' }, Date.now() + 1000);
  assert.equal(M.videoOf(ep4), 'https://tmp.example/g.mp4');
});

test('home page: lock badges on episodes 4–13 only', () => {
  const { doc } = open('index.html', '', null);
  const cards = [...doc.querySelectorAll('.card')];
  const mimi = cards.filter((c) => /id=\d\d-/.test(c.getAttribute('href')));
  assert.equal(mimi.length, 13);
  mimi.forEach((c, i) => {
    const hasLock = !!c.querySelector('.lock-badge');
    assert.equal(hasLock, i >= 3, c.getAttribute('href'));
  });
  assert.equal(doc.querySelectorAll('.lock-badge').length, 10);
  assert.match(doc.body.textContent, /前 3 集免费/);
});

test('free episode plays without calling the cloud function', async () => {
  const { doc, log } = open('play.html', '?id=02-yellow', okHandler);
  await tick();
  const v = doc.getElementById('player');
  assert.ok(v && /yellow_episode2/.test(v.getAttribute('src')));
  assert.equal(log.length, 0);
});

test('member episode without code shows lock; wrong code shows error; right code plays temp URL and is saved', async () => {
  const { w, doc, log } = open('play.html', '?id=04-green', okHandler);
  await tick();
  assert.ok(doc.querySelector('.lock-panel'), 'lock panel shown');
  assert.equal(doc.getElementById('player'), null);
  const buy = doc.querySelector('.buy-block');
  assert.ok(buy, 'purchase block on lock screen');
  assert.match(buy.textContent, /会员一年 ¥99/);
  assert.match(buy.textContent, /扫左边收款码付款，备注里填你的微信号/);
  assert.match(buy.textContent, /加咪咪微信：Pomosherry/);
  assert.match(buy.textContent, /收到付款后会把兑换码发给你；续费也一样/);
  assert.equal(buy.querySelectorAll('img').length, 2);
  const hrefs = [...buy.querySelectorAll('a.buy-qr')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['img/pay-wechat.jpg', 'img/wechat-contact.jpg']);
  assert.ok(hrefs.every((_, i) => buy.querySelectorAll('a.buy-qr')[i].getAttribute('target') === '_blank'));
  assert.doesNotMatch(doc.body.textContent, /小红书/);
  const input = doc.querySelector('.redeem-input');
  const form = doc.querySelector('.redeem-form');
  input.value = 'mw-zzzz-zzzz-zzzz';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await tick();
  assert.match(doc.querySelector('.redeem-msg').textContent, /没有找到/);
  assert.equal(w.localStorage.getItem('mimi_redeem_code'), null);
  input.value = 'mw-abcd-efgh-jkmn';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await tick(50);
  const v = doc.getElementById('player');
  assert.ok(v, 'player rendered');
  assert.equal(v.getAttribute('src'), 'https://tmp.example/green.mp4?sign=1');
  assert.equal(w.localStorage.getItem('mimi_redeem_code'), 'MWABCDEFGHJKMN');
  assert.equal(w.localStorage.getItem('mimi_member_expires_at'), String(FAR_EXP));
  assert.match(doc.body.textContent, /会员有效期至 2027-11-22/);
  assert.equal(doc.querySelector('.buy-block'), null, 'no renewal block when expiry is far away');
  assert.doesNotMatch(doc.body.textContent, /小红书/);
  const call = log.filter((l) => l[0] === 'call').pop();
  assert.equal(call[1], 'redeem');
  assert.equal(call[2].episodeId, '04-green');
  assert.match(call[2].deviceId, /^w[0-9a-f]{32}$/);
  assert.ok(log.some((l) => l[0] === 'anon'), 'anonymous login used');
  assert.ok(log.some((l) => l[0] === 'init' && l[1] === 'cloud1-d2guejnqud92f5860'));
  assert.ok(doc.getElementById('change-code'));
});

test('saved code: member episode plays directly; expired URL is refreshed on video error', async () => {
  let n = 0;
  const { w, doc, log } = open('play.html', '?id=04-green', (data) => {
    n++;
    return { ok: true, code: 'OK', urls: { [GREEN]: 'https://tmp.example/green.mp4?n=' + n }, urlExpiresAt: Date.now() + 600000 };
  }, { code: 'MWABCDEFGHJKMN' });
  await tick(50);
  const v = doc.getElementById('player');
  assert.equal(v.getAttribute('src'), 'https://tmp.example/green.mp4?n=1');
  v.dispatchEvent(new w.Event('error'));
  await tick(50);
  assert.equal(v.getAttribute('src'), 'https://tmp.example/green.mp4?n=2');
  assert.equal(log.filter((l) => l[0] === 'call').length, 2);
});

test('saved code that was disabled: cleared and lock shown with message', async () => {
  const { w, doc } = open('play.html', '?id=05-orange', () => ({ ok: false, code: 'DISABLED', message: '这个兑换码已停用，请联系卖家' }), { code: 'MWABCDEFGHJKMN' });
  await tick(50);
  assert.ok(doc.querySelector('.lock-panel'));
  assert.match(doc.querySelector('.redeem-msg').textContent, /停用/);
  assert.equal(w.localStorage.getItem('mimi_redeem_code'), null);
});

test('network failure keeps the saved code', async () => {
  const { w, doc } = open('play.html', '?id=05-orange', () => { throw new Error('offline'); }, { code: 'MWABCDEFGHJKMN' });
  await tick(50);
  assert.ok(doc.querySelector('.lock-panel'));
  assert.match(doc.querySelector('.redeem-msg').textContent, /网络/);
  assert.equal(w.localStorage.getItem('mimi_redeem_code'), 'MWABCDEFGHJKMN');
});

test('within 30 days of expiry: gentle notice is shown near the player', async () => {
  const exp = Date.now() + 10 * 86400000 - 60000;
  const { doc, w } = open('play.html', '?id=04-green', (data) => {
    return { ok: true, code: 'OK', urls: { [GREEN]: 'https://tmp.example/green.mp4?sign=1' }, urlExpiresAt: Date.now() + 600000, memberExpiresAt: exp };
  }, { code: 'MWABCDEFGHJKMN' });
  await tick(50);
  assert.ok(doc.getElementById('player'));
  assert.match(doc.body.textContent, /会员还有 10 天到期/);
  assert.match(doc.body.textContent, /会员有效期至 /);
  assert.ok(doc.querySelector('.member-expiry-warn'));
  assert.ok(doc.querySelector('.buy-block'), 'renewal block when expiring soon');
  assert.match(doc.querySelector('.buy-block').textContent, /会员一年 ¥99/);
  assert.match(doc.querySelector('.buy-block').textContent, /续费也一样/);
  assert.equal(w.localStorage.getItem('mimi_member_expires_at'), String(exp));
});

test('locally expired membership clears the code and shows the lock with EXPIRED message', async () => {
  const { w, doc, log } = open('play.html', '?id=04-green', okHandler, {
    code: 'MWABCDEFGHJKMN',
    expiresAt: Date.now() - 1000
  });
  await tick(50);
  assert.ok(doc.querySelector('.lock-panel'));
  assert.match(doc.querySelector('.redeem-msg').textContent, /已经到期/);
  assert.match(doc.querySelector('.redeem-msg').textContent, /请联系咪咪续费/);
  assert.ok(doc.querySelector('.buy-block'), 'renewal block alongside expired message');
  assert.match(doc.querySelector('.buy-block').textContent, /会员一年 ¥99/);
  assert.equal(w.localStorage.getItem('mimi_redeem_code'), null);
  assert.equal(w.localStorage.getItem('mimi_member_expires_at'), null);
  assert.equal(log.filter((l) => l[0] === 'call').length, 0, 'should not call cloud function when expired locally');
});

