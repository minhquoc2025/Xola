// Vân Du v96 — log chi tiết battle/buff, nối commit fix vandu (bbd3bcb).
// Anh 2026-11-17: bot không thắng được boss 24, cần log chi tiết battle
// (Tiết + số buff đã click) để nghiên cứu logic chọn buff. Commit bbd3bcb
// của anh đã thêm: log bắt đầu trận (quái/HP/đan/buff), log từng hiệp,
// log kết thúc thắng/thua, log bảng buff, đếm vanduBuffClicks. v96 làm
// tiếp các chỗ còn thiếu:
//  (1) thua trận còn Đạo Tâm hiện bảng "Rơi Về Chặng" — vòng battle cũ
//      rơi xuống nhánh victory và log nhầm CHIẾN THẮNG;
//  (2) timeout không có dòng tổng kết;
//  (3) log thắng không ghi danh sách buff (bộ buff thắng boss mới là
//      dữ liệu quý nhất để so với bộ buff thua);
//  (4) sau Đổi Vận, bảng mới không được log lại (boardLogged còn true).
// Test thuần (pure) + test vòng battle với màn giả lập (stub scan/click).
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

function unitBot() {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.logDebug = () => {};
  return { bot, logs };
}

// Màn battle boss Tiết 24 — số liệu theo mẫu thật 2026-11-13 (người chơi
// max 588.612.697; quái Hư Ảo): TRẠNG THÁI trên, Diễn Biến dưới.
const BATTLE_24_TEXT = `TRẠNG THÁI CHIẾN TRƯỜNG
Hiệp cái: 300.000.000/588.612.697 HP (51%)
[Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo: 700.000.000/824.057.635 HP (85%)
DIỄN BIẾN HIỆP ĐẤU
Hiệp cái: 300000000/588612697
Tiến Trình Tiết Điểm 24/36`;
const BATTLE_24_BTNS = ['Kiếm Cơ Bản', 'Kim Đan Phá Sát', 'Hư Không Đại Na Di', 'Lôi Đình Vạn Quân', 'Cửu Chuyển Hoàn Hồn'];

// Bảng thua boss — mẫu thật walkthrough 2026-11-04 bước 22 (thua boss 12,
// về Chặng 7), đổi sang Chặng 19 cho boss 24 (lùi 5 Tiết).
const LOSS_BOARD_TEXT = `[Thiên Sơn Tuyết Lãnh] Trùng Chinh Đạo Tâm — Rơi Về Chặng 19
Đạo hữu vừa bị sóng cấm chế chấn thương đánh bật lùi về Tiết Điểm 19! May nhờ Đạo Tâm Mệnh Hồn che chở, sinh cơ vẫn chưa đứt đoạn. Hãy tĩnh tâm vận công, chấn chỉnh khí thế để tiếp tục dấn bước!
Đạo Tâm Mệnh Hồn (2/3 Mạng)`;
const LOSS_BOARD_BTNS = ['Tiếp Tục Tiến Sâu'];

// Bảng cuối (hết Đạo Tâm) — walkthrough bước cuối: "Tử Trận Trước...".
const FINAL_BOARD_TEXT = `Tiết Điểm 12: Tử Trận Trước [Hư Ảo] Thiết Mao Hắc Lang → Hết sinh mệnh đạo tâm, thất bại tại Tiết Điểm 12/36!`;

// Màn cửa sau khi thắng — không có dấu hiệu battle, không có dấu hiệu thua.
const DOOR_25_TEXT = `Tiến Trình Tiết Điểm 25/36
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]`;
const DOOR_25_BTNS = ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'];

// Bảng qua ải sau giải đố đúng — cùng nút "Tiếp Tục Tiến Sâu" như bảng
// thua (walkthrough bước 26) nhưng nội dung khác, không được nhận nhầm.
const PASS_BOARD_TEXT = `Bảng Tiếp Tục Hành Trình
Chúc mừng đạo hữu đã giải đúng Bát Quái, tiếp tục dấn bước sang chặng kế!`;

// Bảng bẫy Phá Phong Ấn thất bại — có chữ "thất bại" nhưng không phải
// thua trận, không được nhận nhầm thành defeat.
const TRAP_BOARD_TEXT = `Cổ Thạch Hòm
Phá Phong Ấn thất bại! Bẫy quái xuất hiện, chuẩn bị chiến đấu!`;

