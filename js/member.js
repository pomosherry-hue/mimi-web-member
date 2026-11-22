// 兑换码（会员集）：设备号、本地保存的兑换码、调用云函数 redeem 换临时播放链接。
(function (w) {
  var LS_CODE = 'mimi_redeem_code';
  var LS_DEVICE = 'mimi_device_id';
  var urlCache = {}; // episodeId -> { urls, exp }
  var appPromise = null;

  function cfg() {
    var c = w.MIMI_CONFIG || {};
    return c.MEMBER || {};
  }

  function enabled() {
    return !!cfg().ENABLED && !(w.MIMI_CONFIG && w.MIMI_CONFIG.OFFLINE);
  }

  function isLocked(ep) {
    if (!ep || !enabled()) return false;
    var series = cfg().SERIES || ['mimi-songs'];
    if (series.indexOf(ep.series) === -1) return false;
    var free = Number(cfg().FREE_EPISODES);
    if (!(free >= 0)) free = 3;
    return Number(ep.no) > free;
  }

  function ls(k, v) {
    try {
      if (v === undefined) return w.localStorage.getItem(k) || '';
      if (v === null) w.localStorage.removeItem(k);
      else w.localStorage.setItem(k, v);
    } catch (e) {}
    return '';
  }

  function randomId() {
    var a = new Uint8Array(16);
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return 'w' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function deviceId() {
    var id = ls(LS_DEVICE);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      ls(LS_DEVICE, id);
    }
    return id;
  }

  function normalize(raw) {
    return String(raw || '')
      .replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function getCode() { return ls(LS_CODE); }
  function setCode(c) { ls(LS_CODE, normalize(c)); }
  function clearCode() { ls(LS_CODE, null); urlCache = {}; }

  function getApp() {
    if (appPromise) return appPromise;
    appPromise = new Promise(function (resolve, reject) {
      var sdk = w.cloudbase;
      var env = w.MIMI_CONFIG && w.MIMI_CONFIG.CLOUD_ENV;
      if (!sdk || !env) return reject(new Error('NO_SDK'));
      var app = sdk.init({ env: env });
      var auth = app.auth({ persistence: 'local' });
      Promise.resolve(auth.getLoginState ? auth.getLoginState() : null).then(function (st) {
        if (st) return st;
        if (auth.signInAnonymously) return auth.signInAnonymously();
        if (auth.anonymousAuthProvider) return auth.anonymousAuthProvider().signIn();
        throw new Error('NO_ANON');
      }).then(function () { resolve(app); }, reject);
    });
    appPromise.catch(function () { appPromise = null; });
    return appPromise;
  }

  // 调云函数。返回云函数的结果对象（ok / code / message / urls ...）
  function call(code, episodeId) {
    return getApp().then(function (app) {
      return app.callFunction({
        name: cfg().REDEEM_FN || 'redeem',
        data: { code: code, deviceId: deviceId(), episodeId: episodeId || '' }
      });
    }).then(function (res) {
      var r = (res && res.result) || {};
      if (r.ok && r.urls && episodeId) {
        // 提前 60 秒当作过期
        urlCache[episodeId] = { urls: r.urls, exp: (r.urlExpiresAt || (Date.now() + 540000)) - 60000 };
      }
      return r;
    }, function (err) {
      console.warn('redeem call failed', err);
      return { ok: false, code: 'NETWORK', message: '连不上服务器，请检查网络后再试' };
    });
  }

  // 拿某一集的会员链接；force = true 时忽略缓存（链接过期后用）
  function urlsFor(ep, force) {
    var code = getCode();
    if (!code) return Promise.resolve({ ok: false, code: 'NO_CODE' });
    var c = urlCache[ep.id];
    if (!force && c && c.exp > Date.now()) return Promise.resolve({ ok: true, urls: c.urls, urlExpiresAt: c.exp + 60000, cached: true });
    return call(code, ep.id).then(function (r) {
      // 码失效（停用、过期、设备满、被删）时清掉本地的码，让用户重新输入
      if (!r.ok && /^(NOT_FOUND|DISABLED|EXPIRED|DEVICE_LIMIT|BAD_FORMAT)$/.test(r.code)) clearCode();
      return r;
    });
  }

  // 用户输入兑换码
  function redeem(raw, ep) {
    var code = normalize(raw);
    if (!code) return Promise.resolve({ ok: false, code: 'EMPTY_CODE', message: '请输入兑换码' });
    return call(code, ep ? ep.id : '').then(function (r) {
      if (r.ok) setCode(code);
      return r;
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 播放页上的锁 + 输入框。onUnlocked(result) 在兑换成功后调用。
  function renderLock(container, ep, onUnlocked, presetMsg) {
    var free = Number(cfg().FREE_EPISODES) || 3;
    container.innerHTML =
      '<div class="lock-panel">' +
        '<div class="lock-icon" aria-hidden="true">🔒</div>' +
        '<h2>这一集需要兑换码</h2>' +
        '<p>前 ' + free + ' 集免费。输入兑换码后，这台设备上就能看全部会员集。</p>' +
        '<form class="redeem-form" autocomplete="off">' +
          '<input class="redeem-input" name="code" inputmode="latin" autocapitalize="characters" spellcheck="false" ' +
            'placeholder="MW-XXXX-XXXX-XXXX" maxlength="24" aria-label="兑换码" />' +
          '<button class="bigbtn" type="submit">解锁</button>' +
        '</form>' +
        '<div class="redeem-msg" role="status"></div>' +
        (cfg().BUY_TEXT ? '<p class="lock-buy">' + escapeHtml(cfg().BUY_TEXT) + '</p>' : '') +
      '</div>';
    var form = container.querySelector('form');
    var input = container.querySelector('.redeem-input');
    var msg = container.querySelector('.redeem-msg');
    var btn = container.querySelector('button');
    if (presetMsg) msg.textContent = presetMsg;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      btn.disabled = true;
      msg.textContent = '正在核对…';
      redeem(input.value, ep).then(function (r) {
        btn.disabled = false;
        if (r.ok) {
          msg.textContent = '解锁成功！';
          onUnlocked(r);
        } else {
          var t = r.message || '兑换失败，请再试一次';
          if (r.code === 'RATE_LIMITED' && r.retryAfter) t += '（约 ' + Math.ceil(r.retryAfter / 60) + ' 分钟后）';
          msg.textContent = t;
        }
      });
    });
  }

  w.MIMI_MEMBER = {
    enabled: enabled,
    isLocked: isLocked,
    deviceId: deviceId,
    getCode: getCode,
    setCode: setCode,
    clearCode: clearCode,
    normalize: normalize,
    urlsFor: urlsFor,
    redeem: redeem,
    renderLock: renderLock
  };
})(window);
