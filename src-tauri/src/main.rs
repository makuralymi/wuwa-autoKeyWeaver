#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chart;
mod keyboard;

use chart::{note_to_char, parse_chart, DEFAULT_SONG_TEXT};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// 播放代数：每次开始/停止播放 +1，播放线程通过比对代数判断是否应退出
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// 暂停标志
static PAUSED: AtomicBool = AtomicBool::new(false);

const MAX_BEATS: usize = 1024;
const MAX_CHORD: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub name: String,
    pub bpm: u32,
    /// 每拍 = 同时按下的音符编号列表（空 = 休止）
    pub notes: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Store {
    pub songs: Vec<Song>,
    pub current: usize,
    /// 播放前倒计时秒数（0 = 不倒计时）
    pub countdown: u32,
}

impl Default for Store {
    fn default() -> Self {
        Store {
            songs: vec![Song {
                name: "远航星的告别".into(),
                bpm: 96,
                notes: parse_chart(DEFAULT_SONG_TEXT),
            }],
            current: 0,
            countdown: 3,
        }
    }
}

/// 旧版（每拍单音）存储格式，用于迁移
#[derive(Deserialize)]
struct RawStore {
    songs: Vec<RawSong>,
    current: usize,
    countdown: u32,
}
#[derive(Deserialize)]
struct RawSong {
    name: String,
    bpm: u32,
    notes: Vec<RawBeat>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum RawBeat {
    One(u8),
    Many(Vec<u8>),
}

fn raw_to_store(raw: RawStore) -> Store {
    Store {
        songs: raw
            .songs
            .into_iter()
            .map(|s| Song {
                name: s.name,
                bpm: s.bpm,
                notes: s
                    .notes
                    .into_iter()
                    .map(|b| match b {
                        RawBeat::One(n) => {
                            if (1..=21).contains(&n) {
                                vec![n]
                            } else {
                                vec![]
                            }
                        }
                        RawBeat::Many(v) => {
                            v.into_iter().filter(|n| (1..=21).contains(n)).collect()
                        }
                    })
                    .collect(),
            })
            .collect(),
        current: raw.current,
        countdown: raw.countdown,
    }
}

/// 校验并规整数据，防止前端传入越界值
fn sanitize(mut s: Store) -> Store {
    if s.songs.is_empty() {
        s.songs.push(Song {
            name: "新曲谱".into(),
            bpm: 120,
            notes: vec![vec![]; 32],
        });
    }
    for song in &mut s.songs {
        song.bpm = song.bpm.clamp(20, 600);
        song.notes.truncate(MAX_BEATS);
        if song.notes.is_empty() {
            song.notes.push(vec![]);
        }
        for beat in &mut song.notes {
            beat.truncate(MAX_CHORD);
            beat.retain(|n| (1..=21).contains(n));
            beat.dedup();
        }
        if song.name.trim().is_empty() {
            song.name = "未命名曲谱".into();
        }
    }
    s.current = s.current.min(s.songs.len() - 1);
    s.countdown = s.countdown.min(60);
    s
}

struct AppStore(Mutex<Store>);

fn store_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("songs.json"))
}

fn load_store(app: &AppHandle) -> Store {
    let store = store_file(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice::<RawStore>(&b).ok())
        .map(raw_to_store)
        .unwrap_or_default();
    sanitize(store)
}

fn persist(app: &AppHandle, store: &Store) {
    if let Some(path) = store_file(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec_pretty(store) {
            let _ = std::fs::write(path, json);
        }
    }
}

/* ================= 命令 ================= */

#[tauri::command]
fn get_store(state: State<'_, AppStore>) -> Store {
    state.0.lock().unwrap().clone()
}

/// 前端整体写回（编辑音符 / 改 BPM / 改倒计时 / 增删改谱面）
#[tauri::command]
fn save_store(state: State<'_, AppStore>, app: AppHandle, store: Store) -> Store {
    let mut guard = state.0.lock().unwrap();
    *guard = sanitize(store);
    persist(&app, &guard);
    let _ = app.emit("store-updated", guard.clone());
    guard.clone()
}

