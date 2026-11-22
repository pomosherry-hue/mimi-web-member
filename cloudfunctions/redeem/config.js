// 网页兑换码云函数配置。改完后在云开发控制台重新部署 redeem。
// 这里没有任何密钥；云函数在云开发里运行时自动带管理员身份。
module.exports = {
  // 云存储 File ID 前缀（和网站 js/config.js 的 MEDIA_PREFIX 一样，不是密钥）
  MEDIA_PREFIX: 'cloud://cloud1-d2guejnqud92f5860.636c-cloud1-d2guejnqud92f5860-1537604764/',

  // 会员视频在云存储里的目录。
  // ''        = 就用现在的 episodes/04-green/... 路径（推荐：小程序 member 云函数也用这些路径，不会坏），
  //             但必须把整个云存储权限改成「仅创建者可读写」，否则公开地址照样能看。
  // 'members/' = 另放一份到 members/episodes/04-green/...（需要再上传一遍，并配好存储安全规则）
  PRIVATE_DIR: '',

  // 兑换码集合名
  CODES_COLLECTION: 'redeem_codes',
  // 防爆破记录集合名
  ATTEMPTS_COLLECTION: 'redeem_attempts',

  // 一个码默认最多绑定几台设备（码里单独写了 maxDevices 就以码为准）
  DEFAULT_MAX_DEVICES: 2,

  // 临时播放链接有效期（秒）。过期后网页会自动再要一次。
  TEMP_URL_MAX_AGE: 600,

  // 防爆破：WINDOW_MINUTES 分钟内输错 MAX_FAILS 次，锁 LOCK_MINUTES 分钟
  // 按「匿名用户 / 设备 / IP」三个维度分别计数，任何一个被锁就拒绝。
  RATE_LIMIT: { MAX_FAILS: 8, WINDOW_MINUTES: 15, LOCK_MINUTES: 30 },

  // 会员集：集 id → 视频文件（相对路径，和 data/catalog.json 里的 video / videoWide 一致）
  // 第 1–3 集免费，不在这里。新增会员集时在这里加一行再重新部署。
  MEMBER_FILES: {
    '04-green': ['episodes/04-green/green_episode4_1080x1920_web.mp4'],
    '05-orange': ['episodes/05-orange/orange_episode5_1080x1920_web.mp4'],
    '06-purple': ['episodes/06-purple/purple_episode6_1080x1920_web.mp4'],
    '07-pink': ['episodes/07-pink/pink_episode7_1080p_web.mp4'],
    '08-brown': ['episodes/08-brown/brown_episode8_1920x1080_web.mp4'],
    '09-black': ['episodes/09-black/black_episode9_1920x1080_web.mp4'],
    '10-white': ['episodes/10-white/white_episode10_1920x1080_web.mp4'],
    '11-gray': ['episodes/11-gray/gray_episode11_1920x1080_web.mp4'],
    '12-review': ['episodes/12-review/review_episode12_1920x1080_web.mp4'],
    '13-mixing': ['episodes/13-mixing/mixing_episode13_1920x1080_web.mp4'],
  }
};
