//! 键盘按键模拟。
//!
//! Windows 下使用 winapi `SendInput`，采用**纯扫描码**方式（`KEYEVENTF_SCANCODE`、
//! `wVk=0`、仅填 `wScan`）。这与已验证可用于鸣潮的在原自动弹奏脚本中的
//! `scan` 注入方式完全一致，对按扫描码读取输入的游戏（如鸣潮乐器演奏）兼容性最佳。
//! 非 Windows 平台仅打印日志，方便在开发机上编译调试界面逻辑。

#[cfg(windows)]
mod imp {
    use winapi::shared::minwindef::{UINT, WORD};
    use winapi::um::winuser::{
        MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        KEYEVENTF_SCANCODE, KEYEVENTF_EXTENDEDKEY, MAPVK_VK_TO_VSC,
    };

    fn send_with(wvk: WORD, wscan: WORD, flags: u32) {
        let mut input: INPUT = unsafe { std::mem::zeroed() };
        input.type_ = INPUT_KEYBOARD;
        unsafe {
            *input.u.ki_mut() = KEYBDINPUT {
                wVk: wvk,
                wScan: wscan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            };
            SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
        }
    }

    // 默认：纯扫描码（wVk=0），与原脚本 scan 一致
    fn send(ch: char, key_up: bool) {
        let vk = ch.to_ascii_uppercase() as UINT;
        let scan = unsafe { MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) } as WORD;
        let mut flags = KEYEVENTF_SCANCODE;
        if key_up {
            flags |= KEYEVENTF_KEYUP;
        }
        send_with(0, scan, flags);
    }

    /// 若干种注入方式，供在游戏内实测
    /// mode:
    ///   "scan"   纯扫描码 wVk=0
    ///   "vk"     仅虚拟键码（无 SCANCODE 标志）
    ///   "scaned" 扫描码 + wVk + EXTENDEDKEY
    ///   "kid"    keybd_event
    pub fn test_inject(mode: &str, ch: char) {
        let vk = ch.to_ascii_uppercase() as WORD;
        let vk_u = ch.to_ascii_uppercase() as UINT;
        let scan = unsafe { MapVirtualKeyW(vk_u, MAPVK_VK_TO_VSC) } as WORD;
        match mode {
            "vk" => {
                let f = |up: bool| send_with(vk, 0, if up { KEYEVENTF_KEYUP } else { 0 });
                f(false);
                std::thread::sleep(std::time::Duration::from_millis(40));
                f(true);
            }
            "scaned" => {
                let f = |up: bool| {
                    let mut fl = KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY;
                    if up {
                        fl |= KEYEVENTF_KEYUP;
                    }
                    send_with(vk, scan, fl)
                };
                f(false);
                std::thread::sleep(std::time::Duration::from_millis(40));
                f(true);
            }
            _ => {
                // 默认纯扫描码
                send_with(0, scan, KEYEVENTF_SCANCODE);
                std::thread::sleep(std::time::Duration::from_millis(40));
                send_with(0, scan, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP);
            }
        }
    }

    pub fn press(ch: char) {
        send(ch, false);
    }

    pub fn release(ch: char) {
        send(ch, true);
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn press(ch: char) {
        println!("[预览] 按下按键: {ch}");
    }
    pub fn release(ch: char) {
        println!("[预览] 松开按键: {ch}");
    }
    pub fn test_inject(_mode: &str, ch: char) {
        println!("[预览] 测试注入: {ch}");
    }
}

pub use imp::{press, release, test_inject};
