// Vân Du v64 — ngưỡng hồi máu theo loại Tiết.
// 2026-11-12, anh: Tiết thường máu < 20% mới xài đan, boss Tiết
// 12/24/36 máu < 50% xài. Trước đây mọi trận đều xài ở <= 50% nên đan
// hết sớm trước khi gặp boss. Test lái thẳng vanduBattleLoop bằng màn
// battle giả (Diễn Biến Hiệp Đấu + nút Cửu Chuyển Hoàn Hồn).
const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
function has(logs, sub, msg) {
  if (!logs.some((l) => l.includes(sub))) throw new Error(`${msg}: không thấy log chứa ${JSON.stringify(sub)} trong [${logs.join(' | ')}]`);
}
function lacks(logs, sub, msg) {
  if (logs.some((l) => l.includes(sub))) throw new Error(`${msg}: không được có log chứa ${JSON.stringify(sub)}`);
}

function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function battleScreen(hpPct, node) {
  const cur = hpPct * 5000000;
  return {
    msgId: 'battle-' + node + '-' + hpPct,
    text: `Tiết Điểm ${node}/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: ${fmt(cur)}/500.000.000\nQuái: 840.364.197/943.248.306 HP (89%)`,
    buttons: ['🗡️ Phá Giáp', 'Cửu Chuyển Hoàn Hồn'],
  };
}
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

async function runBattle(node, hpPct) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });
  bot.vanduNode = node;
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [battleScreen(hpPct, node), tripEndScreen];
  let current = null;
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    current = queue.shift();
    return current;
  };
  const clicks = [];
  bot.exec = async (js) => {
    const s = String(js);
    const m = s.match(/const needle = "([^"]*)"/);
    const needle = m ? m[1] : '';
    if (needle) {
      const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
      if (!btn) return null;
      if (needle.includes('cuu chuyen hoan hon')) clicks.push('dan');
      if (needle.includes('pha giap')) clicks.push('pha giap');
      return btn;
    }
    return 'clicked';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduBattleLoop(1);
  return { bot, logs, clicks };
}

// Như runBattle nhưng màn battle tự viết (để giả lập màn boss: số Tiết
// trong màn khác số node bot đang giữ, hoặc màn có chữ boss).
async function runBattleText(presetNode, text, lastBuffNode, buttons) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });
  bot.vanduNode = presetNode;
  if (lastBuffNode !== undefined) bot.vanduLastBuffNode = lastBuffNode;
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [{ msgId: 'battle-x', text, buttons: buttons || ['🗡️ Phá Giáp', 'Cửu Chuyển Hoàn Hồn'] }, tripEndScreen];
  let current = null;
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    current = queue.shift();
    return current;
  };
  const clicks = [];
  bot.exec = async (js) => {
    const s = String(js);
    const m = s.match(/const needle = "([^"]*)"/);
    const needle = m ? m[1] : '';
    if (needle) {
      const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
      if (!btn) return null;
      if (needle.includes('cuu chuyen hoan hon')) clicks.push('dan');
      if (needle.includes('pha giap')) clicks.push('pha giap');
      return btn;
    }
    return 'clicked';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduBattleLoop(1);
  return { bot, logs, clicks };
}

