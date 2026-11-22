(function () {
  var catalog = window.MIMI_CATALOG;
  var M = window.MIMI;
  if (!catalog || !M) return;

  var WANZHUAN_BG = {
    '01': 'linear-gradient(135deg,#e24b3b,#f2c14e)',
    '02': 'linear-gradient(135deg,#f2c14e,#3d7edb)',
    '03': 'linear-gradient(135deg,#e24b3b,#3d7edb)',
    '04': 'linear-gradient(135deg,#f08a2a,#e24b3b)',
    '05': 'linear-gradient(135deg,#3c9a6a,#f2c14e)',
    '06': 'linear-gradient(135deg,#3d7edb,#7eb6e8)',
    '07': 'linear-gradient(135deg,#8a5a32,#c9844a)',
    '08': 'linear-gradient(135deg,#2a221c,#e24b3b)',
    '09': 'linear-gradient(135deg,#f7f1e8,#f2c14e)',
    '10': 'linear-gradient(135deg,#c4372c,#ff8a7a)',
    '11': 'linear-gradient(135deg,#3d7edb,#3c9a6a)',
    '12': 'linear-gradient(135deg,#fff,#444)',
    '13': 'linear-gradient(135deg,#fff6df,#d9c39a)',
    '14': 'linear-gradient(135deg,#6d7c92,#c9d4e2)',
    '15': 'linear-gradient(135deg,#6d7c92,#c9d4e2)',
    '16': 'linear-gradient(135deg,#e24b3b,#b7a196)',
    '17': 'linear-gradient(135deg,#e24b3b,#3d7edb)',
    '18': 'linear-gradient(135deg,#3d7edb,#7eb6e8)',
    '19': 'linear-gradient(135deg,#3d7edb,#b7a196)',
    '20': 'linear-gradient(135deg,#e24b3b,#f2c14e)',
    '21': 'linear-gradient(135deg,#3c9a6a,#f2c14e)',
    '22': 'linear-gradient(135deg,#f2c14e,#6d7c92)',
    '23': 'linear-gradient(135deg,#7dbe57,#2f6f62)',
    '24': 'linear-gradient(135deg,#f08a2a,#f6d7b0)',
    '25': 'linear-gradient(135deg,#9fd0ef,#3d7edb)',
    '26': 'linear-gradient(135deg,#e24b3b,#3c9a6a)',
    '27': 'linear-gradient(135deg,#f2c14e,#2a221c)',
    '28': 'linear-gradient(135deg,#ff6b57,#9b1d2e)',
    '29': 'linear-gradient(135deg,#87b86a,#f2c14e)',
    '30': 'linear-gradient(135deg,#ff6b57,#c23a2e)',
    '31': 'linear-gradient(135deg,#b9ddf5,#f6e7c1)',
    '32': 'linear-gradient(135deg,#c9844a,#6b4a2e)',
    '33': 'linear-gradient(135deg,#e24b3b,#f2c14e,#3d7edb)',
    '34': 'linear-gradient(135deg,#7b5ea7,#f2c14e)',
    '35': 'linear-gradient(135deg,#3c9a6a,#3d7edb)',
    '36': 'linear-gradient(135deg,#e24b3b 0%,#f2c14e 40%,#3c9a6a 70%,#3d7edb 100%)'
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function swatchBg(ep) {
    if (ep.series === 'wanzhuan-secai') {
      return WANZHUAN_BG[pad(ep.no)] || M.colorHex(ep);
    }
    return M.colorHex(ep);
  }

  function card(ep, unit) {
    var href = 'play.html?id=' + encodeURIComponent(ep.id);
    var title = M.zhTitle(ep) || (M.colorName(ep) || '');
    var en = M.enTitle(ep);
    var cover = ep.cover || ep.poster || '';
    var label = '第 ' + pad(ep.no) + ' ' + (ep.unit || unit || '集');
    var color = M.colorName(ep);
    if (color && ep.series === 'mimi-songs') label += ' · ' + color;
    var dur = ep.duration ? M.fmtDuration(ep.duration) : '';
    var img = cover
      ? '<img alt="" data-media="' + cover + '"'
      : '';
    var locked = !!(M.memberLocked && M.memberLocked(ep));
    var enHtml = (en && en !== title) ? '<p class="en-sub">' + escapeHtml(en) + '</p>' : '';
    return (
      '<a class="card" href="' + href + '">' +
        '<div class="swatch" style="background:' + swatchBg(ep) + '">' +
          img +
          (locked ? '<span class="lock-badge">🔒 会员</span>' : '') +
          '<span class="num">' + pad(ep.no) + '</span>' +
        '</div>' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        enHtml +
        '<div class="meta"><span>' + escapeHtml(label) + '</span>' +
          (locked
            ? '<span class="locked">' + (dur ? dur + ' · ' : '') + '需要兑换码</span>'
            : '<span class="ready">' + (dur ? dur + ' · 可以播放' : '可以播放') + '</span>') +
        '</div>' +
      '</a>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var root = document.getElementById('catalog');
  if (!root) return;

  var html = '';
  M.liveSeries(catalog).forEach(function (series) {
    var copy = M.seriesCopy(series);
    var eps = M.episodesOf(catalog, series.id);
    html += '<h2>' + escapeHtml(copy.title) + '</h2>';
    var lockedCount = eps.filter(function (e) { return M.memberLocked && M.memberLocked(e); }).length;
    var tail = lockedCount
      ? '，前 ' + (eps.length - lockedCount) + ' ' + escapeHtml(copy.unit) + '免费，其余输入兑换码观看。'
      : '，全部可以打开。';
    html += '<p class="lead">' + escapeHtml(copy.desc) +
      ' 共 ' + eps.length + ' ' + escapeHtml(copy.unit) + tail + '</p>';
    html += '<div class="grid">';
    eps.forEach(function (ep) { html += card(ep, copy.unit); });
    html += '</div>';
  });
  root.innerHTML = html;

  var imgs = root.querySelectorAll('img[data-media]');
  var paths = [];
  imgs.forEach(function (img) { paths.push(img.getAttribute('data-media')); });
  if (!paths.length) return;
  M.resolve(paths).then(function () {
    imgs.forEach(function (img) {
      var path = img.getAttribute('data-media');
      var u = M.mediaUrl(path);
      if (u) img.src = u;
      if (M.watchMedia) M.watchMedia(img, path, { removeOnFail: true });
    });
  }).catch(function (err) {
    console.warn('media resolve failed', err);
  });

})();
