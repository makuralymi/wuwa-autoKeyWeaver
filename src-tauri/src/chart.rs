//! 记谱文本解析与按键映射（无外部依赖，便于单元测试与前端逻辑保持一致）

/// 低八度（简谱 1~7 下加点）→ 键盘字母区最下面一排，从左到右
pub const LOW_ROW: [char; 7] = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
/// 中八度（简谱 1~7）→ 中间一排
pub const MID_ROW: [char; 7] = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
/// 高八度（简谱 1~7 上加点）→ 最上面一排
pub const HIGH_ROW: [char; 7] = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'];

/// 按键字符 → 音符编号
///
/// 0 休止不映射；1~7 = 低八度；8~14 = 中八度；15~21 = 高八度
pub fn char_to_note(c: char) -> Option<u8> {
    if let Some(i) = LOW_ROW.iter().position(|&k| k == c) {
        return Some(i as u8 + 1);
    }
    if let Some(i) = MID_ROW.iter().position(|&k| k == c) {
        return Some(i as u8 + 8);
    }
    if let Some(i) = HIGH_ROW.iter().position(|&k| k == c) {
        return Some(i as u8 + 15);
    }
    None
}

/// 音符编号 → 按键字符
pub fn note_to_char(id: u8) -> Option<char> {
    match id {
        1..=7 => Some(LOW_ROW[(id - 1) as usize]),
        8..=14 => Some(MID_ROW[(id - 8) as usize]),
        15..=21 => Some(HIGH_ROW[(id - 15) as usize]),
        _ => None,
    }
}

/// 默认谱面文本：远航星的告别（by B站 掉漆桌）
///
/// 规则：括号内字母同时按 = 一拍；单独字母 = 一拍；空格分隔；'/' 小节线不占拍
pub const DEFAULT_SONG_TEXT: &str = r#"
(CNAE) (NDE)/ (NAE)/ (ADE)/C(DH) /
(MGW) (MGW)/ (BSW)/(GJ)/X(SG) /
(CBJ) (BMQ)/ (MDJ)/ (DE)/CBDG/
(NDH) (HQ)/ (CH)/ (ND)G /D(NA) /
(NHE) (NAE)/ (DHE)/ (NDE)/C(ND) /
(BSW) (MGW)/ (MSW)/ B/B(BM) /
(BMJ) (BMQ)/ (BMJ)/  (ZC)/(CB)(AJ)/
(NDH) (NDH)/ (NDH)/(NH)(NH) H/(CND)GHH/

(CNAE)/(ND) (NW)(AE)/ (ND) (CW)/(NDE)(BDGT)/
(BGJW)/(XB) (BSQ)B/ B B/(SGT)(SGWT)/
(BGJ)/(CBG) (DQ)B/ B (BQ)/(BSW)(BMW)/
(CNAQ) (CN)/ (NA)N/ N N/(CN)(CB)/
(CNAE)/(ND) (NW)(AE)/ (ND) (CW)/(NDE)(NDHY)/
(MSGW)/(XBW) (BST)(BW)/ B (BQ)/(SGJ)(SGQ)/
(BGJ)/(CBG) (DQ)B/WBW(BW)/(BS)(BMW)/
(NDHQ) N/(MGJ) B/(NDH) B/(CBN)N/

(CNAE)C/(ND) (CNW)(AE)/N(ND)C(CW)/(NDE)(CBGT)/
(BGJW)X/(XB) (XBSE)(BW)/BBX(BQ)/(BSGJ)(XSGQ)/
(BMGJ)B/(CMGJ) (BDJ)B/(MW)BBB/(BMS)(BMW)/
(CNAQ)J (CNQ)/J (NAQ)(NJ)/A(NQ)JN/(CNMW)(CBW)/
(CNAE)C/(ND) (CNW)(AE)/N(ND)C(CW)/(NDE)(CNDY)/
(MSGW)X/(XB) (XBST)(BW)/BBX(BQ)/(BSGJ)(XSGQ)/
(BMGJ)B/(CBMG) (BDJ)B/(MQ)BB(BW)/(BMS)(BME)/
(CDHW) C/(ADQ) C/(CBAQ) C/(MSGW)C(CB) /

(CNAE)/(ND) NA/E(ND)W(CW)/(ND)Q(BD)H/
(XBM)/(XB) (BS)B/EBW(BW)/(BS)Q(BS)G/
(CB)/(CBH) (CD)(BG)/ B B/(BSW)(BMQ)/
(CNAJ) (CN)/ (NAQ)(NQ)/ N N/(CN)(CB)/
(CNAE)/(ND) NA/E(ND)W(CW)/(ND)Q(ND)H/
(XBM)/(XB) (BS)B/EBW(BW)/(BS)Q(BS)G/
(CB)/(CB) (DG)B/JB (BJ)/(BS)(BMJ)/
(CNDJ) (NQ)/(BM) JB/(BMDW) B/(CBMJ)B/

