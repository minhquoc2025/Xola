// V79: bảng Trận Đồ Ngũ Hành kèm quả trứng (ảnh anh gửi 2026-11-13,
// Tiết 21/36, trước Boss 24) — bot phải bấm "Sưởi ấm quả trứng"
// thay vì bỏ mặc hay chờ màn mới. Màn này không phải Kỳ Ngộ nên
// luật xanh lá chung (v19) không chạy.
const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function has(logs, needle, msg) { if (!logs.some((l) => l.includes(needle))) throw new Error(msg + ' (thieu log: ' + needle + ')'); }
function lacks(logs, needle, msg) { if (logs.some((l) => l.includes(needle))) throw new Error(msg + ' (co log khong mong muon: ' + needle + ')'); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg + ' (got ' + a + ', want ' + b + ')'); }

// Màn trong ảnh anh gửi: Bản Đồ Thiên Cơ (Tiết 21/36, Boss 24 phía
// trước), Trận Đồ Ngũ Hành neo mạch Sinh tại Kim (1/5), Dị Biến Huyết
// Nguyệt Chi Dạ, 2 nút Sưởi ấm quả trứng / Bỏ mặc.
const eggScreen = {
  msgId: 'egg-1',
  text: 'Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước) [Vị Trí Hiện Tại: Tiết Điểm 21/36] T.22: Hưu Môn T.23: Kinh Môn | Thương Môn T.24: Trấn Vực Thủ Hộ II (Boss 24) Trận Đồ Ngũ Hành THIÊN CƠ HIỆN LINH! Mạch này là TƯƠNG SINH, định vị khởi đầu tại hành KIM. Đạo hữu hãy vận dụng quy luật ngũ hành tương sinh để khai thông 4 tiết điểm kế tiếp! Mạch Tương Sinh: [Kim] ✓ → [?] → [?] → [?] → [?] (Tiến độ: 1/5) Dị Biến: Huyết Nguyệt Chi Dạ • Cân nhắc kỹ trước mỗi quyết định!',
  buttons: ['🥚 Sưởi ấm quả trứng', '🚪 Bỏ mặc'],
};
const tripEndScreen = {
  msgId: 'end-1',
  text: 'PHÁN XÉT THIÊN CƠ Trở Về Giang Hồ',
  buttons: ['Trở Về Giang Hồ'],
};

(async () => {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '', vanduRealm: 'Hóa Thần', vanduMap: 'Thiên Sơn Tuyết Lãnh' });
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [eggScreen, tripEndScreen];
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    return queue.shift();
  };
  const clicked = [];
  bot.exec = async (js) => {
    const s = String(js);
    if (s.includes('suoi am qua trung')) { clicked.push('egg'); return 'Sưởi ấm quả trứng'; }
    if (s.includes('bo mac')) { clicked.push('bo-mac'); return ''; }
    if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
    return '';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);

  has(logs, 'Sưởi ấm quả trứng', 'phai bam Suoi am qua trung');
  eq(clicked.includes('egg'), true, 'phai thuc hien cum bam Suoi am qua trung');
  eq(clicked.includes('bo-mac'), false, 'khong duoc bam Bo mac');
  lacks(logs, 'chờ màn mới', 'khong duoc ket cho man moi');
  lacks(logs, 'màn hình chưa nhận diện', 'man trung phai duoc nhan dien');
  eq(bot.isRunning, false, 'sau man ket thuc thi dung');
  console.log('Vân Du egg checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
