(function (w) {
  var cache = {}; // path -> { url, exp }

  function cfg() {
    return w.MIMI_CONFIG || {};
  }

  function isOffline() {
    return !!cfg().OFFLINE;
  }

  function isPreviewHost() {
    var loc = w.location || {};
    var proto = loc.protocol || '';
    var host = loc.hostname || '';
    if (proto === 'file:') return true;
    if (/\.github\.io$/i.test(host)) return true;
    return false;
  }

  // webmedia 保留但不再调用。
  function cloudAllowed() {
    return false;
  }

  function withSlash(u) {
    if (!u) return '';
    return String(u).replace(/\/?$/, '/');
  }

  function mediaBase() {
    return withSlash(cfg().MEDIA_BASE || '');
  }

  function previewBase() {
    return withSlash(cfg().PREVIEW_MEDIA_BASE || '');
  }

  function kidsColorBase() {
    return withSlash(cfg().KIDS_COLOR_BASE || 'https://pomosherry-hue.github.io/kids-color/');
  }

  function stallMs() {
    var n = Number(cfg().MEDIA_STALL_MS);
    return n > 0 ? n : 6000;
  }

  function cleanPath(path) {
    return String(path || '').replace(/^\//, '');
  }

  function kidsColorFile(no, ext) {
    var n = String(no).padStart(2, '0');
    return kidsColorBase() + 'lesson-' + n + ext;
  }

  // 会员集（兑换码）的视频路径：不给公开地址，也不回退 GitHub，只用云函数 redeem 发的临时链接
  var lockedPaths = {};
  function memberLocked(ep) {
    return !!(w.MIMI_MEMBER && w.MIMI_MEMBER.isLocked(ep));
  }
  function isLockedPath(path) {
    getPublicIndex();
    return !!lockedPaths[cleanPath(path)];
  }

  var publicIndex = null;
  function getPublicIndex() {
    if (publicIndex) return publicIndex;
    publicIndex = {};
    var catalog = w.MIMI_CATALOG;
    if (!catalog) return publicIndex;
    var base = previewBase();
    (catalog.episodes || []).forEach(function (ep) {
      if (memberLocked(ep)) {
        [ep.video, ep.videoWide, ep.audio].forEach(function (rel) {
          if (rel) lockedPaths[cleanPath(rel)] = true;
        });
      }
      if (ep.series === 'mimi-songs') {
        var keys = memberLocked(ep) ? [ep.cover, ep.poster] : [ep.video, ep.videoWide, ep.cover, ep.poster];
        (ep.words || []).forEach(function (wd) { if (wd && wd.image) keys.push(wd.image); });
        keys.forEach(function (rel) {
          if (rel && base) publicIndex[rel] = base + String(rel).replace(/^\//, '');
        });
      }
      if (ep.series === 'wanzhuan-secai') {
        var file = kidsColorFile(ep.no, '');
        if (ep.video) publicIndex[ep.video] = file + '.mp4';
        if (ep.cover) publicIndex[ep.cover] = file + '.jpg';
        if (ep.poster) publicIndex[ep.poster] = file + '.jpg';
      }
      if (ep.release && ep.video && !publicIndex[ep.video]) publicIndex[ep.video] = ep.release;
    });
    return publicIndex;
  }

  function publicUrl(path) {
    if (!path) return '';
    var p = cleanPath(path);
    if (isLockedPath(p)) return '';
    var mapped = getPublicIndex()[p];
    if (mapped) return mapped;
    // 未入目录的游戏图等，仍可回退到本站备份
    var base = previewBase();
    return base ? base + p : '';
  }

  function cloudUrl(path) {
    if (!path || isOffline()) return '';
    if (isLockedPath(path)) return '';
    var base = mediaBase();
    if (!base || base === '/') return '';
    return base + cleanPath(path);
  }

  function fallbackUrl(path) {
    return publicUrl(path);
  }

  function kidsColorVideo(ep) {
    if (!ep || ep.series !== 'wanzhuan-secai') return '';
    return kidsColorFile(ep.no, '.mp4');
  }

  function mediaUrl(path) {
    if (!path) return '';
    var p = cleanPath(path);
    if (isOffline()) return 'media/' + p;
    var c = cache[p];
    if (c && c.url && c.exp > Date.now()) return c.url;
    if (c && c.url) return c.url;
    if (isLockedPath(p)) return '';
    var cloud = cloudUrl(p);
    if (cloud) return cloud;
    return publicUrl(p);
  }

  function videoOf(ep, wide) {
    if (!ep) return '';
    if (wide && ep.videoWide) {
      var wideUrl = mediaUrl(ep.videoWide);
      if (wideUrl) return wideUrl;
    }
    var u = mediaUrl(ep.video);
    if (u) return u;
    if (ep.release) return ep.release;
    return kidsColorVideo(ep);
  }

  function videoFallbacks(ep, wide) {
    if (!ep) return [];
    if (memberLocked(ep)) return [];
    var path = (wide && ep.videoWide) ? ep.videoWide : ep.video;
    var urls = [];
    function add(u) {
      if (u && urls.indexOf(u) === -1) urls.push(u);
    }
    add(publicUrl(path));
    add(ep.release);
    add(kidsColorVideo(ep));
    var primary = videoOf(ep, wide);
    return urls.filter(function (u) { return u && u !== primary; });
  }

  // 把云函数发的临时链接放进缓存（urls: { 相对路径: 临时链接 }）
  function setMemberUrls(urls, exp) {
    Object.keys(urls || {}).forEach(function (rel) {
      cache[cleanPath(rel)] = { url: urls[rel], exp: exp || (Date.now() + 540000) };
    });
  }

  function onImgError(el) {
    if (!el) return;
    if (el.getAttribute('data-fb-tried') === '1') {
      if (el.getAttribute('data-fb-remove') === '1' && el.parentNode) el.remove();
      else el.style.visibility = 'hidden';
      return;
    }
    el.setAttribute('data-fb-tried', '1');
    var fb = el.getAttribute('data-fb') || '';
    if (!fb) fb = fallbackUrl(el.getAttribute('data-media') || '');
    var cur = el.currentSrc || el.getAttribute('src') || '';
    if (fb && fb !== cur) {
      el.src = fb;
      return;
    }
    if (el.getAttribute('data-fb-remove') === '1' && el.parentNode) el.remove();
    else el.style.visibility = 'hidden';
  }

  function watchMedia(el, path, opts) {
    if (!el) return;
    opts = opts || {};
    var p = path || el.getAttribute('data-media') || '';
    var primary = p ? mediaUrl(p) : (el.getAttribute('src') || '');
    var fb = (p ? fallbackUrl(p) : '') || el.getAttribute('data-fb') || '';
    if (p) el.setAttribute('data-media', p);
    if (fb && fb !== primary) el.setAttribute('data-fb', fb);
    if (opts.removeOnFail) el.setAttribute('data-fb-remove', '1');
    if (primary && el.getAttribute('src') !== primary && el.currentSrc !== primary) {
      if (!el.getAttribute('src')) el.src = primary;
    }
    if (el.getAttribute('data-fb-bound') !== '1') {
      el.setAttribute('data-fb-bound', '1');
      el.addEventListener('error', function () { onImgError(el); });
    }
    if (el.complete && el.naturalWidth > 0) return;
    var timer = setTimeout(function () {
      if (el.complete && el.naturalWidth > 0) return;
      onImgError(el);
    }, stallMs());
    el.addEventListener('load', function onload() {
      el.removeEventListener('load', onload);
      clearTimeout(timer);
    });
  }

  function setVideoPoster(video, path) {
    if (!video || !path) return;
    var primary = mediaUrl(path);
    var fb = fallbackUrl(path);
    if (primary) video.setAttribute('poster', primary);
    if (!fb || fb === primary) return;
    var im = new Image();
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      video.setAttribute('poster', fb);
    }, stallMs());
    im.onload = function () {
      done = true;
      clearTimeout(timer);
    };
    im.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.setAttribute('poster', fb);
    };
    im.src = primary;
  }

  function resolve(paths) {
    var list = Array.from(new Set((paths || []).filter(Boolean).map(cleanPath)));
    if (isOffline()) {
      var off = {};
      list.forEach(function (p) { off[p] = 'media/' + p; });
      return Promise.resolve(off);
    }
    getPublicIndex();
    var out = {};
    list.forEach(function (p) { out[p] = mediaUrl(p); });
    return Promise.resolve(out);
  }

  function seriesCopy(series) {
    var extra = {
      'mimi-songs': {
        title: '咪咪色彩英语',
        desc: '小猫咪咪陪孩子认颜色、学英语。双语动画，配单词卡和色彩练习，适合 2–6 岁。'
      },
      'wanzhuan-secai': {
        title: '玩转色彩',
        desc: '36 个神奇的颜色实验。每天 5 分钟，动手发现颜色的秘密。适合小学 2–4 年级。'
      }
    };
    var over = extra[series && series.id] || {};
    return {
      title: over.title || (series && series.title) || '',
      desc: over.desc || (series && series.desc) || '',
      host: (series && series.host) || '',
      hex: (series && series.hex) || '#E8352E',
      unit: (series && series.unit) || '集'
    };
  }

  function zhTitle(ep) {
    if (!ep || !ep.title) return '';
    return ep.title.zh || ep.title.en || '';
  }

  function enTitle(ep) {
    if (!ep || !ep.title) return '';
    return ep.title.en || '';
  }

  function colorName(ep) {
    if (!ep || !ep.color) return '';
    return ep.color.zh || ep.color.en || '';
  }

  function colorHex(ep) {
    return (ep && ep.color && ep.color.hex) || '#E4D2B0';
  }

  function fmtDuration(sec) {
    sec = Math.round(Number(sec) || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function liveSeries(catalog) {
    return ((catalog && catalog.series) || []).filter(function (s) {
      return s.status === 'live';
    });
  }

  function episodesOf(catalog, seriesId) {
    return ((catalog && catalog.episodes) || []).filter(function (e) {
      return e.series === seriesId;
    });
  }

  function findEpisode(catalog, id) {
    var list = (catalog && catalog.episodes) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function findSeries(catalog, id) {
    var list = (catalog && catalog.series) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function nextEpisode(catalog, ep) {
    if (!ep) return null;
    var list = episodesOf(catalog, ep.series);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === ep.id) return list[i + 1] || null;
    }
    return null;
  }

  function prevEpisode(catalog, ep) {
    if (!ep) return null;
    var list = episodesOf(catalog, ep.series);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === ep.id) return i > 0 ? list[i - 1] : null;
    }
    return null;
  }

  w.MIMI = {
    mediaUrl: mediaUrl,
    setMemberUrls: setMemberUrls,
    isLockedPath: isLockedPath,
    memberLocked: memberLocked,
    cloudUrl: cloudUrl,
    fallbackUrl: fallbackUrl,
    videoOf: videoOf,
    videoFallbacks: videoFallbacks,
    resolve: resolve,
    isOffline: isOffline,
    isPreviewHost: isPreviewHost,
    cloudAllowed: cloudAllowed,
    kidsColorVideo: kidsColorVideo,
    publicUrl: publicUrl,
    onImgError: onImgError,
    watchMedia: watchMedia,
    setVideoPoster: setVideoPoster,
    stallMs: stallMs,
    seriesCopy: seriesCopy,
    zhTitle: zhTitle,
    enTitle: enTitle,
    colorName: colorName,
    hex: colorHex,
    colorHex: colorHex,
    fmtDuration: fmtDuration,
    liveSeries: liveSeries,
    episodesOf: episodesOf,
    findEpisode: findEpisode,
    findSeries: findSeries,
    nextEpisode: nextEpisode,
    prevEpisode: prevEpisode
  };
})(window);
