// V58: màn Trận Đồ Ngũ Hành sau khi mạch Sinh hoàn thành (THIÊN CƠ HOÀN
// MỸ 5/5) kèm Dị Biến Cô Ma Loạn Vũ — bot phải bấm "Tụng siêu độ vong hồn"
// thay vì chờ màn mới (log 2026-11-11 08:59:42: Kỳ Ngộ chờ màn mới vì không
// thấy nút xanh/Dâng hương; ảnh anh gửi Tiết 32/36).
const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function has(logs, needle, msg) { if (!logs.some((l) => l.includes(needle))) throw new Error(msg + ' (thieu log: ' + needle + ')'); }
function lacks(logs, needle, msg) { if (logs.some((l) => l.includes(needle))) throw new Error(msg + ' (co log khong mong muon: ' + needle + ')'); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg + ' (got ' + a + ', want ' + b + ')'); }

// Màn Trận Đồ Ngũ Hành trong ảnh anh gửi: Sinh hoàn thành 5/5, Khắc chưa
// khai mở, Dị Biến Cô Ma Loạn Vũ, 2 nút Tụng siêu độ vong hồn / Đi tiếp.
const tungScreen = {
  msgId: 'tung-1',
  text: 'Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước) [Vị Trí Hiện Tại: Tiết Điểm 32/36] Trận Đồ Ngũ Hành THIÊN CƠ HOÀN MỸ! (5/5) Đạo hữu đã thông trọn vẹn mạch TƯƠNG SINH (Mộc → Hỏa → Thổ → Kim → Thủy)! Thần Mạch Ban Phúc: Boss Vực Cảnh suy yếu: -15% HP tối đa, +5 điểm Thiên Cơ, +10 Vận Khí Mạch Tương Khắc: Chưa khai mở — Hãy chọn một Môn Hộ để định vị Thiên Cơ! Dị Biến: Cô Ma Loạn Vũ • Cẩn nhắc kỹ trước mỗi quyết định!',
  buttons: ['🕯️ Tụng siêu độ vong hồn', '🚪 Đi tiếp'],
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
  const queue = [tungScreen, tripEndScreen];
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    return queue.shift();
  };
  const clicked = [];
  bot.exec = async (js) => {
    const s = String(js);
    if (s.includes('tung sieu do vong hon')) { clicked.push('tung'); return 'Tụng siêu độ vong hồn'; }
    if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
    return '';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);

  has(logs, 'Tụng siêu độ vong hồn', 'phai bam Tung sieu do vong hon');
  eq(clicked.length >= 1, true, 'phai thuc hien cum bam Tung sieu do vong hon');
  lacks(logs, 'chờ màn mới', 'khong duoc ket cho man moi nhu log 08:59:42');
  lacks(logs, 'màn hình chưa nhận diện', 'man Tran Do Ngu Hanh phai duoc nhan dien');
  eq(bot.isRunning, false, 'sau man ket thuc thi dung');
  console.log('Vân Du tung-sieu checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
