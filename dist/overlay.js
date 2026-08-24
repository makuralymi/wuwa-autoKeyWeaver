"use strict";

/* 悬浮控制窗：开始 / 暂停 / 结束 / 倒计时调整 / 切换谱面（展示谱名） */

const $ = (id) => document.getElementById(id);
let store = null;
let playing = false;
let paused = false;

const cur = () => store.songs[store.current];

function render() {
  $("ov-name").textContent = cur().name;
  $("ov-idx").textContent = `${store.current + 1}/${store.songs.length}`;
  $("ov-cd").textContent = `${store.countdown}s`;
  $("ov-prev").disabled = store.current === 0;
  $("ov-next").disabled = store.current === store.songs.length - 1;
}

function setStatus(text) {
  $("ov-status").textContent = text;
  $("ov-status").classList.toggle("big", /^\d+$/.test(text));
}

function setPlayingUi(on) {
  playing = on;
  if (!on) paused = false;
  $("ov-play").disabled = on;
  $("ov-pause").disabled = !on;
  $("ov-stop").disabled = !on;
  $("ov-pause").textContent = paused ? "▶ 继续" : "⏸ 暂停";
}

async function refresh() {
  store = await WM.api.getStore();
  render();
}

/* ---------- 控制 ---------- */

$("ov-play").addEventListener("click", async () => {
  setPlayingUi(true);
  setStatus(store.countdown > 0 ? String(store.countdown) : "0");
  WM.api.playCurrent().catch((err) => {
    setPlayingUi(false);
    setStatus(`失败:${err}`.slice(0, 40));
  });
});

$("ov-pause").addEventListener("click", async () => {
  paused = !paused;
  await WM.api.pause(paused);
  $("ov-pause").textContent = paused ? "▶ 继续" : "⏸ 暂停";
  setStatus(paused ? "已暂停" : "继续播放");
});

$("ov-stop").addEventListener("click", async () => {
  await WM.api.stop();
});

$("ov-prev").addEventListener("click", async () => {
  store = await WM.api.selectSong(store.current - 1);
  setPlayingUi(false);
  setStatus("就绪");
  render();
});

$("ov-next").addEventListener("click", async () => {
  store = await WM.api.selectSong(store.current + 1);
  setPlayingUi(false);
  setStatus("就绪");
  render();
});

$("ov-cd-minus").addEventListener("click", async () => {
  store.countdown = Math.max(0, store.countdown - 1);
  store = await WM.api.saveStore(store);
  render();
});

$("ov-cd-plus").addEventListener("click", async () => {
  store.countdown = Math.min(60, store.countdown + 1);
  store = await WM.api.saveStore(store);
  render();
});

$("ov-close").addEventListener("click", () => WM.api.hideOverlay());

/* ---------- 播放事件 ---------- */

WM.on("countdown", (n) => {
  if (playing) setStatus(n > 0 ? String(n) : "演奏中");
});
WM.on("play-progress", (i) => {
  if (playing && !paused) setStatus(`${i + 1}/${cur().notes.length}`);
});
WM.on("play-end", () => {
  setPlayingUi(false);
  setStatus("就绪");
});
// 主编辑器等其他窗口的修改实时同步
WM.on("store-updated", (s) => {
  store = s;
  render();
});

(async () => {
  await refresh();
  setStatus("就绪");
  if (!WM.isTauri) $("ov-name").textContent = cur().name + "（预览）";
})();
