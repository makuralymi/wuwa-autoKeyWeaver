"use strict";

/* 共享层：数据访问（Tauri 命令 / 浏览器 localStorage 回退）、事件订阅、
 * 音符元数据与简谱渲染。主编辑器与悬浮窗共用。 */
const WM = (() => {
  const tauri = window.__TAURI__ || null;
  const isTauri = !!tauri;

  /* ---------- 音符与按键映射 ---------- */
  // 三排按键，从左到右各 7 键。上排=高八度，中排=中八度，下排=低八度
  const KEY_ROWS = [
    { keys: "QWERTYU", base: 15, label: "高八度" },
    { keys: "ASDFGHJ", base: 8, label: "中八度" },
    { keys: "ZXCVBNM", base: 1, label: "低八度" },
  ];
  const KEY_TO_NOTE = {};
  for (const row of KEY_ROWS) [...row.keys].forEach((k, i) => (KEY_TO_NOTE[k] = row.base + i));

  // 音符编号 → 简谱 HTML（低八度下加点，高八度上加点）
  function noteHtml(id) {
    if (!id) return `<span class="jianpu"><span class="dot">&nbsp;</span>0<span class="dot">&nbsp;</span></span>`;
    const octave = Math.floor((id - 1) / 7); // 0低 1中 2高
    const degree = ((id - 1) % 7) + 1;
    const top = octave === 2 ? "●" : "&nbsp;";
    const bottom = octave === 0 ? "●" : "&nbsp;";
    return `<span class="jianpu"><span class="dot">${top}</span>${degree}<span class="dot">${bottom}</span></span>`;
  }

  /* ---------- 默认谱面文本：远航星的告别（by B站 掉漆桌） ----------
   * 规则：括号内字母同时按 = 一拍；单独字母 = 一拍；空格分隔；'/' 小节线不占拍 */
  const CHART_TEXT = `
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
`;

  // 解析记谱文本为音符事件序列（每 token = 一拍 = 4 分音符）
  function parseChart(text) {
    const events = [];
    for (const m of text.matchAll(/\(([A-Z]+)\)|([A-Z])/g)) {
      const letters = m[1] ? [...m[1]] : [m[2]];
      const ids = [...new Set(letters.map((k) => KEY_TO_NOTE[k]).filter((n) => n))];
      if (ids.length) events.push({ ids, ticks: 4 });
    }
    return events;
  }

  // 归整单个音符事件：兼容 {ids,ticks} / 旧版和弦数组 / 更旧版单音编号
  function normEvent(b) {
    if (Array.isArray(b)) {
      return {
        ids: [...new Set(b.map((n) => Math.floor(Number(n))).filter((n) => n >= 1 && n <= 21))].slice(0, 8),
        ticks: 4,
      };
    }
    if (typeof b === "number") {
      const n = Math.floor(b);
      return { ids: n >= 1 && n <= 21 ? [n] : [], ticks: 4 };
    }
    if (b && typeof b === "object") {
      const ids = (Array.isArray(b.ids) ? b.ids : [])
        .map((n) => Math.floor(Number(n)))
        .filter((n) => n >= 1 && n <= 21);
      const ticks = Math.max(1, Math.min(64, Math.floor(Number(b.ticks)) || 4));
      return { ids: [...new Set(ids)].slice(0, 8), ticks };
    }
    return { ids: [], ticks: 4 };
  }

  /* ---------- 事件订阅（Rust 广播 / 浏览器本地分发） ---------- */
  const localListeners = {};
  function on(name, cb) {
    if (isTauri) tauri.event.listen(name, (e) => cb(e.payload));
    else (localListeners[name] ||= []).push(cb);
  }
  function emitLocal(name, payload) {
    (localListeners[name] || []).forEach((cb) => cb(payload));
  }

  /* ---------- 默认数据 ---------- */
  const LS_KEY = "wuwa-music-store-v2";
  const MAX_NOTES = 1024;
  // 《且听风吟》默认谱面数据（MIDI 转换，由脚本注入，见下方 __QTFY_NOTES__）
  const QTFY_NOTES = [{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[11],"ticks":1},{"ids":[13,20],"ticks":1},{"ids":[17],"ticks":5},{"ids":[16],"ticks":2},{"ids":[19],"ticks":1},{"ids":[20],"ticks":1},{"ids":[16],"ticks":1},{"ids":[19],"ticks":1},{"ids":[20],"ticks":2},{"ids":[16],"ticks":9},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[12,20],"ticks":1},{"ids":[15],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":7},{"ids":[16],"ticks":2},{"ids":[19],"ticks":1},{"ids":[4,20],"ticks":7},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":4},{"ids":[15],"ticks":1},{"ids":[14],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[17],"ticks":4},{"ids":[15],"ticks":1},{"ids":[14],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[17,20],"ticks":1},{"ids":[17,19],"ticks":1},{"ids":[5,20],"ticks":2},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[16],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[16,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[16,20],"ticks":1},{"ids":[17,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[14],"ticks":1},{"ids":[16],"ticks":1},{"ids":[12],"ticks":1},{"ids":[17],"ticks":1},{"ids":[13],"ticks":1},{"ids":[19],"ticks":1},{"ids":[5],"ticks":1},{"ids":[16],"ticks":1},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[20],"ticks":1},{"ids":[21],"ticks":1},{"ids":[17,21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[16],"ticks":1},{"ids":[21],"ticks":1},{"ids":[17],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[17,21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[16],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[17],"ticks":1},{"ids":[21],"ticks":1},{"ids":[20],"ticks":1},{"ids":[21],"ticks":1},{"ids":[17,21],"ticks":1},{"ids":[16,21],"ticks":1},{"ids":[17,21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[6,20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[15],"ticks":1},{"ids":[13],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[15],"ticks":2},{"ids":[13],"ticks":2},{"ids":[10],"ticks":2},{"ids":[13],"ticks":1},{"ids":[10],"ticks":1},{"ids":[8],"ticks":2},{"ids":[7],"ticks":2},{"ids":[6],"ticks":2},{"ids":[10],"ticks":2},{"ids":[12],"ticks":2},{"ids":[13],"ticks":2},{"ids":[16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[15],"ticks":2},{"ids":[17],"ticks":2},{"ids":[19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[21],"ticks":2},{"ids":[16],"ticks":2},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[15],"ticks":2},{"ids":[21],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[15],"ticks":2},{"ids":[13],"ticks":28},{"ids":[19],"ticks":4},{"ids":[20],"ticks":4},{"ids":[16],"ticks":4},{"ids":[5,17],"ticks":1},{"ids":[15],"ticks":16},{"ids":[15],"ticks":12},{"ids":[17],"ticks":4},{"ids":[14],"ticks":16},{"ids":[14],"ticks":8},{"ids":[15],"ticks":4},{"ids":[16],"ticks":4},{"ids":[6,10,13],"ticks":16},{"ids":[15],"ticks":8},{"ids":[19],"ticks":4},{"ids":[19],"ticks":4},{"ids":[5,9,12],"ticks":16},{"ids":[19],"ticks":4},{"ids":[20],"ticks":4},{"ids":[17],"ticks":8},{"ids":[4,8,11,16],"ticks":16},{"ids":[15],"ticks":4},{"ids":[19],"ticks":8},{"ids":[14],"ticks":4},{"ids":[5,9,12],"ticks":16},{"ids":[14],"ticks":4},{"ids":[15],"ticks":8},{"ids":[17],"ticks":4},{"ids":[6,10,13],"ticks":16},{"ids":[15],"ticks":8},{"ids":[16],"ticks":4},{"ids":[17],"ticks":4},{"ids":[2,9],"ticks":4},{"ids":[14],"ticks":12},{"ids":[17],"ticks":4},{"ids":[19],"ticks":8},{"ids":[20],"ticks":4},{"ids":[4,8,11,15,17,20],"ticks":4},{"ids":[15],"ticks":4},{"ids":[17],"ticks":4},{"ids":[15],"ticks":4},{"ids":[19,20],"ticks":4},{"ids":[15,19],"ticks":4},{"ids":[16],"ticks":4},{"ids":[15,19],"ticks":4},{"ids":[5,9,12,14,16,19],"ticks":4},{"ids":[14,17],"ticks":4},{"ids":[19],"ticks":4},{"ids":[14,16],"ticks":4},{"ids":[16],"ticks":4},{"ids":[12,15],"ticks":4},{"ids":[14,19],"ticks":4},{"ids":[12,19],"ticks":4},{"ids":[6,10,13,17],"ticks":4},{"ids":[10],"ticks":4},{"ids":[13,16],"ticks":4},{"ids":[10],"ticks":4},{"ids":[15,20],"ticks":4},{"ids":[10],"ticks":4},{"ids":[13,17],"ticks":4},{"ids":[10,17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[5,9,12,16],"ticks":4},{"ids":[9],"ticks":4},{"ids":[12,17],"ticks":4},{"ids":[9],"ticks":4},{"ids":[9,12,19],"ticks":4},{"ids":[5,13,20],"ticks":4},{"ids":[12,16,19],"ticks":4},{"ids":[5,12,16],"ticks":4},{"ids":[4,8,11],"ticks":1},{"ids":[15],"ticks":1},{"ids":[19],"ticks":1},{"ids":[16,17],"ticks":1},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[20],"ticks":4},{"ids":[16],"ticks":4},{"ids":[11,12,19],"ticks":4},{"ids":[4,13,20],"ticks":4},{"ids":[8,15,16,19],"ticks":4},{"ids":[4,17,20],"ticks":4},{"ids":[5,10,12],"ticks":1},{"ids":[8],"ticks":1},{"ids":[12],"ticks":1},{"ids":[9,16,21],"ticks":1},{"ids":[12],"ticks":1},{"ids":[16],"ticks":1},{"ids":[21],"ticks":4},{"ids":[12,16],"ticks":4},{"ids":[9,16,19],"ticks":4},{"ids":[5,19,21],"ticks":4},{"ids":[12,16],"ticks":4},{"ids":[10,17,20],"ticks":4},{"ids":[8,12,14],"ticks":1},{"ids":[12],"ticks":1},{"ids":[19],"ticks":1},{"ids":[16,19],"ticks":1},{"ids":[14],"ticks":1},{"ids":[17],"ticks":1},{"ids":[21],"ticks":4},{"ids":[12,19],"ticks":4},{"ids":[16,19],"ticks":4},{"ids":[12,19],"ticks":4},{"ids":[14,19],"ticks":4},{"ids":[12,19],"ticks":4},{"ids":[8,10,12,14,17],"ticks":8},{"ids":[19],"ticks":8},{"ids":[16],"ticks":4},{"ids":[17],"ticks":4},{"ids":[19],"ticks":4},{"ids":[20],"ticks":4},{"ids":[4,17,19],"ticks":4},{"ids":[15,18,20],"ticks":4},{"ids":[15,19,21],"ticks":4},{"ids":[11],"ticks":4},{"ids":[4,17,20],"ticks":4},{"ids":[8,16,20],"ticks":4},{"ids":[4,15,19],"ticks":4},{"ids":[6,19,21],"ticks":1},{"ids":[6],"ticks":4},{"ids":[5],"ticks":4},{"ids":[19],"ticks":4},{"ids":[16],"ticks":4},{"ids":[12],"ticks":4},{"ids":[5],"ticks":4},{"ids":[12],"ticks":4},{"ids":[19,20],"ticks":4},{"ids":[7,14,19],"ticks":4},{"ids":[6,19,21],"ticks":4},{"ids":[13,17,20],"ticks":4},{"ids":[10,15,20],"ticks":4},{"ids":[6],"ticks":4},{"ids":[15,17,20],"ticks":4},{"ids":[13,15,17],"ticks":4},{"ids":[7,14],"ticks":4},{"ids":[8,15,16,19],"ticks":4},{"ids":[5],"ticks":4},{"ids":[9],"ticks":4},{"ids":[14],"ticks":4},{"ids":[12],"ticks":4},{"ids":[13,17],"ticks":2},{"ids":[12],"ticks":2},{"ids":[10,17,19],"ticks":4},{"ids":[14,18,20],"ticks":4},{"ids":[10,15,20],"ticks":4},{"ids":[4,11,16,20],"ticks":4},{"ids":[13,18,20],"ticks":2},{"ids":[16],"ticks":2},{"ids":[4,11,16,20],"ticks":8},{"ids":[5,12,16,21],"ticks":4},{"ids":[17,21],"ticks":8},{"ids":[19,21],"ticks":2},{"ids":[5,12],"ticks":2},{"ids":[6,10,15],"ticks":4},{"ids":[14,16,21],"ticks":4},{"ids":[5,9,14],"ticks":4},{"ids":[13,15,20],"ticks":4},{"ids":[4,8,13],"ticks":8},{"ids":[15,20],"ticks":4},{"ids":[20,21],"ticks":4},{"ids":[2,9,17,20],"ticks":4},{"ids":[10,15,17],"ticks":4},{"ids":[13,15,20],"ticks":4},{"ids":[10],"ticks":4},{"ids":[3,19,21],"ticks":4},{"ids":[12,15,20],"ticks":4},{"ids":[12,15,19,20],"ticks":8},{"ids":[6,16,19],"ticks":4},{"ids":[10,17,20],"ticks":4},{"ids":[10,20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[10,21],"ticks":2},{"ids":[20],"ticks":2},{"ids":[10,19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[6,16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[6,21],"ticks":2},{"ids":[15],"ticks":2},{"ids":[6,19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[4,19],"ticks":2},{"ids":[20],"ticks":4},{"ids":[19],"ticks":2},{"ids":[10,17,20],"ticks":8},{"ids":[5,20],"ticks":6},{"ids":[17],"ticks":2},{"ids":[10,17],"ticks":2},{"ids":[17],"ticks":2},{"ids":[17],"ticks":2},{"ids":[17],"ticks":2},{"ids":[5,16],"ticks":8},{"ids":[9,16],"ticks":8},{"ids":[14,16],"ticks":4},{"ids":[21],"ticks":2},{"ids":[20],"ticks":2},{"ids":[12,19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[19],"ticks":2},{"ids":[1,5,8,17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[10,19],"ticks":8},{"ids":[17,19],"ticks":8},{"ids":[15,20],"ticks":2},{"ids":[19],"ticks":2},{"ids":[17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[5,16],"ticks":8},{"ids":[12,16],"ticks":8},{"ids":[14,21],"ticks":2},{"ids":[19],"ticks":2},{"ids":[17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[12,15],"ticks":2},{"ids":[13],"ticks":2},{"ids":[15],"ticks":2},{"ids":[16],"ticks":2},{"ids":[3,10,15],"ticks":2},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[3,10],"ticks":1},{"ids":[15],"ticks":1},{"ids":[15],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[3,10,16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":1},{"ids":[19],"ticks":2},{"ids":[16],"ticks":2},{"ids":[15],"ticks":2},{"ids":[20],"ticks":2},{"ids":[15],"ticks":2},{"ids":[16],"ticks":2},{"ids":[2,9,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[9,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[2,9],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[2,9],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[21],"ticks":4},{"ids":[19],"ticks":4},{"ids":[17],"ticks":4},{"ids":[21],"ticks":4},{"ids":[3,10,21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[3,10],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[3,10,21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[7,11],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[7,11],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[21],"ticks":1},{"ids":[3,10,20,21],"ticks":2},{"ids":[21],"ticks":2},{"ids":[17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[3,10,17],"ticks":8},{"ids":[17],"ticks":4},{"ids":[19],"ticks":8},{"ids":[20],"ticks":4},{"ids":[11],"ticks":16},{"ids":[20],"ticks":4},{"ids":[19],"ticks":4},{"ids":[16],"ticks":4},{"ids":[19],"ticks":4},{"ids":[12,16],"ticks":4},{"ids":[17],"ticks":8},{"ids":[16],"ticks":8},{"ids":[15],"ticks":4},{"ids":[16,19],"ticks":4},{"ids":[16,19],"ticks":4},{"ids":[6,19],"ticks":1},{"ids":[6],"ticks":1},{"ids":[20],"ticks":1},{"ids":[6],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[6,19],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[6,19],"ticks":8},{"ids":[15,17],"ticks":4},{"ids":[16,21],"ticks":4},{"ids":[5,19],"ticks":1},{"ids":[5],"ticks":1},{"ids":[20],"ticks":1},{"ids":[5],"ticks":1},{"ids":[17],"ticks":1},{"ids":[16],"ticks":1},{"ids":[17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[5,17],"ticks":1},{"ids":[19],"ticks":1},{"ids":[21],"ticks":5},{"ids":[12,19],"ticks":4},{"ids":[13,20],"ticks":4},{"ids":[16,19],"ticks":4},{"ids":[16,20],"ticks":4},{"ids":[4],"ticks":4},{"ids":[8,15,17],"ticks":4},{"ids":[11,13],"ticks":4},{"ids":[15,17],"ticks":2},{"ids":[8,11],"ticks":2},{"ids":[12,19],"ticks":4},{"ids":[4,8,13,20],"ticks":4},{"ids":[11,15,17,19],"ticks":4},{"ids":[4,16,20],"ticks":4},{"ids":[5],"ticks":4},{"ids":[9,16],"ticks":4},{"ids":[12,14],"ticks":4},{"ids":[14,16,19],"ticks":2},{"ids":[9,12],"ticks":2},{"ids":[16,19],"ticks":4},{"ids":[5,9,19,21],"ticks":4},{"ids":[12,14,16,19,21],"ticks":4},{"ids":[5,12,17,20],"ticks":4},{"ids":[8,12,14],"ticks":4},{"ids":[12,19],"ticks":4},{"ids":[12,15],"ticks":4},{"ids":[15,17,19],"ticks":2},{"ids":[8,12],"ticks":2},{"ids":[17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[5,8],"ticks":1},{"ids":[19],"ticks":2},{"ids":[15],"ticks":2},{"ids":[12,15,17,21],"ticks":2},{"ids":[15],"ticks":2},{"ids":[1,8,17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[8,10,12,14,19],"ticks":2},{"ids":[17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[8,12,21],"ticks":2},{"ids":[15,17,19],"ticks":2},{"ids":[16],"ticks":2},{"ids":[15],"ticks":2},{"ids":[10,21],"ticks":2},{"ids":[5,16],"ticks":4},{"ids":[10,17],"ticks":2},{"ids":[12],"ticks":2},{"ids":[15,19],"ticks":2},{"ids":[12],"ticks":2},{"ids":[8,20],"ticks":2},{"ids":[5],"ticks":2},{"ids":[4,17,19],"ticks":2},{"ids":[15],"ticks":2},{"ids":[8,15,20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[11,13,19,21],"ticks":4},{"ids":[15,17],"ticks":2},{"ids":[8,11],"ticks":2},{"ids":[17,20],"ticks":4},{"ids":[4,8,16,20],"ticks":4},{"ids":[11,15,17,19],"ticks":4},{"ids":[4,19,21],"ticks":4},{"ids":[5],"ticks":4},{"ids":[9,19],"ticks":2},{"ids":[17],"ticks":2},{"ids":[12,14,21],"ticks":2},{"ids":[19],"ticks":2},{"ids":[14,16,17],"ticks":2},{"ids":[9,12],"ticks":6},{"ids":[5,9],"ticks":4},{"ids":[12,14,16,17,20],"ticks":4},{"ids":[5,16,19],"ticks":4},{"ids":[6,17,21],"ticks":2},{"ids":[17],"ticks":2},{"ids":[10,16,20],"ticks":2},{"ids":[15],"ticks":2},{"ids":[13,15,17],"ticks":4},{"ids":[15,17],"ticks":2},{"ids":[10,13],"ticks":2},{"ids":[17,20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[6,10,15,17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[12,15,17],"ticks":2},{"ids":[17],"ticks":2},{"ids":[6,16,19],"ticks":4},{"ids":[5],"ticks":4},{"ids":[9,17],"ticks":2},{"ids":[19],"ticks":2},{"ids":[12,14,21],"ticks":2},{"ids":[19],"ticks":2},{"ids":[14,16,19],"ticks":2},{"ids":[9,12],"ticks":2},{"ids":[6,13,17],"ticks":1},{"ids":[21],"ticks":2},{"ids":[12],"ticks":2},{"ids":[10,19],"ticks":4},{"ids":[14,18,20],"ticks":4},{"ids":[15,17,20],"ticks":2},{"ids":[19],"ticks":2},{"ids":[4,11,16,20],"ticks":4},{"ids":[13,18,20],"ticks":2},{"ids":[16],"ticks":2},{"ids":[4,11,16,20],"ticks":6},{"ids":[17],"ticks":2},{"ids":[5,12,16,21],"ticks":4},{"ids":[12,17,21],"ticks":4},{"ids":[19,21],"ticks":4},{"ids":[19,21],"ticks":2},{"ids":[5,12],"ticks":2},{"ids":[6,10,15,21],"ticks":4},{"ids":[14,16,21],"ticks":4},{"ids":[5,9,14,16],"ticks":4},{"ids":[13,15,20],"ticks":2},{"ids":[13],"ticks":2},{"ids":[4,8,11,15],"ticks":8},{"ids":[15,20],"ticks":4},{"ids":[20,21],"ticks":4},{"ids":[2,9,18,20],"ticks":2},{"ids":[15],"ticks":2},{"ids":[10,15,17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[15,17,20],"ticks":4},{"ids":[13,15],"ticks":2},{"ids":[8,10],"ticks":2},{"ids":[3,10,19,21],"ticks":4},{"ids":[12,15,20],"ticks":4},{"ids":[12,15,19,20],"ticks":4},{"ids":[3,10],"ticks":4},{"ids":[6,16,19],"ticks":2},{"ids":[8],"ticks":2},{"ids":[9],"ticks":2},{"ids":[10,17,20],"ticks":2},{"ids":[13],"ticks":2},{"ids":[10],"ticks":2},{"ids":[9,20],"ticks":2},{"ids":[8],"ticks":2},{"ids":[9],"ticks":2},{"ids":[10],"ticks":2},{"ids":[12],"ticks":2},{"ids":[13],"ticks":2},{"ids":[5,12,15],"ticks":2},{"ids":[3,10],"ticks":2},{"ids":[2,9,16],"ticks":2},{"ids":[1,8],"ticks":2},{"ids":[4,17,20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[16,19],"ticks":2},{"ids":[4,8,16],"ticks":2},{"ids":[11,13,17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[13,15,16],"ticks":2},{"ids":[4,11,20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[4,17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[13,17,20],"ticks":2},{"ids":[11,17],"ticks":2},{"ids":[8,16,19],"ticks":2},{"ids":[4,16],"ticks":2},{"ids":[5,17],"ticks":2},{"ids":[21],"ticks":2},{"ids":[16],"ticks":2},{"ids":[5,17],"ticks":2},{"ids":[7,9,19],"ticks":2},{"ids":[21],"ticks":2},{"ids":[9,12,16],"ticks":2},{"ids":[14,16,19,21],"ticks":2},{"ids":[19],"ticks":2},{"ids":[21],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[19],"ticks":2},{"ids":[14,15,17],"ticks":2},{"ids":[12,17],"ticks":2},{"ids":[9,16,21],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[6,16,20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[6,10,15,19],"ticks":2},{"ids":[13,15,20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[15,17,20],"ticks":2},{"ids":[13,15],"ticks":2},{"ids":[6,15],"ticks":2},{"ids":[3,17],"ticks":2},{"ids":[6,16],"ticks":2},{"ids":[20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[13,19],"ticks":2},{"ids":[10,14,21],"ticks":2},{"ids":[6,19],"ticks":2},{"ids":[5,12],"ticks":2},{"ids":[9,12,14],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[9,19],"ticks":2},{"ids":[12,21],"ticks":2},{"ids":[19],"ticks":2},{"ids":[9,12,16],"ticks":2},{"ids":[12,14,16,19],"ticks":2},{"ids":[5,14],"ticks":2},{"ids":[5],"ticks":1},{"ids":[16],"ticks":2},{"ids":[16],"ticks":2},{"ids":[19],"ticks":2},{"ids":[14,16],"ticks":2},{"ids":[12,16],"ticks":2},{"ids":[2,9,15],"ticks":2},{"ids":[5,12],"ticks":2},{"ids":[3,16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[19],"ticks":2},{"ids":[7,16],"ticks":2},{"ids":[21],"ticks":2},{"ids":[9,14,19],"ticks":2},{"ids":[3,17],"ticks":2},{"ids":[21],"ticks":2},{"ids":[14],"ticks":2},{"ids":[12,17,19],"ticks":2},{"ids":[19],"ticks":2},{"ids":[12,17],"ticks":2},{"ids":[10],"ticks":2},{"ids":[7,17,21],"ticks":2},{"ids":[6,17],"ticks":2},{"ids":[6,21],"ticks":4},{"ids":[16,20],"ticks":1},{"ids":[10],"ticks":2},{"ids":[17],"ticks":2},{"ids":[13,17,20],"ticks":4},{"ids":[10,17,20],"ticks":2},{"ids":[6,20],"ticks":2},{"ids":[17],"ticks":4},{"ids":[10,17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[6,10,17],"ticks":2},{"ids":[20],"ticks":2},{"ids":[6,9,16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[9,16],"ticks":2},{"ids":[6,13],"ticks":2},{"ids":[2,15],"ticks":2},{"ids":[17],"ticks":2},{"ids":[6,15],"ticks":2},{"ids":[11,20],"ticks":2},{"ids":[6,15],"ticks":2},{"ids":[2,17],"ticks":2},{"ids":[15],"ticks":2},{"ids":[17],"ticks":2},{"ids":[9,19],"ticks":2},{"ids":[13,21],"ticks":2},{"ids":[17,18],"ticks":2},{"ids":[16,19],"ticks":2},{"ids":[13,17],"ticks":2},{"ids":[9,20],"ticks":2},{"ids":[5,15],"ticks":2},{"ids":[9,17],"ticks":2},{"ids":[12,20],"ticks":2},{"ids":[5,15],"ticks":2},{"ids":[9,17],"ticks":2},{"ids":[12,20],"ticks":2},{"ids":[13,19],"ticks":2},{"ids":[13,19],"ticks":2},{"ids":[12,16],"ticks":2},{"ids":[12,19],"ticks":2},{"ids":[10],"ticks":2},{"ids":[10],"ticks":2},{"ids":[5,12],"ticks":2},{"ids":[10],"ticks":2},{"ids":[5],"ticks":2},{"ids":[5],"ticks":2},{"ids":[4,8,13,15],"ticks":4},{"ids":[4,8,13,18,20],"ticks":4},{"ids":[11,12,13,17,19],"ticks":4},{"ids":[13,15],"ticks":2},{"ids":[4,11],"ticks":2},{"ids":[10,15,17],"ticks":4},{"ids":[4,13,18,20],"ticks":4},{"ids":[12,13,17,19],"ticks":2},{"ids":[11],"ticks":2},{"ids":[8,12,17,19],"ticks":2},{"ids":[4],"ticks":2},{"ids":[5,20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[5,9,20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[12,14,20],"ticks":2},{"ids":[20],"ticks":2},{"ids":[16,20,21],"ticks":2},{"ids":[12,14,16,20],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[7,16],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[16],"ticks":2},{"ids":[14,16],"ticks":2},{"ids":[12,16],"ticks":2},{"ids":[9,16],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[6,10,15,17],"ticks":4},{"ids":[6,9,14,16],"ticks":4},{"ids":[13,15,18,20],"ticks":4},{"ids":[17,20],"ticks":2},{"ids":[13,15],"ticks":2},{"ids":[6,10,15,17],"ticks":2},{"ids":[3],"ticks":2},{"ids":[6,8,13,15],"ticks":4},{"ids":[17],"ticks":2},{"ids":[13],"ticks":2},{"ids":[9,10,14,16],"ticks":2},{"ids":[6],"ticks":2},{"ids":[5,21],"ticks":2},{"ids":[21],"ticks":2},{"ids":[5,9,21],"ticks":2},{"ids":[21],"ticks":2},{"ids":[12,14,19,21],"ticks":2},{"ids":[21],"ticks":2},{"ids":[9,12,20],"ticks":2},{"ids":[14,16,19],"ticks":2},{"ids":[5,17],"ticks":2},{"ids":[7],"ticks":2},{"ids":[5,19],"ticks":4},{"ids":[14,20],"ticks":2},{"ids":[12],"ticks":2},{"ids":[2,9,15],"ticks":2},{"ids":[5],"ticks":2},{"ids":[4,16],"ticks":4},{"ids":[2,9,20],"ticks":4},{"ids":[4,11,16],"ticks":4},{"ids":[18],"ticks":2},{"ids":[16],"ticks":2},{"ids":[5,16],"ticks":2},{"ids":[14],"ticks":2},{"ids":[10,17],"ticks":2},{"ids":[12],"ticks":2},{"ids":[14],"ticks":4},{"ids":[7,21],"ticks":2},{"ids":[6],"ticks":2},{"ids":[6],"ticks":4},{"ids":[10,16],"ticks":2},{"ids":[13],"ticks":2},{"ids":[5],"ticks":4},{"ids":[9,15],"ticks":2},{"ids":[12],"ticks":2},{"ids":[4],"ticks":4},{"ids":[4],"ticks":4},{"ids":[4,15],"ticks":4},{"ids":[21],"ticks":4},{"ids":[2,20],"ticks":4},{"ids":[6,9,17],"ticks":4},{"ids":[9,13,15],"ticks":2},{"ids":[10],"ticks":2},{"ids":[8],"ticks":2},{"ids":[6],"ticks":2},{"ids":[3,21],"ticks":4},{"ids":[7,10,15],"ticks":4},{"ids":[10,12,15,17],"ticks":4},{"ids":[10],"ticks":2},{"ids":[8],"ticks":2},{"ids":[6,19],"ticks":2},{"ids":[10],"ticks":2},{"ids":[3,9,20],"ticks":2},{"ids":[10],"ticks":2},{"ids":[6,12,13,20],"ticks":2},{"ids":[10],"ticks":2},{"ids":[9,20],"ticks":2},{"ids":[10],"ticks":2},{"ids":[9,20],"ticks":2},{"ids":[10],"ticks":2},{"ids":[12],"ticks":2},{"ids":[10],"ticks":2},{"ids":[12],"ticks":2},{"ids":[10],"ticks":2},{"ids":[9],"ticks":2},{"ids":[10],"ticks":2},{"ids":[11,13,15,19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[17],"ticks":2},{"ids":[16],"ticks":2},{"ids":[15],"ticks":4},{"ids":[11,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[11],"ticks":1},{"ids":[20],"ticks":2},{"ids":[20],"ticks":4},{"ids":[15],"ticks":2},{"ids":[20],"ticks":2},{"ids":[15],"ticks":2},{"ids":[16],"ticks":2},{"ids":[12,14,16,17],"ticks":2},{"ids":[19],"ticks":2},{"ids":[20],"ticks":2},{"ids":[17],"ticks":4},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[12,16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":1},{"ids":[16],"ticks":2},{"ids":[16],"ticks":1},{"ids":[12],"ticks":6},{"ids":[15,16],"ticks":2},{"ids":[16],"ticks":2},{"ids":[17],"ticks":2},{"ids":[19],"ticks":2},{"ids":[20],"ticks":4},{"ids":[13,20],"ticks":1},{"ids":[20],"ticks":1},{"ids":[14],"ticks":1},{"ids":[20],"ticks":1},{"ids":[17],"ticks":1},{"ids":[20],"ticks":1},{"ids":[20],"ticks":2},{"ids":[21],"ticks":2},{"ids":[20],"ticks":1}];
  function defaultStore() {
    return {
      songs: [
        { name: "远航星的告别", bpm: 96, beats_per_measure: 4, notes: parseChart(CHART_TEXT) },
        { name: "且听风吟", bpm: 147, beats_per_measure: 4, notes: QTFY_NOTES },
      ],
      current: 0,
      countdown: 3,
      version: 2,
    };
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.songs) && s.songs.length) {
          s.songs.forEach((song) => {
            song.beats_per_measure = Math.max(1, Math.min(16, song.beats_per_measure | 0)) || 4;
            song.notes = (song.notes || []).map(normEvent).slice(0, MAX_NOTES);
          });
          s.countdown = Math.max(0, Math.min(60, s.countdown | 0));
          // 迁移：补入新增预设曲目（幂等，按曲名去重）
          if ((s.version | 0) < 2 && !s.songs.some((x) => x.name === "且听风吟")) {
            s.songs.push({ name: "且听风吟", bpm: 147, beats_per_measure: 4, notes: QTFY_NOTES });
          }
          s.version = 2;
          return s;
        }
      }
    } catch {
      /* 损坏数据忽略 */
    }
    return defaultStore();
  }
  const clone = (s) => JSON.parse(JSON.stringify(s));

  // 浏览器模式：跨页同步（Tauri 模式由 Rust 广播 store-updated 事件）
  if (!isTauri) {
    window.addEventListener("storage", (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          localStore = JSON.parse(e.newValue);
          emitLocal("store-updated", clone(localStore));
        } catch {
          /* 忽略损坏数据 */
        }
      }
    });
  }

  /* ---------- 浏览器预览播放器（无 Tauri 时模拟播放事件） ---------- */
  const player = { playing: false, paused: false, aborted: false };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 可暂停、可中断的等待；返回 false 表示应终止播放
  async function wait(ms) {
    let rem = ms;
    while (rem > 0) {
      if (player.aborted) return false;
      if (player.paused) {
        await sleep(50);
        continue;
      }
      const step = Math.min(50, rem);
      await sleep(step);
      rem -= step;
    }
    return true;
  }

  async function previewPlay(store) {
    player.playing = true;
    player.paused = false;
    player.aborted = false;
    const end = () => {
      player.playing = false;
      emitLocal("play-end");
    };
    let secs = store.countdown | 0;
    while (secs > 0) {
      emitLocal("countdown", secs);
      if (!(await wait(1000))) return end();
      secs--;
    }
    emitLocal("countdown", 0);
    const song = store.songs[store.current];
    if (!song) return end();
    const beat_ms = 60000 / Math.max(20, Math.min(600, song.bpm));
    const tick_ms = beat_ms / 4;
    for (let i = 0; i < song.notes.length; i++) {
      if (!(await wait(0))) return end();
      emitLocal("play-progress", i);
      const ev = song.notes[i];
      if (!(await wait(tick_ms * (ev.ticks || 4)))) return end();
    }
    end();
  }

  /* ---------- API：Tauri 模式走命令，浏览器模式走本地 ---------- */
  let localStore = loadLocal();
  async function localSave() {
    localStorage.setItem(LS_KEY, JSON.stringify(localStore));
    return clone(localStore);
  }

  const api = isTauri
    ? {
        getStore: () => tauri.core.invoke("get_store"),
        saveStore: (s) => tauri.core.invoke("save_store", { store: s }),
        selectSong: (i) => tauri.core.invoke("select_song", { index: i }),
        playCurrent: () => tauri.core.invoke("play_current"),
        pause: (p) => tauri.core.invoke("pause_score", { paused: p }),
        stop: () => tauri.core.invoke("stop_score"),
        gameRunning: () => tauri.core.invoke("game_running"),
        focusGame: () => tauri.core.invoke("focus_game"),
        exitApp: () => tauri.core.invoke("exit_app"),
        minimizeToTray: () => tauri.core.invoke("minimize_to_tray"),
        showOverlay: () => tauri.window.getByLabel("overlay")?.show(),
        hideOverlay: () => tauri.window.getByLabel("overlay")?.hide(),
      }
    : {
        getStore: async () => clone(localStore),
        saveStore: async (s) => {
          localStore = s;
          return localSave();
        },
        selectSong: async (i) => {
          player.aborted = true;
          localStore.current = Math.max(0, Math.min(localStore.songs.length - 1, i));
          return localSave();
        },
        playCurrent: async () => previewPlay(clone(localStore)),
        pause: async (p) => {
          player.paused = p;
        },
        stop: async () => {
          player.aborted = true;
          player.playing = false;
          emitLocal("play-end");
        },
        showOverlay: async () =>
          window.open("overlay.html", "wm-overlay", "width=310,height=220"),
        hideOverlay: async () => window.close(),
        exitApp: async () => {},
        minimizeToTray: async () => {},
      };

  return { isTauri, on, api, KEY_ROWS, KEY_TO_NOTE, noteHtml, MAX_NOTES, parseChart, normEvent, CHART_TEXT };
})();
