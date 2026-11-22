// 用 JS 模拟云存储安全规则的 read 表达式：只有第 4 集起的 mp4 被拒绝
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'storage-rule.json'), 'utf8'));
// eslint-disable-next-line no-new-func
const canRead = new Function('resource', 'auth', 'return (' + rule.read + ');');

function allPaths() {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog.json'), 'utf8'));
  const out = new Set(['data/catalog.json', 'game/apple.jpg', 'game/banana.jpg', 'game/cloud.jpg']);
  (function walk(o) {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    else if (typeof o === 'string' && /^[a-z]+\/.+\.[a-z0-9]+$/i.test(o)) out.add(o);
  })(cat);
  return [...out];
}

test('rule uses only documented syntax (no groups, no negation, no char classes)', () => {
  assert.ok(!/!\s*\//.test(rule.read), 'no negation');
  const regexes = rule.read.match(/\/[^ ]+?\/\.test/g);
  regexes.forEach((r) => {
    assert.ok(!/[()]/.test(r.replace(/\.test$/, '')), 'no grouping: ' + r);
    assert.ok(!/\[/.test(r), 'no char class: ' + r);
  });
});

test('only member-episode (04+) mp4 files are denied; everything else public', () => {
  const paths = allPaths();
  assert.ok(paths.length > 100, String(paths.length));
  const denied = paths.filter((p) => !canRead({ path: p }, null)).sort();
  assert.deepEqual(denied, [
    'episodes/04-green/green_episode4_1080x1920_web.mp4',
    'episodes/05-orange/orange_episode5_1080x1920_web.mp4',
    'episodes/06-purple/purple_episode6_1080x1920_web.mp4',
    'episodes/07-pink/pink_episode7_1080p_web.mp4',
    'episodes/08-brown/brown_episode8_1920x1080_web.mp4',
    'episodes/09-black/black_episode9_1920x1080_web.mp4',
    'episodes/10-white/white_episode10_1920x1080_web.mp4',
    'episodes/11-gray/gray_episode11_1920x1080_web.mp4',
    'episodes/12-review/review_episode12_1920x1080_web.mp4',
    'episodes/13-mixing/mixing_episode13_1920x1080_web.mp4'
  ]);
  ['episodes/01-red/red_episode1_final.mp4', 'episodes/01-red/red_episode1_final_wide.mp4',
    'episodes/04-green/thumbs/frame01.jpg', 'episodes/13-mixing/song/song.mp3',
    'series/wanzhuan-secai/10/lesson-10.mp4', 'data/catalog.json'].forEach((p) => assert.ok(canRead({ path: p }, null), p));
  // 以后新加的第 14 集视频也会自动锁住
  assert.equal(canRead({ path: 'episodes/14-new/x.mp4' }, null), false);
});
