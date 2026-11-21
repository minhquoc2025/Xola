// Vân Du v105 — bắt chính xác tầng boss 12/24/36.
// Anh 2026-11-21, 7 log 19-20/11: boss đánh khi node còn lag 11/23/35,
// cả 3 cơ chế cũ đều trượt cùng lúc ở Tiết 35 (buff cuối ở 34, Tiết 35
// là tiết điểm phụ bấm Rời đi rồi mới vào boss 36) — 4/4 trận boss 36
// đều ghi ⚔️ QUÁI, thua cả 4, chưa từng thắng boss 36; ngược lại luồng
// buff còn nhận nhầm trận thường Băng Tuyết Dạ Báo ở 11/23 thành BOSS.
// v105: nhận boss theo TÊN QUÁI + VÙNG TIẾT — boss luôn là Thiết Mao
// Hắc Lang mang tiền tố tông ([Huyết Tế]/[Cuồng Bạo]/[Cương Thể]/[Hư Ảo])
// ở 11/23/35; [Diệt Tuyệt] Lang là quái thường (gặp ở mọi Tiết).
// Mọi log battle ghi tầng boss THẬT (12/24/36) thay vì node lag.
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
function lineWith(logs, sub, msg) {
  const l = logs.find((x) => x.includes(sub));
  if (!l) throw new Error(`${msg}: không thấy dòng chứa ${JSON.stringify(sub)} trong [${logs.join(' | ')}]`);
  return l;
}

function unitBot() {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.logDebug = () => {};
  return { bot, logs };
}

function battleText(playerHp, monsterName, monsterHp) {
  // Màn battle thật: TRẠNG THÁI trên, Diễn Biến dưới, KHÔNG ghi Tiết Điểm
  // (v68: màn battle không ghi Tiết Điểm 12/36 nên node lag ở 11/23/35).
  return `TRẠNG THÁI CHIẾN TRƯỜNG
Hiệp cái: ${playerHp} HP (100%)
${monsterName}: ${monsterHp} HP (100%)
DIỄN BIẾN HIỆP ĐẤU
Hiệp cái: 588612697/588612697`;
}
const BATTLE_BTNS = ['Kiếm Cơ Bản', 'Kim Đan Phá Sát', 'Hư Không Đại Na Di', 'Lôi Đình Vạn Quân', 'Cửu Chuyển Hoàn Hồn'];
const LOSS_BOARD_TEXT = `[Thiên Sơn Tuyết Lãnh] Trùng Chinh Đạo Tâm — Rơi Về Chặng 31
Đạo hữu vừa bị sóng cấm chế chấn thương đánh bật lùi về Tiết Điểm 31! May nhờ Đạo Tâm Mệnh Hồn che chở, sinh cơ vẫn chưa đứt đoạn. Hãy tĩnh tâm vận công, chấn chỉnh khí thế để tiếp tục dấn bước!
Đạo Tâm Mệnh Hồn (2/4 Mạng)`;
const LOSS_BOARD_BTNS = ['Tiếp Tục Tiến Sâu'];
const DOOR_TEXT = `Tiến Trình Tiết Điểm 13/36
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]`;
const DOOR_BTNS = ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'];

function battleBot(screens, node, lastBuffNode) {
  const { bot, logs } = unitBot();
  bot.isRunning = true;
  bot.runId = 1;
  bot.vanduSkillOrder = ['Kim Đan Phá Sát', 'Hư Không Đại Na Di'];
  bot.skillClickDelayMs = 1000;
  bot.vanduNode = node;
  bot.vanduLastBuffNode = lastBuffNode;
  bot.vanduBuffClicks = 5;
  bot.vanduOwnedBuffs = { 'Thái Ất': 2 };
  bot.vanduSectCounts = { 'Thuật': 2 };
  bot.vanduCounterPicks = 1;
  bot.delay = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  let i = 0;
  bot.vanduScanLatest = async () => {
    const s = screens[Math.min(i, screens.length - 1)];
    i++;
    return s;
  };
  bot.vanduClickButton = async (needle) => needle;
  return { bot, logs };
}

