// Vân Du v63 — log Vân Du kèm số Tiết hiện tại.
// 2026-11-12, anh: "thêm hiển thị số tiết điểm vô log". Trước đây chỉ
// log hồi máu ghi Tiết ("HP 21%, Tiết 4"), còn lại (chọn cửa, vào trận,
// chọn buff, shop, đố, Kỳ Ngộ...) không ghi — đọc log không biết đang
// ở Tiết mấy, vd vụ dừng ở Hưu Môn 15:02:48 phải đối chiếu tay mới biết
// là Tiết 21. V63: helper vanduLog chèn "[Tiết N]" ngay sau "Vân Du:"
// khi đã biết Tiết từ màn quét gần nhất; không chèn khi chưa biết Tiết
// (vanduNode = 0, vd lúc chọn map đầu chuyến) hoặc khi câu log đã có
// "Tiết" (log hồi máu giữ nguyên, không ghi đôi).
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

function unitBot(node) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.vanduNode = node;
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  return { bot, logs };
}

// Màn cửa Tiết 10/36 (lấy từ test v62): mạch Sinh 2/5 cần Thổ (Tử Môn).
const door10Text = `Đạo hữu rời khỏi lều buôn Tiên Thương an toàn, tiếp tục dấn bước vào sâu mê trận.
Khí Huyết 98%
Tiến Trình Tiết Điểm 10/36
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]
(Tiến độ: 2/5)`;
const door10 = { msgId: 'door-10', text: door10Text, buttons: ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'] };
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

(async () => {
  // Luật helper: biết Tiết thì chèn, chưa biết thì thôi, đã có "Tiết"
  // thì không chèn đôi, câu không phải Vân Du thì để nguyên.
  {
    const { bot, logs } = unitBot(21);
    bot.vanduLog('🚪 Vân Du: chọn cửa "🍵 Hưu Môn"');
    eq(logs[0], '🚪 Vân Du [Tiết 21]: chọn cửa "🍵 Hưu Môn"', 'biet Tiet 21 thi chen [Tiet 21] sau "Van Du:"');
  }
  {
    const { bot, logs } = unitBot(0);
    bot.vanduLog('🗺️ Vân Du: mở danh sách map (đang chọn Thanh Vân Trấn, cần Thiên Sơn Tuyết Lãnh)');
    eq(logs[0], '🗺️ Vân Du: mở danh sách map (đang chọn Thanh Vân Trấn, cần Thiên Sơn Tuyết Lãnh)', 'chua biet Tiet (dau chuyen, dang chon map) thi khong chen');
  }
  {
    const { bot, logs } = unitBot(4);
    bot.vanduLog('💊 Vân Du: hồi máu bằng Cửu Chuyển (HP 21%, Tiết 4)');
    eq(logs[0], '💊 Vân Du: hồi máu bằng Cửu Chuyển (HP 21%, Tiết 4)', 'log hoi mau da co "Tiet 4" thi giu nguyen, khong chen doi');
  }
  {
    const { bot, logs } = unitBot(10);
    bot.vanduLog('Bot started');
    eq(logs[0], 'Bot started', 'cau khong phai Van Du thi de nguyen');
  }

  // Lái vanduLoop thật: màn cửa Tiết 10 -> log chọn cửa phải ghi [Tiết 10].
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });
    const logs = [];
    bot.log = (m) => logs.push(String(m));
    bot.delay = async () => {};
    bot.sendChat = async () => {};
    bot.dismissEphemeralMessages = async () => {};
    const queue = [door10, tripEndScreen];
    let current = null;
    bot.vanduScanLatest = async () => {
      if (queue.length === 0) throw new Error('scan script exhausted');
      current = queue.shift();
      return current;
    };
    bot.exec = async (js) => {
      const s = String(js);
      const m = s.match(/const needle = "([^"]*)"/);
      const needle = m ? m[1] : '';
      if (needle) {
        const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
        return btn || null;
      }
      return 'clicked';
    };
    bot.isRunning = true;
    bot.runId = 1;
    await bot.vanduLoop(1);
    has(logs, 'Vân Du [Tiết 10]: chọn cửa "💀 Tử Môn"', 'loop: man cua Tiet 10 phai log [Tiet 10] khi chon cua');
    has(logs, 'mạch sinh tiến Hỏa -> Thổ', 'loop: van log tien mach nhu cu');
    lacks(logs, '[Tiết 10] [Tiết 10]', 'loop: khong chen Tiet 2 lan tren 1 dong');
    eq(bot.isRunning, false, 'loop: het chuyen thi dung');
  }

  console.log('vandu-tiet-log: OK');
})().catch((e) => { console.error(e); process.exit(1); });
