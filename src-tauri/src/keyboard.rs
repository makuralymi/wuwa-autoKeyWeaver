//! 键盘按键模拟。
//!
//! Windows 下使用 winapi `SendInput`，采用扫描码方式（`KEYEVENTF_SCANCODE`），
//! 同时填写 `wVk` 与 `wScan`，对读取扫描码的游戏（如鸣潮乐器演奏）兼容性更好。
//! 非 Windows 平台仅打印日志，方便在开发机上编译调试界面逻辑。

#[cfg(windows)]
mod imp {
    use winapi::shared::minwindef::{UINT, WORD};
    use winapi::um::winuser::{
        MapVirtualKeyW, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC,
    };

    fn send(ch: char, key_up: bool) {
        // 字母键的虚拟键码即其大写字母的 ASCII 码
        let vk = ch.to_ascii_uppercase() as WORD;
        let scan = unsafe { MapVirtualKeyW(vk as UINT, MAPVK_VK_TO_VSC) } as WORD;

        let mut flags = KEYEVENTF_SCANCODE;
        if key_up {
            flags |= KEYEVENTF_KEYUP;
        }

        let mut input: INPUT = unsafe { std::mem::zeroed() };
        input.type_ = INPUT_KEYBOARD;
        unsafe {
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
}

pub use imp::{press, release};