(async () => {
  // 1. vanduIsBossByEnemy — 4 tiền tố tông ở 11/23/35 đều là boss.
  {
    const { bot } = unitBot();
    for (const prefix of ['[Huyết Tế]', '[Cuồng Bạo]', '[Cương Thể]', '[Hư Ảo]']) {
      for (const node of [11, 23, 35]) {
        eq(bot.vanduIsBossByEnemy(`${prefix} Thiết Mao Hắc Lang`, node), true,
          `bossByEnemy: ${prefix} Lang o Tiet ${node} phai la boss`);
      }
    }
  }
  // 2. vanduIsBossByEnemy — [Diệt Tuyệt] Lang ở 11/23/35 là quái thường.
  {
    const { bot } = unitBot();
    for (const node of [11, 23, 35]) {
      eq(bot.vanduIsBossByEnemy('[Diệt Tuyệt] Thiết Mao Hắc Lang', node), false,
        `bossByEnemy: [Diet Tuyet] Lang o Tiet ${node} KHONG phai boss`);
    }
  }
  // 3. vanduIsBossByEnemy — Băng Tuyết Dạ Báo ở 11/23/35 không phải boss.
  {
    const { bot } = unitBot();
    for (const name of ['[Huyết Tế] Băng Tuyết Dạ Báo', '[Hư Ảo] Băng Tuyết Dạ Báo', 'Linh Tuyền Thủ Thú [[Hư Ảo] Băng Tuyết Dạ Báo]']) {
      for (const node of [11, 23, 35]) {
        eq(bot.vanduIsBossByEnemy(name, node), false,
          `bossByEnemy: ${name} o Tiet ${node} KHONG phai boss`);
      }
    }
  }
  // 4. vanduIsBossByEnemy — Lang 4 tiền tố ở ngoài vùng 11/23/35 là quái thường.
  {
    const { bot } = unitBot();
    for (const node of [1, 10, 16, 22, 34]) {
      eq(bot.vanduIsBossByEnemy('[Huyết Tế] Thiết Mao Hắc Lang', node), false,
        `bossByEnemy: Lang o Tiet ${node} (ngoai vung boss) KHONG phai boss`);
    }
  }
  // 5. vanduIsBossByEnemy — tên rỗng / 'Quái' / thiếu tiền tố -> false;
  // tên không dấu vẫn nhận (vanduNormalize).
  {
    const { bot } = unitBot();
    eq(bot.vanduIsBossByEnemy('', 11), false, 'bossByEnemy: ten rong -> false');
    eq(bot.vanduIsBossByEnemy('Quái', 11), false, 'bossByEnemy: Quai -> false');
    eq(bot.vanduIsBossByEnemy(null, 11), false, 'bossByEnemy: null -> false');
    eq(bot.vanduIsBossByEnemy('Thiết Mao Hắc Lang', 11), false, 'bossByEnemy: Lang khong tien to -> false');
    eq(bot.vanduIsBossByEnemy('[Huyet Te] Thiet Mao Hac Lang', 11), true, 'bossByEnemy: ten khong dau van nhan');
  }
  // 6. vanduBossFloor — tầng boss thật.
  {
    const { bot } = unitBot();
    eq(bot.vanduBossFloor(11, true), 12, 'bossFloor: 11 + boss -> 12');
    eq(bot.vanduBossFloor(23, true), 24, 'bossFloor: 23 + boss -> 24');
    eq(bot.vanduBossFloor(35, true), 36, 'bossFloor: 35 + boss -> 36');
    eq(bot.vanduBossFloor(12, true), 12, 'bossFloor: 12 + boss (node kip len) -> 12');
    eq(bot.vanduBossFloor(24, true), 24, 'bossFloor: 24 + boss -> 24');
    eq(bot.vanduBossFloor(36, true), 36, 'bossFloor: 36 + boss -> 36');
    eq(bot.vanduBossFloor(11, false), 11, 'bossFloor: 11 thuong -> 11');
    eq(bot.vanduBossFloor(5, false), 5, 'bossFloor: 5 thuong -> 5');
    eq(bot.vanduBossFloor(5, true), 5, 'bossFloor: 5 + boss (ngoai vung) -> 5');
  }
  // 7. Vòng battle — boss 36 theo log 2026-11-19 09:36: buff cuối ở Tiết 34,
  // Tiết 35 là tiết điểm phụ (không buff), vào trận gặp [Huyết Tế] Lang ở
  // node 35, màn không có chữ Vực Cảnh — trước v105 ghi ⚔️ QUÁI + Tiết 35.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b36', text: battleText('588.612.697/588.612.697', '[Huyết Tế] Thiết Mao Hắc Lang', '900.000.000/900.000.000'), buttons: BATTLE_BTNS },
      { msgId: 'loss', text: LOSS_BOARD_TEXT, buttons: LOSS_BOARD_BTNS },
    ], 35, 34);
    await bot.vanduBattleLoop(1);
    const start = lineWith(logs, '[Trận đấu', 'boss36: phai co dong bat dau tran');
    if (!start.includes('👑 BOSS')) throw new Error('boss36: tran Lang Tiet 35 phai gan nhan BOSS, thực tế: ' + start);
    if (!start.includes('(Tiết 36)')) throw new Error('boss36: dong bat dau phai ghi (Tiết 36), thực tế: ' + start);
    if (start.includes('⚔️ QUÁI')) throw new Error('boss36: dong bat dau KHONG duoc ghi QUAI, thực tế: ' + start);
    const defeat = lineWith(logs, 'THẤT BẠI', 'boss36: phai co dong THAT BAI');
    if (!defeat.includes('ở Tiết 36')) throw new Error('boss36: dong thua phai ghi ở Tiết 36, thực tế: ' + defeat);
    if (defeat.includes('Tiết 35')) throw new Error('boss36: dong thua KHONG duoc ghi Tiết 35, thực tế: ' + defeat);
    lacks(logs, 'CHIẾN THẮNG', 'boss36: thua KHONG duoc log CHIEN THANG');
  }
  // 8. Vòng battle — trận thường Báo ở Tiết 11 sau buff ở Tiết 11: luồng
  // v69 cũ nhận nhầm thành BOSS (2 ca trong 7 log) — v105 phải ghi QUÁI.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b11', text: battleText('588.612.697/588.612.697', '[Hư Ảo] Băng Tuyết Dạ Báo', '824.057.635/824.057.635'), buttons: BATTLE_BTNS },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ], 11, 11);
    await bot.vanduBattleLoop(1);
    const start = lineWith(logs, '[Trận đấu', 'bao11: phai co dong bat dau tran');
    if (!start.includes('⚔️ QUÁI')) throw new Error('bao11: tran Bao Tiet 11 phai gan QUAI, thực tế: ' + start);
    if (start.includes('👑 BOSS')) throw new Error('bao11: tran Bao Tiet 11 KHONG duoc gan BOSS, thực tế: ' + start);
    if (start.includes('(Tiết 12)')) throw new Error('bao11: tran thuong KHONG duoc ghi (Tiết 12), thực tế: ' + start);
    const win = lineWith(logs, 'CHIẾN THẮNG', 'bao11: phai co dong CHIEN THANG');
    if (!win.includes('(Tiết 11)')) throw new Error('bao11: dong thang phai ghi (Tiết 11), thực tế: ' + win);
  }
  // 9. Vòng battle — [Diệt Tuyệt] Lang ở Tiết 11 là quái thường.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b11', text: battleText('588.612.697/588.612.697', '[Diệt Tuyệt] Thiết Mao Hắc Lang', '800.000.000/800.000.000'), buttons: BATTLE_BTNS },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ], 11, 8);
    await bot.vanduBattleLoop(1);
    const start = lineWith(logs, '[Trận đấu', 'diet11: phai co dong bat dau tran');
    if (!start.includes('⚔️ QUÁI')) throw new Error('diet11: [Diet Tuyet] Lang Tiet 11 phai gan QUAI, thực tế: ' + start);
    if (start.includes('👑 BOSS')) throw new Error('diet11: [Diet Tuyet] Lang KHONG duoc gan BOSS, thực tế: ' + start);
  }
  // 10. Vòng battle — thắng boss 12: [Hư Ảo] Lang ở node 11, thắng thì
  // log bắt đầu + log thắng đều ghi Tiết 12 (không phải 11).
  {
    const { bot, logs } = battleBot([
      { msgId: 'b12', text: battleText('588.612.697/588.612.697', '[Hư Ảo] Thiết Mao Hắc Lang', '700.000.000/700.000.000'), buttons: BATTLE_BTNS },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ], 11, 8);
    await bot.vanduBattleLoop(1);
    const start = lineWith(logs, '[Trận đấu', 'boss12: phai co dong bat dau tran');
    if (!start.includes('👑 BOSS')) throw new Error('boss12: tran Lang Tiet 11 phai gan BOSS, thực tế: ' + start);
    if (!start.includes('(Tiết 12)')) throw new Error('boss12: dong bat dau phai ghi (Tiết 12), thực tế: ' + start);
    const win = lineWith(logs, 'CHIẾN THẮNG', 'boss12: phai co dong CHIEN THANG');
    if (!win.includes('(Tiết 12)')) throw new Error('boss12: dong thang phai ghi (Tiết 12), thực tế: ' + win);
    if (win.includes('(Tiết 11)')) throw new Error('boss12: dong thang KHONG duoc ghi (Tiết 11), thực tế: ' + win);
  }
  // 11. Cơ chế chữ Vực Cảnh (v68) vẫn còn: màn battle có chữ Vực Cảnh thì
  // là boss dù tên quái là Báo (màn chuyển boss mang chữ này).
  {
    const { bot, logs } = battleBot([
      { msgId: 'b23', text: `Cột mốc Vực Cảnh đã bị phong tỏa\n` + battleText('588.612.697/588.612.697', '[Hư Ảo] Băng Tuyết Dạ Báo', '824.057.635/824.057.635'), buttons: BATTLE_BTNS },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ], 23, 20);
    await bot.vanduBattleLoop(1);
    const start = lineWith(logs, '[Trận đấu', 'vuccanh: phai co dong bat dau tran');
    if (!start.includes('👑 BOSS')) throw new Error('vuccanh: man co chu Vuc Canh phai gan BOSS, thực tế: ' + start);
  }

  // 12. V106: Boss 24 khi mạng > 1 (ví dụ 4/4 hoặc 2/4) -> BẬT CHẾ ĐỘ CỐ CHẾT:
  // - Chỉ click 'Kiếm Cơ Bản', KHÔNG click skill combo (Kim Đan Phá Sát, Hư Không Đại Na Di)
  // - KHÔNG dùng đan 'Cửu Chuyển Hoàn Hồn' dù máu tụt xuống 30% (< 65%)
  // - Cập nhật vanduNode lên 24
  {
    const clickedBtns = [];
    const { bot, logs } = battleBot([
      { msgId: 'b24-1', text: battleText('176.583.809/588.612.697', '[Cương Thể] Thiết Mao Hắc Lang', '900.000.000/900.000.000').replace('HP (100%)', 'HP (30%)'), buttons: BATTLE_BTNS },
      { msgId: 'b24-2', text: battleText('100.000.000/588.612.697', '[Cương Thể] Thiết Mao Hắc Lang', '880.000.000/900.000.000').replace('HP (100%)', 'HP (17%)'), buttons: BATTLE_BTNS },
      { msgId: 'loss', text: LOSS_BOARD_TEXT, buttons: LOSS_BOARD_BTNS },
    ], 23, 20);
    bot.vanduLives = 3; // mạng > 1
    bot.vanduClickButton = async (needle) => { clickedBtns.push(needle); return needle; };
    await bot.vanduBattleLoop(1);
    eq(bot.vanduNode, 24, 'boss24 die-mode: vanduNode phai cap nhat len 24');
    eq(clickedBtns, ['Kiếm Cơ Bản', 'Kiếm Cơ Bản'], 'boss24 die-mode (lives=3): chi duoc click Kiem Co Ban, khong dung dan va khong dung combo');
    has(logs, 'BẬT CHẾ ĐỘ CỐ CHẾT', 'boss24 die-mode: phai log thong bao bat che do co chet');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'boss24 die-mode: khong duoc hoi mau bang Cuu Chuyen');
    eq(bot.vanduLives, 2, 'boss24 die-mode: sau khi thua mang giam tu 3 xuong 2');
  }

  // 13. V106: Boss 24 khi mạng == 1 (mạng cuối cùng) -> ĐÁNH THẬT:
  // - Hồi máu bằng Cửu Chuyển khi HP < 65%
  // - Đánh đúng combo cấu hình ('Kim Đan Phá Sát', 'Hư Không Đại Na Di')
  {
    const clickedBtns = [];
    const { bot, logs } = battleBot([
      // Hiệp 1: HP 30% (< 65%) -> phải ăn đan Cửu Chuyển trước
      { msgId: 'b24-real-1', text: battleText('176.583.809/588.612.697', '[Cương Thể] Thiết Mao Hắc Lang', '900.000.000/900.000.000').replace('HP (100%)', 'HP (30%)'), buttons: BATTLE_BTNS },
      // Sau khi ăn đan, HP 80% -> đánh skill 1 trong combo (Kim Đan Phá Sát)
      { msgId: 'b24-real-2', text: battleText('470.890.157/588.612.697', '[Cương Thể] Thiết Mao Hắc Lang', '900.000.000/900.000.000').replace('HP (100%)', 'HP (80%)'), buttons: ['Kiếm Cơ Bản', 'Kim Đan Phá Sát', 'Hư Không Đại Na Di'] },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ], 23, 20);
    bot.vanduLives = 1; // mạng cuối cùng
    bot.vanduClickButton = async (needle) => { clickedBtns.push(needle); return needle; };
    await bot.vanduBattleLoop(1);
    eq(clickedBtns, ['Cửu Chuyển Hoàn Hồn', 'Kim Đan Phá Sát'], 'boss24 real-mode (lives=1): phai hoi mau Cuu Chuyen va danh skill combo');
    has(logs, 'ĐÁNH THẬT theo combo cấu hình', 'boss24 real-mode: phai log danh that');
    lacks(logs, 'BẬT CHẾ ĐỘ CỐ CHẾT', 'boss24 real-mode: khong duoc bat che do co chet khi mang = 1');
  }

  // 14. V106: Boss 12 và Boss 36 KHÔNG bật chế độ cố chết dù mạng > 1 (ví dụ 4/4)
  {
    for (const node of [11, 35]) {
      const clickedBtns = [];
      const { bot, logs } = battleBot([
        { msgId: 'b-other', text: battleText('588.612.697/588.612.697', '[Cương Thể] Thiết Mao Hắc Lang', '900.000.000/900.000.000'), buttons: BATTLE_BTNS },
        { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
      ], node, node - 1);
      bot.vanduLives = 4;
      bot.vanduClickButton = async (needle) => { clickedBtns.push(needle); return needle; };
      await bot.vanduBattleLoop(1);
      eq(clickedBtns, ['Kim Đan Phá Sát'], `boss ở node ${node} (lives=4) phai danh combo that, khong co chet`);
      lacks(logs, 'BẬT CHẾ ĐỘ CỐ CHẾT', `boss ở node ${node} khong duoc bat che do co chet`);
    }
  }

  console.log('vandu-boss-floor: OK');
})().catch((e) => { console.error(e); process.exit(1); });
