// Vân Du v98 — log đọc sai HP người chơi và quái (log 2026-11-17, chạy v96).
// Mọi trận đều ghi "Máu Quái == Máu Tôi" (100/100, 76/76, 98/98, 63/63,
// 9/9, 33/33...) và tên quái luôn là "│ Thích Anh Hiệp v2". Nguyên nhân:
// vanduEnemyInfo lấy dòng "Tên: hiện tại/tối đa" ĐẦU TIÊN không nằm trong
// danh sách skip — mà trên màn này dòng Trạng Thái của NGƯỜI CHƠI không
// còn là "Hiệp cái:" nữa mà là dòng tên nhân vật ("Thích Anh Hiệp v2:
// ..."), nên bị lấy nhầm làm quái (tên + HP đều là của người chơi); dòng
// quái thật (thứ hai trong Trạng Thái) không bao giờ tới được vì `break`.
// (Chạy này dùng User ID ...2366 — tài khoản/nhân vật khác với màn
// 2026-11-13, nơi dòng người chơi là "Hiệp cái:".)
// v98 sửa: chỉ quét trong mục TRẠNG THÁI; dòng HP đầu tiên trong mục là
// của người chơi (dòng "Hiệp cái:" nếu có, không thì dòng đầu tiên), quái
// là dòng HP tiếp theo; chặn thêm bằng cặp (hiện tại, tối đa) của người
// chơi (vanduPlayerHpPair); tên quái bỏ tiền tố "│" (vanduCleanEnemyName).
// vanduPlayerHpPct vốn đã đúng (hồi máu ở HP 2%/34%/26% trong log là
// đúng lúc) nên không đổi.
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

// Màn battle format mới (tái dựng từ log 2026-11-17): dòng người chơi là
// tên nhân vật có tiền tố "│", quái là dòng thứ hai trong Trạng Thái.
const NEW_TEXT = `│  TRẠNG THÁI CHIẾN TRƯỜNG
│  Thích Anh Hiệp v2: 300.000.000/588.612.697 HP (51%)
│  [Hư Ảo] Băng Tuyết Dạ Báo: 700.000.000/824.057.635 HP (85%)
│  DIỄN BIẾN HIỆP ĐẤU
│  Hiệp cái: 300000000/588612697
│  Tiến Trình Tiết Điểm 9/36`;
const NEW_BTNS = ['Kiếm Cơ Bản', 'Kim Đan Phá Sát', 'Hư Không Đại Na Di', 'Lôi Đình Vạn Quân', 'Cửu Chuyển Hoàn Hồn'];

// Cùng format mới, đầu trận: cả hai đều 100% nhưng max khác nhau.
const NEW_START_TEXT = `│  TRẠNG THÁI CHIẾN TRƯỜNG
│  Thích Anh Hiệp v2: 588.612.697/588.612.697 HP (100%)
│  [Hư Ảo] Băng Tuyết Dạ Báo: 824.057.635/824.057.635 HP (100%)
│  DIỄN BIẾN HIỆP ĐẤU
│  Hiệp cái: 588612697/588612697
│  Tiến Trình Tiết Điểm 1/36`;

// Màn battle format cũ (số thật 2026-11-13): dòng người chơi "Hiệp cái:".
const OLD_TEXT = `TRẠNG THÁI CHIẾN TRƯỜNG
Hiệp cái: 161.131.770/588.612.697 HP (27%)
[Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo: 215.610.327/824.057.635 HP (26%)
DIỄN BIẾN HIỆP ĐẤU
Hiệp cái: 419018128/588612597
Tiến Trình Tiết Điểm 12/36`;

const DOOR_TEXT = `Tiến Trình Tiết Điểm 10/36
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]`;
const DOOR_BTNS = ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'];

