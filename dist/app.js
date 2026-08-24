"use strict";

/* 主编辑器：多谱面管理 + 曲谱网格编辑（支持和弦）+ 播放控制 */

const $ = (id) => document.getElementById(id);
const cur = () => store.songs[store.current];

let store = null;
const state = { selected: 0 };
// 播放中禁止编辑：播放（含悬浮窗发起）时置 true，play-end / 停止时置 false
let playing = false;

/* ============ 渲染 ============ */

function beatHtml(ids) {
  if (!ids || !ids.length) return WM.noteHtml(0);
  return `<span class="chord">${ids.map((n) => WM.noteHtml(n)).join("")}</span>`;
}

function renderAll() {
  renderTabs();
  renderToolbar();
  renderGrid();
}

function renderTabs() {
  const root = $("song-tabs");
  root.innerHTML = "";
  store.songs.forEach((song, i) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (i === store.current ? " active" : "");
    chip.innerHTML = `<span class="chip-name"></span><button class="chip-del" title="删除该谱面">×</button>`;
    chip.querySelector(".chip-name").textContent = song.name;
    chip.querySelector(".chip-name").addEventListener("click", async () => {
      if (i === store.current) return;
      if (!canEdit()) return;
      store = await WM.api.selectSong(i);
      state.selected = 0;
      renderAll();
    });
    chip.querySelector(".chip-name").addEventListener("dblclick", async () => {
      if (!canEdit()) return;
      const name = prompt("谱面名称", song.name);
      if (name && name.trim()) {
        song.name = name.trim().slice(0, 30);
        await commit();
      }
    });
    chip.querySelector(".chip-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!canEdit()) return;
      if (store.songs.length <= 1) {
        setStatus("至少保留一个谱面", true);
        return;
      }
      if (!confirm(`删除谱面「${song.name}」？`)) return;
      store.songs.splice(i, 1);
      await commit(); // Rust 端保证至少保留一个谱面
    });
    root.appendChild(chip);
  });
  const add = document.createElement("button");
  add.className = "chip add";
  add.textContent = "＋ 新谱面";
  add.addEventListener("click", async () => {
    if (!canEdit()) return;
    store.songs.push({ name: `曲谱 ${store.songs.length + 1}`, bpm: 120, notes: new Array(32).fill(null).map(() => []) });
    store.current = store.songs.length - 1;
    state.selected = 0;
    await commit();
  });
  root.appendChild(add);
}

function renderToolbar() {
  $("bpm-input").value = cur().bpm;
  $("beats-input").value = cur().notes.length;
  $("countdown-input").value = store.countdown;
}

function renderGrid() {
  const root = $("score-grid");
  root.innerHTML = "";
  cur().notes.forEach((ids, i) => {
    const cell = document.createElement("div");
    cell.className =
      "cell" + (i === state.selected ? " selected" : "") + (!ids.length ? " rest" : "");
    cell.dataset.index = i;
    cell.innerHTML = `<span class="beat-no">${i + 1}</span>${beatHtml(ids)}`;
    cell.addEventListener("click", () => {
      state.selected = i;
      renderGrid();
    });
    root.appendChild(cell);
  });
}

function renderPalette() {
  const root = $("palette");
  root.innerHTML = "";
  for (const row of WM.KEY_ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "palette-row";
    rowEl.innerHTML = `<span class="row-label">${row.label}</span>`;
    [...row.keys].forEach((k, i) => {
      const id = row.base + i;
      const btn = document.createElement("button");
      btn.className = "note-btn";
      btn.innerHTML = `${WM.noteHtml(id)}<span class="key">${k}</span>`;
      btn.title = `音符 ${((id - 1) % 7) + 1}（${row.label}）`;
      btn.addEventListener("click", () => toggleNote(id));
      rowEl.appendChild(btn);
    });
    root.appendChild(rowEl);
  }
  const restRow = document.createElement("div");
  restRow.className = "palette-row";
  restRow.innerHTML = `<span class="row-label"></span>`;
  const rest = document.createElement("button");
  rest.className = "note-btn rest";
  rest.innerHTML = `${WM.noteHtml(0)}<span class="key">休止</span>`;
  rest.title = "清空选中拍";
  rest.addEventListener("click", () => {
    if (!canEdit()) return;
    cur().notes[state.selected] = [];
    commit();
  });
  restRow.appendChild(rest);
  root.appendChild(restRow);
}

/* ============ 编辑 ============ */

async function commit() {
  try {
    store = await WM.api.saveStore(store);
  } catch (err) {
    setStatus(`保存失败：${err}`, true);
  }
  renderAll();
}

// 在选中拍上添加/移除音符（支持和弦）
function toggleNote(id) {
  if (!canEdit()) return;
  const beat = cur().notes[state.selected];
  const at = beat.indexOf(id);
  if (at >= 0) beat.splice(at, 1);
  else if (beat.length < 8) beat.push(id);
  commit();
}

