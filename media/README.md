# 离线媒体文件夹

做 U 盘包时，把云存储里的文件按原来的路径放到这个 `media/` 目录下，并把 `js/config.js` 里的 `MEDIA_BASE` 改成空字符串 `''`。

目录要和 `data/catalog.json` 里的路径一致，例如：

```
media/episodes/01-red/red_episode1_final.mp4
media/episodes/01-red/thumbs/frame02.jpg
media/episodes/01-red/thumbs/frame03.jpg
media/series/wanzhuan-secai/01/lesson-01.mp4
media/series/wanzhuan-secai/01/cover.jpg
```

封面、单词卡图片、可选的横屏视频（`videoWide`）也请一起拷贝，这样离线打开时图片和视频都能显示。

不要把视频提交到 Git。这个文件夹只在做离线包时使用。
