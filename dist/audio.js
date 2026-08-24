"use strict";

/* 试听音频引擎：加载项目内钢琴采样（88 键 Close Grand 采样转出的 WebM/Opus，
 * WebView2/Chromium 可解码 Opus；OGG/Vorbis 在 Chromium 中不支持，故转用 WebM）。
 * 音符编号协议与主程序一致：1~7 低八度 / 8~14 中八度 / 15~21 高八度。
 * 试听音高约定：简谱 C 大调，中八度 1 = C4（MIDI 60），低= C3 起，高 = C5 起。
 * 采样加载失败时用振荡器发简音兜底，保证预览始终可用。 */

const AUDIO = (() => {
  const SAMPLES = 21;
  let ctx = null;
  let master = null;
  const buffers = new Map(); // note id → AudioBuffer | null
  let loadPromise = null;
  let activeSources = []; // 当前发声节点，每拍先停再响

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 大调音阶半音间隔（do re mi fa sol la ti）
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];

  // 音符编号 → MIDI 音高（简谱 1=C，中八度 1 = C4）
  function noteMidi(id) {
    if (id >= 1 && id <= 7) return 48 + MAJOR[id - 1]; // 低八度 1=C3
    if (id >= 8 && id <= 14) return 60 + MAJOR[id - 8]; // 中八度 1=C4
    if (id >= 15 && id <= 21) return 72 + MAJOR[id - 15]; // 高八度 1=C5
    return 0;
  }

  async function load() {
    const c = ensureCtx();
    await Promise.all(
      Array.from({ length: SAMPLES }, (_, i) => i + 1).map(async (id) => {
        try {
          const res = await fetch(`samples/n${id}.webm`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arr = await res.arrayBuffer();
          buffers.set(id, await c.decodeAudioData(arr));
        } catch {
          buffers.set(id, null); // 该音加载失败 → 播放时振荡器兜底
        }
      })
    );
  }

  function ensureLoaded() {
    if (!loadPromise) loadPromise = load();
    return loadPromise;
  }

  // 无采样兜底：短促简音
  function playOsc(id) {
    const midi = noteMidi(id);
    if (!midi) return;
    const c = ensureCtx();
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.5);
  }

  // 快速淡出再停，避免音符被硬切时的爆音
  function stopActive() {
    for (const { src, g } of activeSources) {
      try {
        const t = ctx.currentTime;
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        src.stop(t + 0.03);
      } catch {
        try {
          src.stop();
        } catch {
          /* 已停止 */
        }
      }
    }
    activeSources = [];
  }

  // 播放一拍：先停掉上一拍，再同时播放该拍所有音符（空和弦 = 休止）
  function playChord(ids) {
    const c = ensureCtx();
    stopActive();
    for (const id of ids) {
      if (!(id >= 1 && id <= SAMPLES)) continue;
      const buf = buffers.get(id);
      if (buf) {
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.value = 1;
        src.connect(g).connect(master);
        src.start();
        activeSources.push({ src, g });
      } else {
        playOsc(id);
      }
    }
  }

  function stopAll() {
    stopActive();
  }

  return { ensureLoaded, playChord, stopAll };
})();