(async () => {
  // Ngưỡng: boss 12/24/36 là 50, còn lại (kể cả không đọc được Tiết) là 20.
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    eq(bot.vanduHealThreshold(12), 50, 'boss Tiet 12 nguong 50');
    eq(bot.vanduHealThreshold(24), 50, 'boss Tiet 24 nguong 50');
    eq(bot.vanduHealThreshold(36), 50, 'boss Tiet 36 nguong 50');
    eq(bot.vanduHealThreshold(1), 20, 'Tiet 1 nguong 20');
    eq(bot.vanduHealThreshold(11), 50, 'vung boss Tiet 11 nguong 50');
    eq(bot.vanduHealThreshold(13), 20, 'Tiet 13 nguong 20');
    eq(bot.vanduHealThreshold(23), 50, 'vung boss Tiet 23 nguong 50');
    eq(bot.vanduHealThreshold(35), 50, 'vung boss Tiet 35 nguong 50');
    eq(bot.vanduHealThreshold(0), 20, 'khong doc duoc Tiet tinh nhu thuong (20)');
  }

  // A: Tiết thường 13, HP 45% — KHÔNG xài đan, đánh skill tiếp.
  // (Trước đây dùng Tiết 23 làm ví dụ thường, nhưng 23 là vùng boss
  // nên ngưỡng 50 — xem case N.)
  {
    const { logs, clicks } = await runBattle(13, 45);
    eq(clicks.includes('dan'), false, 'A: Tiet thuong HP 45% khong duoc xai dan');
    eq(clicks.includes('pha giap'), true, 'A: khong xai dan thi phai danh skill');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'A: khong duoc log hoi mau');
    has(logs, 'Vân Du [Tiết 13]: vào trận', 'A: log vao tran van ghi Tiet (v63)');
  }

  // N (v78): Tiết 23 là vùng boss (boss 24 chen vào khi node còn 23)
  // nên HP 45% (<50%) phải xài đan như boss, không giữ ngưỡng 20.
  {
    const { logs, clicks } = await runBattle(23, 45);
    eq(clicks.includes('dan'), true, 'N: vung boss Tiet 23 HP 45% phai xai dan');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 45%, Tiết 23)', 'N: phai log hoi mau HP 45% Tiet 23');
  }

  // B: boss Tiết 12, HP 45% — xài đan.
  {
    const { logs, clicks } = await runBattle(12, 45);
    eq(clicks.includes('dan'), true, 'B: boss Tiet 12 HP 45% phai xai dan');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 45%, Tiết 12)', 'B: phai log hoi mau HP 45% Tiet 12');
  }

  // C: Tiết thường 23, HP 15% — xài đan (15 < 20).
  {
    const { logs, clicks } = await runBattle(23, 15);
    eq(clicks.includes('dan'), true, 'C: Tiet thuong HP 15% phai xai dan');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 15%, Tiết 23)', 'C: phai log hoi mau HP 15% Tiet 23');
  }

  // D: boss Tiết 24, HP đúng 50% — KHÔNG xài (luật là < 50%, không phải <=).
  {
    const { logs, clicks } = await runBattle(24, 50);
    eq(clicks.includes('dan'), false, 'D: boss HP dung 50% khong xai (can < 50%)');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'D: khong duoc log hoi mau');
  }

  // E: Tiết thường 13, HP đúng 20% — KHÔNG xài (luật là < 20%).
  {
    const { logs, clicks } = await runBattle(13, 20);
    eq(clicks.includes('dan'), false, 'E: Tiet thuong HP dung 20% khong xai (can < 20%)');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'E: khong duoc log hoi mau');
  }

  // F (v68, log 09:52:03-19): boss Tiết 12 chen vào, node bot còn 11,
  // HP 40% — màn boss có chữ Vực Cảnh / Mảnh Cổ Khí thì ngưỡng vẫn 50%.
  {
    const bossText = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: 200.000.000/500.000.000\nQuái: 2.205.862.109/2.205.862.109 HP (100%)\nNGUY HIỂM TỘT CÙNG! Cột mốc Vực Cảnh I bị phong tỏa bởi [Hư Ảo] Thiết Mao Hắc Lang!\nHạ gục quái này để nhận ngay 5 - 10 Mảnh Cổ Khí và Thẻ Buff Tím/Vàng!`;
    const { logs, clicks } = await runBattleText(11, bossText);
    eq(clicks.includes('dan'), true, 'F: man boss (Vuc Canh/Manh Co Khi) HP 40% phai xai dan du node con 11');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 40%', 'F: phai log hoi mau HP 40%');
  }

  // G (v68): màn battle tự ghi Tiết Điểm 12/36 nhưng node bot còn 11 —
  // battle loop phải đọc lại Tiết từ màn, ngưỡng 50%.
  {
    const screen12 = `Tiết Điểm 12/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: 200.000.000/500.000.000\nQuái: 840.364.197/943.248.306 HP (89%)`;
    const { logs, clicks } = await runBattleText(11, screen12);
    eq(clicks.includes('dan'), true, 'G: man battle ghi Tiet 12 thi phai xai dan du node cu la 11');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 40%, Tiết 12)', 'G: phai log hoi mau HP 40% Tiet 12');
  }

  // H (v69, log 10:57:43): trận sau bảng buff ở Tiết 11 là boss 12 —
  // màn battle không có chữ Vực Cảnh / Mảnh Cổ Khí, số Tiết vẫn 11,
  // nhưng buff vừa chọn ở Tiết 11 nên ngưỡng vẫn 50%.
  {
    const screen11 = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: 200.000.000/500.000.000\nQuái: 2.205.862.109/2.205.862.109 HP (100%)`;
    const { logs, clicks } = await runBattleText(11, screen11, 11);
    eq(clicks.includes('dan'), true, 'H: tran sau buff o Tiet 11 (boss 12) HP 40% phai xai dan');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 40%', 'H: phai log hoi mau HP 40%');
  }

  // I (v69, sửa v78): chẩn đoán — máu 40% ở Tiết 11 (vùng boss,
  // ngưỡng 50) mà hết đan thì không hồi được, log 1 lần lý do.
  {
    const screen11 = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: 200.000.000/500.000.000\nQuái: 840.364.197/943.248.306 HP (89%)`;
    const { logs, clicks } = await runBattleText(11, screen11, 0, ['🗡️ Phá Giáp']);
    eq(clicks.includes('dan'), false, 'I: het dan thi khong xai duoc du HP 40% < 50');
    has(logs, 'máu 40% <50% nhưng không hồi (ngưỡng 50, đan 0/3, boss=không, Tiết 11)', 'I: phai log chan doan ly do khong hoi');
  }

  // J (không phá đường thường): Tiết 11, HP 15% (<20%) thì xài đan
  // như luật thường, kể cả khi không có buff ở Tiết 11.
  {
    const { logs, clicks } = await runBattle(11, 15);
    eq(clicks.includes('dan'), true, 'J: Tiet thuong HP 15% phai xai dan');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 15%, Tiết 11)', 'J: phai log hoi mau HP 15% Tiet 11');
  }

  // K (không phá ngưỡng boss): trận sau buff ở Tiết 11 nhưng HP 55%
  // (>=50%) thì không xài, kể cả boss.
  {
    const screen11 = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nDiễn Biến Hiệp Đấu\nHòa: 275.000.000/500.000.000\nQuái: 2.205.862.109/2.205.862.109 HP (100%)`;
    const { logs, clicks } = await runBattleText(11, screen11, 11);
    eq(clicks.includes('dan'), false, 'K: boss HP 55% khong xai (can < 50%)');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'K: khong duoc log hoi mau');
  }

  // L (v78, ảnh battle thật 2026-11-13 07:37 + thua boss Tiết 12):
  // trận sau buff ở Tiết 11 là boss 12 — Trạng Thái ghi HP 40% nhưng
  // Diễn Biến còn cặp đầu 100% (hiệp 1). Code cũ đọc 100% nên không
  // hồi; code mới đọc 40% từ Trạng Thái nên phải xài đan.
  {
    const screen11 = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nHiệp cái: 235.445.079/588.612.697 HP (40%)\n[Tiên Tiểu Hư Ảo] Thiết Mao Hắc Lang: 2.205.862.109/2.205.862.109 HP (100%)\nDiễn Biến Hiệp Đấu\nHiệp cái: 588.612.697/588.612.697\nHiệp cái: 419.018.128/588.612.697`;
    const { logs, clicks } = await runBattleText(11, screen11, 11);
    eq(clicks.includes('dan'), true, 'L: boss 12 HP that 40% (Trang Thai) phai xai dan du Dien Bien con cap 100%');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 40%', 'L: phai log hoi mau HP 40%');
  }

  // M (v78, log thật 07:40:49-51): trận boss ở Tiết 11 nhưng buff cuối
  // ở Tiết 10 (Kỳ Duyên Môn chen vào ở Tiết 11) nên luật v69 trượt —
  // vùng boss 11/23/35 giờ ngưỡng 50 luôn thì HP 26% phải xài đan.
  {
    const screen11 = `Tiết Điểm 11/36\nTrạng Thái Chiến Trường\nHiệp cái: 153.039.301/588.612.697 HP (26%)\n[Hư Ảo] Thiết Mao Hắc Lang: 2.205.862.109/2.205.862.109 HP (100%)\nDiễn Biến Hiệp Đấu\nHiệp cái: 588.612.697/588.612.697\nHiệp cái: 419.018.128/588.612.697`;
    const { logs, clicks } = await runBattleText(11, screen11, 10);
    eq(clicks.includes('dan'), true, 'M: vung boss Tiet 11 HP 26% phai xai dan du khong co buff o Tiet 11');
    has(logs, 'hồi máu bằng Cửu Chuyển (HP 26%', 'M: phai log hoi mau HP 26%');
  }

  console.log('vandu-heal-threshold: OK');
})().catch((e) => { console.error(e); process.exit(1); });
