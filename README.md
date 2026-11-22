# 咪咪色彩英语 · 会员版（兑换码）测试站

小猫咪咪陪孩子认颜色、学英语。前 3 集免费，第 4 集起输入兑换码观看；「玩转色彩」36 课全部免费。

## 网址

**https://pomosherry-hue.github.io/mimi-web-member/**

扫码打开：

<img src="qr.png" alt="咪咪色彩英语 会员版 网址二维码" width="240">

`qr.png` 就是这个网址的二维码。

## 说明

- 这是会员版**测试站**。兑换码要等云开发那边设置好（见 [SETUP.md](SETUP.md)）才能用。
- 第 4–13 集的视频不放在这个仓库里，只通过云函数 `redeem` 发 10 分钟有效的临时链接播放。
- 封面、单词卡和第 1–3 集优先从腾讯云存储加载，打不开或约 6 秒没出来时改用本站的备份。

## 文件

- `index.html` 首页目录；`play.html` 播放页（单词卡、歌词、兑换码输入）
- `js/member.js` 兑换码；`js/config.js` 配置（媒体地址、免费集数、云函数名）
- `cloudfunctions/redeem/` 兑换码云函数
- `tools/gen_codes.py` 生成兑换码（输出在 `tools/out/`，不提交）
- `SETUP.md` 上线步骤（云开发控制台怎么设置、怎么卖码）
- `tests/` 本地测试：`bash tests/run.sh`
