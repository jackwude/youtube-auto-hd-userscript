// ==UserScript==
// @name         YouTube Auto HD + Cinema (Stay2)
// @namespace    https://github.com/iamfux
// @version      1.2.0
// @description  Auto-select YouTube quality by FPS (60/50/30), prefer enhanced bitrate / super resolution, force cinema mode, skip vertical videos. DIY replacement for the broken "Auto HD + FPS" Safari extension. Uses YouTube player internal API + DOM fallback.
// @author       iamfux
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // ======================== 配置 ========================
  const CONFIG = {
    // 按 FPS 设定目标清晰度（数字 = 该档位最大分辨率）
    qualityByFps: {
      60: 1080,   // 60fps 视频 → 不超过 1080p
      50: 1080,   // 50fps 视频 → 不超过 1080p
      30: 2160    // 30fps 视频 → 不超过 4K
    },
    // 优先选择增强比特率（Premium 专属，如 "1080p Premium"）
    preferEnhancedBitrate: true,
    // 优先选择超分辨率（Premium 专属）
    preferSuperResolution: true,
    // 强制影院模式（cinema/theater）
    alwaysCinema: true,
    // 竖屏视频跳过（不强制 cinema，也不强制清晰度）
    excludeVertical: true,
    // 点击重试上限 / 间隔
    maxAttempts: 10,
    retryDelayMs: 400
  };

  // ======================== 工具 ========================
  const QUALITIES_ASC = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
  const QUALITY_MAX = QUALITIES_ASC[QUALITIES_ASC.length - 1];

  // YouTube 内部 API 的 quality 字符串映射
  const QUALITY_MAP = {
    4320: "highres",
    2160: "hd2160",
    1440: "hd1440",
    1080: "hd1080",
    720: "hd720",
    480: "large",
    360: "medium",
    240: "small",
    144: "tiny"
  };
  const QUALITY_TO_NUM = Object.fromEntries(
    Object.entries(QUALITY_MAP).map(([num, q]) => [q, Number(num)])
  );

  function getPlayerDiv(video) {
    if (!video) return null;
    return video.closest("#movie_player") || video.closest(".html5-video-player") || null;
  }

  function getVisibleVideo() {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (v.offsetWidth > 0 && v.offsetHeight > 0) return v;
    }
    return videos[0] || null;
  }

  function isVerticalVideo(video) {
    return video.clientWidth > 0 && video.clientWidth <= video.clientHeight;
  }

  // 提取清晰度标签里的 FPS（"2160p60" → 60；没有则 30）
  function extractFpsFromLabel(label) {
    const m = label.match(/[ps](\d+)/);
    return m ? Number(m[1]) : 30;
  }

  function getFpsStep(fps) {
    if (fps >= 60) return 60;
    if (fps >= 50) return 50;
    return 30;
  }

  // ======================== 清晰度自动选择（API 主路径） ========================
  function changeQualityViaPlayerAPI() {
    const video = getVisibleVideo();
    if (!video) return false;

    const player = getPlayerDiv(video);
    if (!player || typeof player.getAvailableQualityData !== "function" || typeof player.setPlaybackQualityRange !== "function") {
      return false;
    }

    const qualityData = player.getAvailableQualityData();
    if (!Array.isArray(qualityData) || qualityData.length === 0) return false;

    // 检测 FPS：从带帧率标签的选项提取（2160p60 → 60）
    const fpsLabel = qualityData.find(q => /[ps]\d+/.test(q.qualityLabel || "") && q.isPlayable !== false)?.qualityLabel || "";
    const fpsVideo = fpsLabel ? extractFpsFromLabel(fpsLabel) : 30;
    const fpsStep = getFpsStep(fpsVideo);

    const targetMax = CONFIG.qualityByFps[fpsStep] ?? QUALITY_MAX;

    const playable = qualityData.filter(q => q.isPlayable !== false);
    if (playable.length === 0) return false;

    const eligible = playable
      .map(q => ({ q, num: QUALITY_TO_NUM[q.quality] ?? 0 }))
      .filter(x => x.num > 0 && x.num <= targetMax)
      .sort((a, b) => b.num - a.num);

    if (eligible.length === 0) return false;

    const best = eligible[0].q.quality;
    const current = player.getPlaybackQuality ? player.getPlaybackQuality() : null;
    if (current === best) return true;

    player.setPlaybackQualityRange(best, best);
    return true;
  }

  // ======================== 清晰度自动选择（DOM 菜单兜底） ========================
  function openQualityMenuViaDOM(video) {
    const player = getPlayerDiv(video);
    if (!player) return false;

    const settingsBtn = player.querySelector(".ytp-settings-button");
    if (!settingsBtn) return false;

    const isOpen = settingsBtn.getAttribute("aria-expanded") === "true" || settingsBtn.getAttribute("aria-pressed") === "true";
    if (!isOpen) settingsBtn.click();

    const items = player.querySelectorAll(".ytp-menuitem");
    let qualityRow = null;
    for (const item of items) {
      const text = item.textContent || "";
      if (/\d{3,4}/.test(text) && !/字幕|播放速度|休眠/.test(text)) {
        qualityRow = item;
        break;
      }
    }

    if (!qualityRow) return false;
    qualityRow.click();
    return true;
  }

  function applyQualityViaDOM() {
    const video = getVisibleVideo();
    if (!video) return;

    const player = getPlayerDiv(video);
    if (!player) return;

    if (!openQualityMenuViaDOM(video)) return;

    const items = player.querySelectorAll(".ytp-menuitem");
    const options = [];
    for (const item of items) {
      const text = (item.textContent || "").trim();
      const m = text.match(/^(\d{3,4})/);
      if (!m) continue;
      const num = Number(m[1]);
      if (!QUALITIES_ASC.includes(num)) continue;

      const isPremium = /premium/i.test(text) || !!item.querySelector(".ytp-premium-label");
      const isSuperRes = /super resolution/i.test(text) || /sr/i.test(text);
      options.push({ element: item, num, text, isPremium, isSuperRes });
    }

    if (options.length === 0) return;

    let fps = 30;
    const fpsItem = options.find(o => /[ps]\d+/.test(o.text));
    if (fpsItem) fps = extractFpsFromLabel(fpsItem.text);
    const fpsStep = getFpsStep(fps);
    const targetMax = CONFIG.qualityByFps[fpsStep] ?? QUALITY_MAX;

    const eligible = options.filter(opt => {
      if (opt.num > targetMax) return false;
      if (opt.isPremium && !CONFIG.preferEnhancedBitrate) return false;
      if (opt.isSuperRes && !CONFIG.preferSuperResolution) return false;
      return true;
    });

    if (eligible.length === 0) return;

    const sorted = [...eligible].sort((a, b) => {
      if (a.num !== b.num) return b.num - a.num;
      return (b.isPremium || b.isSuperRes ? 1 : 0) - (a.isPremium || a.isSuperRes ? 1 : 0);
    });
    const target = sorted[0];

    if (target.element.getAttribute("aria-checked") === "true") return;

    target.element.click();
  }

  let qualityTimer = null;

  function applyQuality() {
    if (qualityTimer) clearTimeout(qualityTimer);
    let attemptsLeft = CONFIG.maxAttempts;

    function attempt() {
      const video = getVisibleVideo();
      if (!video) return;

      if (CONFIG.excludeVertical && isVerticalVideo(video)) return;

      const viaApi = changeQualityViaPlayerAPI();
      if (viaApi) return;

      applyQualityViaDOM();

      if (attemptsLeft > 0) {
        attemptsLeft--;
        qualityTimer = setTimeout(attempt, CONFIG.retryDelayMs);
      }
    }

    qualityTimer = setTimeout(attempt, 0);
  }

  // ======================== Cinema 模式 ========================
  function getCurrentViewMode() {
    const flexy = document.querySelector("ytd-watch-flexy");
    if (flexy) return flexy.hasAttribute("theater") ? 1 : 0;
    const m = document.cookie.match(/wide=([10])/);
    return m ? Number(m[1]) : 0;
  }

  function findSizeToggle(video) {
    const player = getPlayerDiv(video);
    if (!player) return null;
    return (
      player.querySelector(".ytp-size-button") ||
      player.querySelector(".ytp-size-toggle-large") ||
      player.querySelector(".ytp-size-toggle-small")
    );
  }

  let resizeTimer = null;

  function resizePlayerIfNeeded() {
    if (resizeTimer) clearTimeout(resizeTimer);
    let attemptsLeft = CONFIG.maxAttempts;

    function attempt() {
      const video = getVisibleVideo();
      if (!video) return;

      const isVertical = CONFIG.excludeVertical && isVerticalVideo(video);
      const targetMode = (CONFIG.alwaysCinema && !isVertical) ? 1 : 0;
      if (getCurrentViewMode() === targetMode) return;

      const toggle = findSizeToggle(video);
      if (!toggle) return;

      toggle.click();
      attemptsLeft--;
      if (attemptsLeft > 0) {
        resizeTimer = setTimeout(attempt, CONFIG.retryDelayMs);
      }
    }

    resizeTimer = setTimeout(attempt, 0);
  }

  // ======================== 事件绑定 ========================
  let boundVideo = null;

  function runAll() {
    resizePlayerIfNeeded();
    applyQuality();
  }

  function setupVideoListener(video) {
    if (boundVideo === video) return;
    boundVideo = video;
    video.removeEventListener("canplay", runAll);
    video.addEventListener("canplay", runAll);
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      runAll();
    }
  }

  function attachToVideo() {
    const video = getVisibleVideo();
    if (video) {
      setupVideoListener(video);
      return true;
    }
    return false;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") runAll();
  });

  document.addEventListener("yt-navigate-finish", () => {
    boundVideo = null;
    attachToVideo();
    runAll();
  });

  const observer = new MutationObserver(() => {
    if (attachToVideo()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });

  attachToVideo();
  runAll();
})();