(CNAE)/(ND) (NW)(AE)/ (ND) (CW)/(NDE)(BGT)/
(BGJW)/(XB) (BSQ)B/ B B/(SGT)(SGT)/
(BGJ)/(CG) (DQ)B/ B B/(BSW)(BMW)/
(CNAQ) (CN)/ (NAD)N/ N N/(CNG)(CB)/
(CNAE)/(ND) (NW)(AE)/ (ND) (CW)/(NDE)(NDY)/
(BSHY)(SGJU)/(XB) (BST)B/ B B/(SGW)(SGQ)/
(BGJ)/(CBG) BB/ B B/(BSW) (BMQ)J/
(CNAQ) (SW)C/(BSW) EC/(CBDE) C/(SGT)C(DHY) /

(NAFY)E/HQ/HJ/QG/
(XBMH)J/QD/FS/MA/
(CMS)M/AN/MB/NV/
(ZCB)C/VX/(CBQ) C/(SGW)C(CB) /

(CNAE)/(ND) NA/E(ND)W(CW)/(ND)Q(BD)H/
(XBM)/(XB) (BS)B/EBW(BW)/(BS)Q(BS)G/
(CB)/(CBH) (CD)(BG)/ B B/(BSW)(BMQ)/
(CNAJ) (CN)/ (NAQ)(NQ)/ N N/(CN)(CB)/
(CNAE)/(ND) NA/E(ND)W(CW)/(ND)Q(ND)H/
(XBM)/(XB) (BS)B/EBW(BW)/(BS)Q(BS)G/
(CB)/(CB) (DG)B/JB (BJ)/(BS)(BMJ)/
(CNDJ) (NQ)/(BM) JB/(BMDW) B/(CBMJ)B/

(CNAE)/(ND)A(NH)A/ (ND)EC/(NDE)(NDE)/
(XBME) (GJT)/(XB) (BSQ)B/(MSW)B B/(BS)(BS)/
(CBSW)/(CB) (DG)B/ BWB/(BSW)(BMW)/
(CNDW)Q (NJ)/(BM) QB/(BMDQ) B/(CBMW)B/
(VNAE)/(ND) (NH)A/ (ND)EC/(NDE)(NDE)/
(XBMW)Q J/(XB) (BSW)B/WB B/(BS)(BS)/
(CBMQ)W W/(CB)WD(BW)/ B B/(BSH)(BMQ)/
(CNDQ) (NQ)/(BM) Q(BQ)/(BMDW)Q (BH)/(CBM)GB /
(VNAE)/(ND) (NH)A/ (ND)EC/(NDE)(NDE)/
(XBMW)Q J/(XB) (BSW)B/WB B/(BS)(BS)/
(CBW)/(CB) (DG)B/ BWB/(BSW)(BMW)/
(CNDW)Q (NJ)/(BM) QB/(BMDQ) B/(CBMW) B/
(VNAR)/(ND) (NH)A/ (ND)EC/(NDR)(NDE)/
(XBMW)Q J/(XB) (BSW)B/WB B/(BS)(BS)/
(CBQ)/(CB) (DJ)B/ BQB/(BSW)W(BM) /
(CNDH) (NJ)/(BM) QB/(BMSW) EB/(BMFR)(BE)/

(NAQ)/(NA)/(NA)/(NA)/
(XMJ)/(XM)/(XM)/(XM)
(CMG)(CM)/(CM)/(CM)/
(CAD)/(CA)/(CA)/(CA)/
(NAE)/(NA)/(NA)/(NA)/
(XMJ)/(XM)/(XM)/(XM)/
(CMU)/(CM)/(CM)/(CM)/
(NQ)C/A/ADHJ/Q/
"#;

/// 解析记谱文本为拍序列（每拍 = 同时按下的音符编号列表，空 = 休止）
pub fn parse_chart(text: &str) -> Vec<Vec<u8>> {
    let mut beats: Vec<Vec<u8>> = Vec::new();
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        match ch {
            '(' => {
                let mut beat = Vec::new();
                for c in chars.by_ref() {
                    if c == ')' {
                        break;
                    }
                    if let Some(id) = char_to_note(c) {
                        if !beat.contains(&id) {
                            beat.push(id);
                        }
                    }
                }
                if !beat.is_empty() {
                    beats.push(beat);
                }
            }
            'A'..='Z' => {
                if let Some(id) = char_to_note(ch) {
                    beats.push(vec![id]);
                }
            }
            _ => {}
        }
    }
    beats
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapping_is_consistent() {
        for id in 1..=21u8 {
            assert_eq!(char_to_note(note_to_char(id).unwrap()), Some(id));
        }
    }

    #[test]
    fn default_chart_parses() {
        let beats = parse_chart(DEFAULT_SONG_TEXT);
        assert!(beats.len() > 400, "拍数应>400，实际{}", beats.len());
        assert_eq!(beats[0], vec![3, 6, 8, 17], "首拍 (CNAE) 应为低1低6中1高3");
        let max_chord = beats.iter().map(|b| b.len()).max().unwrap_or(0);
        assert!(max_chord >= 4, "最大和弦应≥4，实际{max_chord}");
        assert!(beats.iter().all(|b| b.iter().all(|n| (1..=21).contains(n))));
    }
}