function setBeats(n) {
  if (!canEdit()) return;
  n = Math.max(1, Math.min(WM.MAX_BEATS, Math.floor(n) || 1));
  const notes = cur().notes.slice(0, n);
  while (notes.length < n) notes.push([]);
  cur().notes = notes;
  state.selected = Math.min(state.selected, n - 1);
  commit();
}

function setStatus(text, warn = false) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (warn ? " warn" : "");
}

/* ============ 播放 ============ */

function setPlaying(on) {
  playing = on;
  $("btn-play").disabled = on;
  $("btn-preview").disabled = on;
  $("btn-stop").disabled = !on;
  setEditingEnabled(!on);
  if (!on) clearHighlight();
}

// 播放时禁止编辑：统一拦截编辑操作并提示
function canEdit() {
  if (playing) {
    setStatus("播放中禁止编辑，请先停止", true);
    return false;
  }
  return true;
}

// 禁用/恢复所有编辑控件（音符面板、工具栏输入、谱面栏）
function setEditingEnabled(enabled) {
  document.querySelectorAll(".note-btn").forEach((b) => (b.disabled = !enabled));
  ["beats-input", "apply-beats", "bpm-input", "countdown-input", "btn-import", "import-file"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !enabled;
  });
  $("song-tabs").classList.toggle("locked", !enabled);
}

function highlightBeat(i, scroll = true) {
  document.querySelectorAll(".cell.playing").forEach((el) => el.classList.remove("playing"));
  const cell = document.querySelector(`.cell[data-index="${i}"]`);
  if (cell) {
    cell.classList.add("playing");
    // 试听时不强制滚动到当前拍，避免画面跟随跳动；真实播放保持跟随
    if (scroll) cell.scrollIntoView({ block: "nearest" });
  }
}

function clearHighlight() {
  document.querySelectorAll(".cell.playing").forEach((el) => el.classList.remove("playing"));
}

async function play() {
  try {
    setPlaying(true);
    if (WM.isTauri && (await WM.api.gameRunning())) {
      const ok = await WM.api.focusGame();
      setStatus(ok ? "检测到游戏进程，已切换过去" : "游戏运行中，请手动切换到游戏窗口");
    } else {
      setStatus(WM.isTauri ? "倒计时…请切换到目标游戏窗口" : "预览模式：仅高亮不模拟按键");
    }
    await WM.api.playCurrent();
  } catch (err) {
    setPlaying(false);
    setStatus(`播放失败：${err}`, true);
  }
}

async function stop() {
  previewAborted = true; // 终止前端试听
  await WM.api.stop(); // 终止真实播放（Rust）
}

/* ============ 试听（音频预览） ============ */

let previewAborted = false;
let previewActive = false;

async function preview() {
  if (playing) return;
  previewAborted = false;
  setPlaying(true);
  previewActive = true;
  setStatus("加载采样…");
  try {
    await AUDIO.ensureLoaded();
  } catch {
    /* 采样加载失败则全部走振荡器兜底 */
  }
  if (!previewActive || previewAborted) {
    // 加载期间被停止，或被真实播放顶替
    if (previewActive) {
      previewActive = false;
      setPlaying(false);
      setStatus("已停止");
    }
    return;
  }
  setStatus("试听中…");
  const song = cur();
  const beat = 60000 / Math.max(20, Math.min(600, song.bpm));
  for (let i = 0; i < song.notes.length; i++) {
    if (!previewActive || previewAborted) break;
    highlightBeat(i, false); // 试听不强制滚动到当前拍
    AUDIO.playChord(song.notes[i]);
    const start = performance.now();
    while (performance.now() - start < beat) {
      if (!previewActive || previewAborted) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  AUDIO.stopAll();
  if (previewActive) {
    previewActive = false;
    setPlaying(false);
    setStatus(previewAborted ? "已停止" : "试听结束");
  }
}

/* ============ 导入导出（针对当前谱面，兼容旧版单音格式） ============ */

function exportSong() {
  const { name, bpm, notes } = cur();
  const blob = new Blob([JSON.stringify({ name, bpm, notes }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`已导出「${name}」`);
}

function importSong(file) {
  if (!canEdit()) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(String(reader.result));
      if (!s || !Array.isArray(s.notes) || s.notes.length === 0) throw new Error("bad");
      store.songs.push({
        name: (s.name || file.name.replace(/\.json$/i, "")).slice(0, 30),
        bpm: Math.max(20, Math.min(600, parseInt(s.bpm, 10) || 120)),
        notes: s.notes.slice(0, WM.MAX_BEATS).map(WM.normBeat),
      });
      store.current = store.songs.length - 1;
      state.selected = 0;
      commit();
      setStatus(`已导入「${cur().name}」`);
    } catch {
      setStatus("导入失败：曲谱格式不正确", true);
    }
  };
  reader.readAsText(file);
}

/* ============ 键盘输入 ============ */

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (playing) return; // 播放中禁止键盘编辑（方向键仅选中，不影响数据，一并禁用）
  const k = e.key.toUpperCase();
  if (WM.KEY_TO_NOTE[k] !== undefined) {
    e.preventDefault();
    toggleNote(WM.KEY_TO_NOTE[k]);
    return;
  }
  switch (e.key) {
    case "0":
    case " ":
      // 清空当前拍并前进（快速输入休止）
      e.preventDefault();
      cur().notes[state.selected] = [];
      if (state.selected < cur().notes.length - 1) state.selected++;
      commit();
      break;
    case "Delete":
    case "Backspace":
      e.preventDefault();
      cur().notes[state.selected] = [];
      commit();
      break;
    case "ArrowLeft":
      e.preventDefault();
      state.selected = Math.max(0, state.selected - 1);
      renderGrid();
      break;
    case "ArrowRight":
      e.preventDefault();
      state.selected = Math.min(cur().notes.length - 1, state.selected + 1);
      renderGrid();
      break;
  }
});

