//! 游戏进程检测与窗口切换。
//!
//! Windows 下用 Toolhelp32 快照枚举进程，按可执行文件名匹配鸣潮进程
//!（启动器 `Wuthering Waves.exe`，兼容 UE4 游戏进程 `Client-Win64-Shipping.exe`），
//! 再枚举顶层窗口找到属于该进程的可见窗口，模拟 Alt 键后 `SetForegroundWindow` 切到前台。
//! 非 Windows 平台为预览 stub。

#[cfg(windows)]
mod imp {
    use winapi::shared::minwindef::{BOOL, LPARAM, UINT, WORD};
    use winapi::shared::windef::HWND;
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use winapi::um::winuser::{
        EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsWindowVisible,
        MapVirtualKeyW, SendInput, SetForegroundWindow, ShowWindow, INPUT, INPUT_KEYBOARD,
        KEYBDINPUT, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC, SW_RESTORE, VK_MENU,
    };

    /// 游戏进程名（大小写不敏感）
    const GAME_PROCESSES: [&str; 2] = ["Wuthering Waves.exe", "Client-Win64-Shipping.exe"];

    /// 枚举进程，返回与 `name` 匹配的进程 PID
    fn find_pid(name: &str) -> Option<u32> {
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return None;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut found = None;
            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    // 截断到第一个 NUL，避免比较缓冲区剩余内容
                    let bytes = &entry.szExeFile[..];
                    let len = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
                    let exe = String::from_utf16_lossy(&bytes[..len]);
                    if exe.eq_ignore_ascii_case(name) {
                        found = Some(entry.th32ProcessID);
                        break;
                    }
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
            found
        }
    }

    /// 找属于 `pid` 的可见顶层窗口
    struct FindCtx {
        pid: u32,
        hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut FindCtx);
        let mut wpid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut wpid);
        if wpid == ctx.pid && IsWindowVisible(hwnd) != 0 {
            ctx.hwnd = Some(hwnd);
            return 0; // 找到即停止枚举
        }
        1
    }

    fn find_window(pid: u32) -> Option<HWND> {
        let mut ctx = FindCtx { pid, hwnd: None };
        unsafe {
            EnumWindows(Some(enum_cb), &mut ctx as *mut FindCtx as LPARAM);
        }
        ctx.hwnd
    }

    /// 模拟按下/松开 Alt 键，绕过系统对 `SetForegroundWindow` 的前台限制
    fn allow_foreground() {
        unsafe {
            let vk = VK_MENU as WORD;
            let scan = MapVirtualKeyW(vk as UINT, MAPVK_VK_TO_VSC) as WORD;
            for flags in [0u32, KEYEVENTF_KEYUP] {
                let mut input: INPUT = std::mem::zeroed();
                input.type_ = INPUT_KEYBOARD;
                *input.u.ki_mut() = KEYBDINPUT {
                    wVk: vk,
                    wScan: scan,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                };
                SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
            }
        }
    }

    /// 是否检测到游戏进程
    pub fn game_running() -> bool {
        GAME_PROCESSES.iter().any(|&n| find_pid(n).is_some())
    }

    /// 若游戏进程在运行，将其窗口切换到前台；返回是否成功找到并激活窗口
    pub fn focus_game() -> bool {
        for &name in &GAME_PROCESSES {
            if let Some(pid) = find_pid(name) {
                if let Some(hwnd) = find_window(pid) {
                    unsafe {
                        ShowWindow(hwnd, SW_RESTORE); // 最小化则先恢复
                        allow_foreground();
                        SetForegroundWindow(hwnd);
                    }
                    return true;
                }
            }
        }
        false
    }

    /// 按 PID 取进程可执行文件名（用于判断前台窗口是否属于游戏）
    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return None;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut found = None;
            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    if entry.th32ProcessID == pid {
                        let bytes = &entry.szExeFile[..];
                        let len = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
                        found = Some(String::from_utf16_lossy(&bytes[..len]));
                        break;
                    }
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
            found
        }
    }

    /// 进程可执行文件名是否属于游戏
    fn name_is_game(name: &str) -> bool {
        GAME_PROCESSES.iter().any(|&g| name.eq_ignore_ascii_case(g))
    }

    /// 当前是否可安全发送按键：
    /// 游戏未运行 → 不做前台限制（返回 true，保持原有行为）；
    /// 游戏运行中 → 前台窗口必须属于游戏进程，否则返回 false（供播放线程切屏自动停止）
    pub fn game_in_foreground() -> bool {
        let running = GAME_PROCESSES.iter().any(|&n| find_pid(n).is_some());
        if !running {
            return true;
        }
        let fg = unsafe { GetForegroundWindow() };
        if fg.is_null() {
            return false;
        }
        let mut fg_pid: u32 = 0;
        unsafe {
            GetWindowThreadProcessId(fg, &mut fg_pid);
        }
        if fg_pid == 0 {
            return false;
        }
        match process_name(fg_pid) {
            Some(name) => name_is_game(&name),
            None => false,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// 进程枚举自检：应能找到本测试进程自身
        #[test]
        fn finds_own_process() {
            let name = std::env::current_exe()
                .unwrap()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            let own_pid = std::process::id();
            assert_eq!(find_pid(&name), Some(own_pid), "应通过进程名找到自身 PID");
        }

        /// process_name 自检：应能取到本进程名
        #[test]
        fn process_name_finds_own() {
            let name = std::env::current_exe()
                .unwrap()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            assert_eq!(
                process_name(std::process::id()).as_deref(),
                Some(name.as_str()),
                "应能按 PID 取到本进程名"
            );
        }

        /// 进程名校验（大小写不敏感）
        #[test]
        fn name_matching_is_case_insensitive() {
            assert!(name_is_game("Wuthering Waves.exe"));
            assert!(name_is_game("wuthering waves.EXE"));
            assert!(name_is_game("CLIENT-WIN64-SHIPPING.EXE"));
            assert!(!name_is_game("explorer.exe"));
        }

        /// 游戏未运行时，前台守卫应放行（保持原有可播放行为）
        #[test]
        fn foreground_allows_when_game_absent() {
            if !game_running() {
                assert!(game_in_foreground(), "游戏未运行时不应限制按键");
            }
        }

        /// 集成验证：复制 notepad 为「Wuthering Waves.exe」模拟游戏进程，
        /// 验证前台检测（游戏在前台放行、最小化失焦拦截）。
        /// 默认忽略，手动 `cargo test -- --ignored` 运行。
        #[test]
        #[ignore]
        fn foreground_with_fake_game() {
            use winapi::um::winuser::SW_MINIMIZE;

            let tmp = std::env::temp_dir().join("Wuthering Waves.exe");
            let _ = std::fs::remove_file(&tmp);
            std::fs::copy(r"C:\Windows\System32\notepad.exe", &tmp).expect("复制 notepad 失败");
            let mut child = std::process::Command::new(&tmp).spawn().expect("启动模拟游戏失败");
            std::thread::sleep(std::time::Duration::from_millis(800));
            assert!(game_running(), "应检测到模拟游戏进程");

            let hwnd = GAME_PROCESSES
                .iter()
                .find_map(|&n| find_pid(n))
                .and_then(find_window);
            match hwnd {
                None => {
                    child.kill().ok();
                    let _ = std::fs::remove_file(&tmp);
                    eprintln!("跳过：无法获取模拟游戏窗口（环境限制）");
                }
                Some(hwnd) => {
                    unsafe {
                        allow_foreground();
                        SetForegroundWindow(hwnd);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    assert!(game_in_foreground(), "游戏窗口在前台时应放行按键");

                    unsafe {
                        ShowWindow(hwnd, SW_MINIMIZE); // 模拟切屏
                    }
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    assert!(!game_in_foreground(), "切屏（游戏失焦）时应拦截");

                    child.kill().ok();
                    let _ = std::fs::remove_file(&tmp);
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn game_running() -> bool {
        false
    }
    pub fn focus_game() -> bool {
        false
    }
    pub fn game_in_foreground() -> bool {
        true
    }
}

pub use imp::{focus_game, game_in_foreground, game_running};
