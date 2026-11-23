// 网页版配置。媒体地址只在这里改。
//
// 在线预览：优先从腾讯云存储（MEDIA_BASE）加载 catalog 里的相对路径。
// 打不开或大约 6 秒还没出来时，自动改用 GitHub Pages 备份：
//   咪咪色彩英语 → PREVIEW_MEDIA_BASE（本仓库）
//   玩转色彩     → kids-color 站点
//
// 离线 U 盘：把 OFFLINE 改成 true，并把文件按 catalog 路径放到 media/。
//
// 云函数 webmedia 现在不用。
//
// 兑换码（草稿）：咪咪色彩英语前 FREE_EPISODES 集免费，后面的集要兑换码。
// 会员集的视频只通过云函数 redeem 换临时链接，不走公开地址，也没有 GitHub 备份。
// 云存储改成「仅创建者可读写」以后，把 MEDIA_BASE 改成 ''，图片和免费集就直接从 GitHub Pages 读。
window.MIMI_CONFIG = {
  MEDIA_BASE: 'https://cloud1-d2guejnqud92f5860.storage.tcloudbase.com/',
  PREVIEW_MEDIA_BASE: 'https://pomosherry-hue.github.io/mimi-web-member/',
  KIDS_COLOR_BASE: 'https://pomosherry-hue.github.io/kids-color/',
  MEDIA_STALL_MS: 6000,
  CLOUD_ENV: 'cloud1-d2guejnqud92f5860',
  MEDIA_PREFIX: 'cloud://cloud1-d2guejnqud92f5860.636c-cloud1-d2guejnqud92f5860-1537604764/',
  WEBMEDIA_FN: 'webmedia',
  OFFLINE: false,
  MEMBER: {
    ENABLED: true,
    FREE_EPISODES: 3,
    SERIES: ['mimi-songs'],   // 只锁咪咪色彩英语；玩转色彩仍然全部免费
    REDEEM_FN: 'redeem',
    PRICE_TEXT: '会员一年 ¥99',
    WECHAT_ID: 'Pomosherry',
    PAY_IMG: 'img/pay-wechat.jpg',
    CONTACT_IMG: 'img/wechat-contact.jpg'
  }
};