/* ============ 事件与初始化 ============ */

WM.on("countdown", (n) => {
  if (previewActive) {
    // 真实播放（可能由悬浮窗发起）开始，终止试听并移交播放权
    previewAborted = true;
    AUDIO.stopAll();
    previewActive = false;
  }
  if (!playing) setPlaying(true); // 悬浮窗等其他窗口发起的播放，同样禁用编辑
  if (n > 0) setStatus(`倒计时 ${n} 秒…`);
  else setStatus("正在播放…");
});
WM.on("play-progress", (i) => {
  if (previewActive) {
    previewAborted = true;
    AUDIO.stopAll();
    previewActive = false;
  }
  if (!playing) setPlaying(true);
  highlightBeat(i);
});
WM.on("play-end", (r) => {
  setPlaying(false);
  setStatus(r === 1 ? "已切屏，播放已停止" : "播放结束");
});
// 悬浮窗等其他窗口的修改实时同步
WM.on("store-updated", (s) => {
  store = s;
  renderAll();
});

/* ============ 退出确认（完全退出 / 最小化到托盘） ============ */

WM.on("exit-request", () => {
  $("exit-modal").classList.remove("hidden");
});

function hideExitModal() {
  $("exit-modal").classList.add("hidden");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("exit-modal").classList.contains("hidden")) {
    hideExitModal();
  }
});

/* ============ 游戏进程指示 ============ */

const GAME_POLL_MS = 3000;

function setGameIndicator(state, text) {
  const el = $("game-indicator");
  if (!el) return;
  el.className = "game-indicator" + (state ? ` ${state}` : "");
  el.textContent = `🎮 ${text}`;
}

async function updateGameIndicator() {
  if (!WM.isTauri) {
    setGameIndicator("off", "浏览器预览");
    return;
  }
  try {
    const running = await WM.api.gameRunning();
    setGameIndicator(running ? "on" : "off", running ? "游戏运行中" : "未检测到游戏");
  } catch {
    setGameIndicator("off", "检测失败");
  }
}

function bindToolbar() {
  $("btn-play").addEventListener("click", play);
  $("btn-preview").addEventListener("click", preview);
  $("btn-stop").addEventListener("click", stop);
  $("btn-overlay").addEventListener("click", () => WM.api.showOverlay());
  $("apply-beats").addEventListener("click", () => setBeats(parseInt($("beats-input").value, 10)));
  $("beats-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") setBeats(parseInt($("beats-input").value, 10));
  });
  $("bpm-input").addEventListener("change", () => {
    if (!canEdit()) return;
    cur().bpm = parseInt($("bpm-input").value, 10) || 120;
    commit();
  });
  $("countdown-input").addEventListener("change", () => {
    if (!canEdit()) return;
    store.countdown = parseInt($("countdown-input").value, 10) || 0;
    commit();
  });
  $("btn-export").addEventListener("click", exportSong);
  $("btn-import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importSong(e.target.files[0]);
    e.target.value = "";
  });
  $("btn-exit-full").addEventListener("click", async () => {
    hideExitModal();
    await WM.api.exitApp();
  });
  $("btn-exit-tray").addEventListener("click", async () => {
    hideExitModal();
    await WM.api.minimizeToTray();
  });
  $("btn-exit-cancel").addEventListener("click", hideExitModal);
}

(async () => {
  renderPalette();
  bindToolbar();
  store = await WM.api.getStore();
  renderAll();
  updateGameIndicator(); // 立即检测一次
  setInterval(updateGameIndicator, GAME_POLL_MS); // 周期性刷新（游戏前后台切换）
  if (!WM.isTauri) setStatus("预览模式（浏览器）：编辑可用，播放仅高亮不模拟按键", true);
})();
