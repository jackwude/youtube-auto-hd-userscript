# YouTube Auto HD + Cinema (Stay2)

DIY 替代失效的 "Auto HD + FPS for YouTube" Safari 扩展。自动按 FPS 选择清晰度、优先增强比特率/超分辨率、强制影院模式、竖屏豁免。

## 安装（Stay2）

1. 打开 Stay2 → **+ 添加用户脚本** → **通过链接**
2. 粘贴以下链接（**必须是 raw 链接**，不是仓库主页）：

```
https://raw.githubusercontent.com/jackwude/youtube-auto-hd-userscript/main/youtube-auto-hd.user.js
```

3. 确认启用，打开 YouTube 测试

## 更新

- Stay2 里重新导入上面的链接，或检查脚本更新
- 脚本包含 `@updateURL` / `@downloadURL`，Stay2 会自动识别更新源

## 功能

| 功能 | 默认值 |
|---|---|
| 60fps 视频 → 不超过 1080p | ✅ |
| 50fps 视频 → 不超过 1080p | ✅ |
| 30fps 视频 → 不超过 4K (2160p) | ✅ |
| 增强比特率优先（Premium） | ✅ |
| 超分辨率优先（Premium） | ✅ |
| 强制影院模式（cinema） | ✅ |
| 竖屏视频豁免 | ✅ |

## 配置

编辑脚本顶部 `CONFIG` 对象：

```js
qualityByFps: { 60: 1080, 50: 1080, 30: 2160 },
preferEnhancedBitrate: true,
preferSuperResolution: true,
alwaysCinema: true,
excludeVertical: true
```

## 技术说明

- 清晰度使用 YouTube 播放器内部 API（`setPlaybackQualityRange` + `getAvailableQualityData`），不依赖 DOM 菜单结构，抗 YouTube 改版
- API 不可用时回退 DOM 菜单法
- Cinema 用 `ytd-watch-flexy[theater]` 属性判断真实状态 + `.ytp-size-button` 点击
- FPS 从清晰度标签提取（`2160p60` → 60），无标签默认 30
- 找不到目标清晰度时自动降级到"不高于配置的最高可用档"

## 兼容性

Tampermonkey / Violentmonkey / Stay2 / Userscripts 等主流用户脚本管理器均兼容。