function battleBot(screens) {
  const { bot, logs } = unitBot();
  bot.isRunning = true;
  bot.runId = 1;
  bot.vanduSkillOrder = ['Kim Đan Phá Sát', 'Hư Không Đại Na Di'];
  bot.skillClickDelayMs = 1000;
  bot.vanduNode = 9;
  bot.vanduBuffClicks = 2;
  bot.vanduOwnedBuffs = { 'Thái Ất': 1 };
  bot.vanduSectCounts = { 'Thuật': 1 };
  bot.vanduCounterPicks = 0;
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
  // 1. Format mới: quái là dòng thứ hai trong Trạng Thái — tên quái thật,
  // HP quái 85%, HP mình 51% (khác nhau). Đây là case log 2026-11-17.
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo(NEW_TEXT);
    eq(e.name, '[Hư Ảo] Băng Tuyết Dạ Báo', 'enemyInfo moi: ten quai phai la quai that, khong phai ten nhan vat');
    eq(e.hpPct, 85, 'enemyInfo moi: HP quai 85%');
    eq(e.hpCur, '700.000.000', 'enemyInfo moi: cur quai phai la so cua quai');
    eq(e.hpMax, '824.057.635', 'enemyInfo moi: max quai phai la so cua quai');
    eq(bot.vanduPlayerHpPct(NEW_TEXT), 51, 'playerHp moi: HP minh 51%');
    if (e.hpPct === bot.vanduPlayerHpPct(NEW_TEXT)) throw new Error('enemyInfo moi: HP quai va HP minh khong duoc bang nhau o day');
  }
  // 2. Format mới, đầu trận cả hai 100%: vẫn phải tách đúng nhờ max khác
  // nhau (guard (cur, max) không được nuốt dòng quái).
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo(NEW_START_TEXT);
    eq(e.name, '[Hư Ảo] Băng Tuyết Dạ Báo', 'enemyInfo dau tran: ten quai');
    eq(e.hpPct, 100, 'enemyInfo dau tran: HP quai 100%');
    eq(e.hpMax, '824.057.635', 'enemyInfo dau tran: max quai');
    eq(bot.vanduPlayerHpPct(NEW_START_TEXT), 100, 'playerHp dau tran: HP minh 100%');
  }
  // 3. Format cũ (2026-11-13): không hồi quy — quái 26%, mình 27%.
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo(OLD_TEXT);
    eq(e.name, '[Tiên Tiểu Hư Ảo] Băng Tuyết Dạ Báo', 'enemyInfo cu: ten quai that 2026-11-13');
    eq(e.hpPct, 26, 'enemyInfo cu: HP quai 26%');
    eq(bot.vanduPlayerHpPct(OLD_TEXT), 27, 'playerHp cu: HP minh 27%');
  }
  // 4. Chỉ có máu mình, không có dòng quái -> 'Quái', hpPct null.
  {
    const { bot } = unitBot();
    const e = bot.vanduEnemyInfo('Hiệp cái: 100/200 HP (50%)\nTiến Trình Tiết Điểm 5/36');
    eq(e.name, 'Quái', 'enemyInfo: khong co dong quai -> Quai');
    eq(e.hpPct, null, 'enemyInfo: khong co HP quai -> null');
  }
  // 5. Tên quái có tiền tố "│" -> bỏ cho sạch log (không ảnh hưởng tên
  // bắt đầu bằng "[" ).
  {
    const { bot } = unitBot();
    eq(bot.vanduCleanEnemyName('│  Thích Anh Hiệp v2'), 'Thích Anh Hiệp v2', 'cleanName: bo tien to vien embed');
    eq(bot.vanduCleanEnemyName('[Hư Ảo] Băng Tuyết Dạ Báo'), '[Hư Ảo] Băng Tuyết Dạ Báo', 'cleanName: ten [..] giu nguyen');
    eq(bot.vanduCleanEnemyName(''), '', 'cleanName: chuoi rong');
  }
  // 6. Guard (cur, max): dòng người chơi (tên nhân vật) có cặp số trùng
  // với cặp cuối trong Diễn Biến thì bị loại, dù nó là dòng HP đầu tiên.
  // Tái dựng đúng tình huống Tiết 9 sau khi hồi đan: mình 52%, quái 30%.
  {
    const { bot } = unitBot();
    const text = `│  TRẠNG THÁI CHIẾN TRƯỜNG
│  Thích Anh Hiệp v2: 306.000.000/588.612.697 HP (52%)
│  [Hư Ảo] Băng Tuyết Dạ Báo: 247.000.000/824.057.635 HP (30%)
│  DIỄN BIẾN HIỆP ĐẤU
│  Hiệp cái: 306000000/588612697
│  Tiến Trình Tiết Điểm 9/36`;
    const e = bot.vanduEnemyInfo(text);
    eq(e.name, '[Hư Ảo] Băng Tuyết Dạ Báo', 'enemyInfo guard: quai sau khi hoi dan');
    eq(e.hpPct, 30, 'enemyInfo guard: HP quai 30%, khong phai 52% cua minh');
    eq(bot.vanduPlayerHpPct(text), 52, 'playerHp guard: HP minh 52% sau hoi dan');
    const pair = bot.vanduPlayerHpPair(text);
    eq(pair, { cur: 306000000, max: 588612697 }, 'playerHpPair: cap (cur, max) cua minh');
  }
  // 7. Vòng battle trên màn format mới: log bắt đầu trận và log từng hiệp
  // phải ghi Máu Quái 85% | Máu Tôi 51% (khác nhau), tên quái thật.
  {
    const { bot, logs } = battleBot([
      { msgId: 'b9', text: NEW_TEXT, buttons: NEW_BTNS },
      { msgId: 'door', text: DOOR_TEXT, buttons: DOOR_BTNS },
    ]);
    await bot.vanduBattleLoop(1);
    has(logs, 'Đối thủ: [Hư Ảo] Băng Tuyết Dạ Báo', 'battle loop moi: log dau tran phai ghi ten quai that');
    has(logs, 'Máu Quái: 85%', 'battle loop moi: log dau tran phai ghi HP quai 85%');
    has(logs, 'Máu Tôi: 51%', 'battle loop moi: log dau tran phai ghi HP minh 51%');
    has(logs, 'Tôi: 51% | Quái: 85%', 'battle loop moi: log hiep phai ghi HP 2 ben khac nhau');
    lacks(logs, 'Thích Anh Hiệp v2', 'battle loop moi: khong duoc ghi ten nhan vat lam quai');
  }

  console.log('vandu-hp-read: OK');
})().catch((e) => { console.error(e); process.exit(1); });