function battleBot(screens) {
  const { bot, logs } = unitBot();
  bot.isRunning = true;
  bot.runId = 1;
  bot.vanduSkillOrder = ['Kim Đan Phá Sát', 'Hư Không Đại Na Di'];
  bot.skillClickDelayMs = 1000;
  bot.vanduNode = 24;
  bot.vanduBuffClicks = 7;
  bot.vanduOwnedBuffs = { 'Thái Ất': 2, 'Kiếm X': 1 };
  bot.vanduSectCounts = { 'Thuật': 2, 'Kiếm': 1 };
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
  // 1. vanduEnemyInfo — số thật 2026-11-13: người chơi 161.131.770 /
  // 588.612.697 HP (27%), quái [Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo
  // 215.610.327/824.057.635 HP (26%) -> tên quái, HP 26%, khắc Ma.
  {
    const { bot } = unitBot();
    const text = `TRẠNG THÁI CHIẾN TRƯỜNG
Hiệp cái: 161.131.770/588.612.697 HP (27%)
[Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo: 215.610.327/824.057.635 HP (26%)
DIỄN BIẾN HIỆP ĐẤU
Hiệp cái: 419018128/588612597
Tiến Trình Tiết Điểm 12/36`;
    const e = bot.vanduEnemyInfo(text);
    eq(e.name, '[Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo', 'enemyInfo: ten quai that 2026-11-13');
    eq(e.hpPct, 26, 'enemyInfo: HP quai 26%');
    eq(e.counterSect, 'Ma', 'enemyInfo: quai Hu Ao -> khac Ma');
  }
  // 2. vanduEnemyInfo — chỉ có máu mình, không có dòng quái -> 'Quái'.
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo('Hiệp cái: 100/200 HP (50%)\nTiến Trình Tiết Điểm 5/36');
    eq(e.name, 'Quái', 'enemyInfo: khong co dong quai -> Quai');
    eq(e.hpPct, null, 'enemyInfo: khong co HP quai -> null');
  }
  // 3. vanduEnemyInfo — boss chỉ hiện lời giới thiệu, không có dòng HP.
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo('Cột mốc Vực Cảnh đã bị phong tỏa bởi [Hư Ảo] Thiết Mao Hắc Lang!');
    if (!String(e.name).includes('Thiết Mao Hắc Lang')) throw new Error('enemyInfo: fallback phong toa phai lay ten boss, thực tế: ' + JSON.stringify(e.name));
  }
  // 4. vanduFormatBuffSummary — đủ túi/tông/khắc/click.
  {
    const { bot } = unitBot();
    bot.vanduOwnedBuffs = { 'Thái Ất': 2, 'Kiếm X': 1 };
    bot.vanduSectCounts = { 'Thuật': 2, 'Kiếm': 1 };
    bot.vanduCounterPicks = 1;
    bot.vanduBuffClicks = 5;
    eq(bot.vanduFormatBuffSummary(), '2 thẻ (5 lần click) [Thuật:2, Kiếm:1 | Khắc chế: 1] -> Thái Ất (★2), Kiếm X', 'buff summary day du');
  }
  // 5. vanduFormatBuffSummary — chưa có buff nào.
  {
    const { bot } = unitBot();
    bot.vanduOwnedBuffs = {};
    bot.vanduSectCounts = {};
    bot.vanduCounterPicks = 0;
    bot.vanduBuffClicks = 0;
    eq(bot.vanduFormatBuffSummary(), 'chưa có buff nào', 'buff summary rong');
  }
  // 6. vanduIsDefeatScreen — bảng thua boss thật (walkthrough bước 22).
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(LOSS_BOARD_TEXT)), true, 'defeat: bang Roi Ve Chang la thua');
  }
  // 7. vanduIsDefeatScreen — bảng cuối hết Đạo Tâm.
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(FINAL_BOARD_TEXT)), true, 'defeat: bang Tu Tran Truoc la thua');
  }
  // 8. vanduIsDefeatScreen — bảng qua ải sau giải đố đúng: cùng nút
  // Tiếp Tục Tiến Sâu nhưng không phải thua -> false.
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(PASS_BOARD_TEXT)), false, 'defeat: bang qua ai khong phai thua');
  }
  // 9. vanduIsDefeatScreen — màn cửa thường -> false.
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(DOOR_25_TEXT)), false, 'defeat: man cua khong phai thua');
  }
  // 10. vanduIsDefeatScreen — màn battle -> false.
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(BATTLE_24_TEXT)), false, 'defeat: man battle khong phai thua');
  }
  // 11. vanduIsDefeatScreen — chữ "thất bại" trơ ở bảng bẫy Phá Phong
  // Ấn -> false (không khớp bare thất bại).
  {
    const { bot } = unitBot();
    eq(bot.vanduIsDefeatScreen(bot.vanduNormalize(TRAP_BOARD_TEXT)), false, 'defeat: bay Pha Phong An co chu that bai nhung khong phai thua tran');
  }
  // 12. Vòng battle — thua boss 24 (bảng Rơi Về Chặng): phải log 💀
  // THẤT BẠI kèm buff, KHÔNG được log 🏆 CHIẾN THẮNG.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b24', text: BATTLE_24_TEXT, buttons: BATTLE_24_BTNS },
      { msgId: 'loss', text: LOSS_BOARD_TEXT, buttons: LOSS_BOARD_BTNS },
    ]);
    await bot.vanduBattleLoop(1);
    has(logs, 'THẤT BẠI trước', 'battle loop: thua boss phai log THAT BAI');
    has(logs, 'Băng Tuyết Dạ Báo', 'battle loop: log thua phai ghi ten quai');
    has(logs, 'Danh sách buff:', 'battle loop: log thua phai kem danh sach buff');
    has(logs, 'Hiệp: 1', 'battle loop: log thua phai ghi so hiep da danh');
    lacks(logs, 'CHIẾN THẮNG', 'battle loop: thua boss KHONG duoc log CHIEN THANG');
  }
  // 13. Vòng battle — thắng boss 24 (sang màn cửa): log 🏆 kèm buff
  // (bộ buff thắng boss mới là dữ liệu quý nhất) + số hiệp.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b24', text: BATTLE_24_TEXT, buttons: BATTLE_24_BTNS },
      { msgId: 'door', text: DOOR_25_TEXT, buttons: DOOR_25_BTNS },
    ]);
    await bot.vanduBattleLoop(1);
    has(logs, 'CHIẾN THẮNG', 'battle loop: thang boss phai log CHIEN THANG');
    has(logs, 'Buff:', 'battle loop: log thang phai kem danh sach buff');
    has(logs, 'Hiệp: 1', 'battle loop: log thang phai ghi so hiep');
    lacks(logs, 'THẤT BẠI', 'battle loop: thang boss KHONG duoc log THAT BAI');
  }
  // 14. Vòng battle — log bắt đầu trận: BOSS, tên quái, HP 2 bên, đan,
  // buff hiện có (commit bbd3bcb) — kiểm tra trên màn boss 24.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b24', text: BATTLE_24_TEXT, buttons: BATTLE_24_BTNS },
      { msgId: 'door', text: DOOR_25_TEXT, buttons: DOOR_25_BTNS },
    ]);
    await bot.vanduBattleLoop(1);
    has(logs, '👑 BOSS', 'battle loop: tran Tiet 24 phai gan nhan BOSS');
    has(logs, 'Đối thủ: [Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo', 'battle loop: log dau tran phai ghi ten quai');
    has(logs, 'Máu Quái: 85%', 'battle loop: log dau tran phai ghi HP quai');
    has(logs, 'Máu Tôi: 51%', 'battle loop: log dau tran phai ghi HP minh');
    has(logs, 'đã click: 7 lần', 'battle loop: log dau tran phai ghi so buff da click');
  }
  // 15. Vòng battle — timeout: phải có dòng tổng kết ⏱️ kèm buff,
  // không chỉ dòng "trận quá lâu" rồi im.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b24', text: BATTLE_24_TEXT, buttons: BATTLE_24_BTNS },
    ]);
    bot.battleTimeoutMs = 0;
    await bot.vanduBattleLoop(1);
    has(logs, 'QUÁ LÂU', 'battle loop: timeout phai log tong ket QUA LAU');
    has(logs, 'Buff:', 'battle loop: log timeout phai kem danh sach buff');
  }

  console.log('vandu-battle-log: OK');
})().catch((e) => { console.error(e); process.exit(1); });