/// 切换当前谱面（同时停止正在进行的播放）
#[tauri::command]
fn select_song(state: State<'_, AppStore>, app: AppHandle, index: usize) -> Store {
    stop_playback();
    let mut guard = state.0.lock().unwrap();
    guard.current = index.min(guard.songs.len().saturating_sub(1));
    persist(&app, &guard);
    let _ = app.emit("store-updated", guard.clone());
    guard.clone()
}

/// 按当前谱面播放（含倒计时）
#[tauri::command]
fn play_current(state: State<'_, AppStore>, app: AppHandle) -> Result<(), String> {
    let store = state.0.lock().unwrap().clone();
    let song = store
        .songs
        .get(store.current)
        .ok_or("当前没有曲谱")?
        .clone();
    if song.notes.is_empty() {
        return Err("曲谱为空，请先编辑音符".into());
    }

    stop_playback();
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let countdown = store.countdown;

    std::thread::spawn(move || {
        let stopped = || GENERATION.load(Ordering::SeqCst) != gen;

        // 倒计时阶段（可暂停、可停止）
        let mut secs = countdown;
        while secs > 0 {
            let _ = app.emit("countdown", secs);
            if !wait(Duration::from_secs(1), &mut Vec::new(), gen) {
                let _ = app.emit("play-end", ());
                return;
            }
            secs -= 1;
            if stopped() {
                let _ = app.emit("play-end", ());
                return;
            }
        }
        let _ = app.emit("countdown", 0u32);
        if stopped() {
            let _ = app.emit("play-end", ());
            return;
        }

        // 演奏阶段：每拍按下和弦全部按键，拍尾松开
        let beat = Duration::from_millis(60_000 / u64::from(song.bpm));
        let hold = beat * 7 / 10;
        let mut held: Vec<char> = Vec::new();
        for (i, beat_notes) in song.notes.iter().enumerate() {
            if stopped() {
                break;
            }
            if !wait(Duration::ZERO, &mut held, gen) {
                break; // 从暂停中醒来后发现已停止
            }
            let mut chars: Vec<char> = beat_notes
                .iter()
                .filter_map(|&id| note_to_char(id))
                .collect();
            chars.dedup();
            for &ch in &chars {
                keyboard::press(ch);
            }
            held = chars;
            let _ = app.emit("play-progress", i as u32);

            if !wait(hold, &mut held, gen) {
                break;
            }
            for &ch in &held {
                keyboard::release(ch);
            }
            held.clear();
            let tail = beat.saturating_sub(hold);
            if !wait(tail, &mut held, gen) {
                break;
            }
        }
        for &ch in &held {
            keyboard::release(ch);
        }
        let _ = app.emit("play-end", ());
    });

    Ok(())
}

/// 暂停 / 恢复播放
#[tauri::command]
fn pause_score(paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
}

/// 停止播放
#[tauri::command]
fn stop_score() {
    stop_playback();
}

fn stop_playback() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    PAUSED.store(false, Ordering::SeqCst);
}

/// 可中断（停止）、可暂停的等待；暂停时会先松开按住的键，恢复时重新按下
///
/// 返回 false 表示播放已被停止，调用方应退出
fn wait(mut remain: Duration, held: &mut Vec<char>, gen: u64) -> bool {
    let mut paused_held: Option<Vec<char>> = None;
    loop {
        if GENERATION.load(Ordering::SeqCst) != gen {
            return false;
        }
        if PAUSED.load(Ordering::SeqCst) {
            if paused_held.is_none() {
                paused_held = Some(std::mem::take(held));
                for &ch in paused_held.as_ref().unwrap_or(&Vec::new()) {
                    keyboard::release(ch);
                }
            }
            std::thread::sleep(Duration::from_millis(20));
            continue;
        }
        if let Some(chs) = paused_held.take() {
            for &ch in &chs {
                keyboard::press(ch);
            }
            *held = chs;
        }
        if remain.is_zero() {
            return true;
        }
        let step = Duration::from_millis(10).min(remain);
        std::thread::sleep(step);
        remain -= step;
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(AppStore(Mutex::new(load_store(&handle))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_store, save_store, select_song, play_current, pause_score, stop_score
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
