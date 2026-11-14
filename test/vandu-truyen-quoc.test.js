// V81: bảng Trận Đồ Ngũ Hành kèm "Nhận Truyền Quốc Tối Cao" (ảnh anh gửi
// 2026-11-14, Tiết 23/36, mạch Sinh 4/5, Dị Biến Thiên Đạo Phục Hưng) —
// bot phải bấm "Nhận Truyền Quốc Tối Cao" thay vì đốt giấy tiền, phớt lờ
// hay chờ màn mới. Màn này không phải Kỳ Ngộ nên luật xanh lá chung (v19)
// không chạy.
const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function has(logs, needle, msg) { if (!logs.some((l) => l.includes(needle))) throw new Error(msg + ' (thieu log: ' + needle + ')'); }
function lacks(logs, needle, msg) { if (logs.some((l) => l.includes(needle))) throw new Error(msg + ' (co log khong mong muon: ' + needle + ')'); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg + ' (got ' + a + ', want ' + b + ')'); }

// Màn trong ảnh anh gửi: Bản Đồ Thiên Cơ (Tiết 23/36, Boss 24 phía
// trước), Trận Đồ Ngũ Hành THIÊN CƠ KHỚP HÀNH! (4/5), mạch Sinh
// Thổ → Kim → Thủy → Mộc (4/5), Dị Biến Thiên Đạo Phục Hưng, 3 nút
// Nhận Truyền Quốc Tối Cao / Đốt giấy tiền cúng bái / Phớt lờ.
const truyenQuocScreen = {
  msgId: 'truyen-quoc-1',
  text: 'Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước) [Vị Trí Hiện Tại: Tiết Điểm 23/36] T.24: Trấn Vực Thủ Hộ II (Boss 24) T.25: Cảnh Môn | Hưu Môn T.26: Đỗ Môn | Kinh Môn Trận Đồ Ngũ Hành THIÊN CƠ KHỚP HÀNH! (4/5) Đạo hữu đã bước đúng huyền cơ mang hành Mộc! Trận pháp tiếp tục luân chuyển, đạo hữu hãy suy ngẫm bước đi kế tiếp theo mạch tương sinh. Mạch Tương Sinh: [Thổ] ✓ → [Kim] ✓ → [Thủy] ✓ → [Mộc] ✓ → [?] (Tiến độ: 4/5) Dị Biến: Thiên Đạo Phục Hưng • Cân nhắc kỹ trước mỗi quyết định!',
  buttons: ['📜 Nhận Truyền Quốc Tối Cao', '🔥 Đốt giấy tiền cúng bái', 'Phớt lờ'],
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
  const queue = [truyenQuocScreen, tripEndScreen];
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    return queue.shift();
  };
  const clicked = [];
  bot.exec = async (js) => {
    const s = String(js);
    if (s.includes('nhan truyen quoc toi cao')) { clicked.push('truyen-quoc'); return 'Nhận Truyền Quốc Tối Cao'; }
    if (s.includes('dot giay tien')) { clicked.push('dot-giay'); return ''; }
    if (s.includes('phot lo')) { clicked.push('phot-lo'); return ''; }
    if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
    return '';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);

  has(logs, 'Nhận Truyền Quốc Tối Cao', 'phai bam Nhan Truyen Quoc Toi Cao');
  eq(clicked.includes('truyen-quoc'), true, 'phai thuc hien cum bam Nhan Truyen Quoc Toi Cao');
  eq(clicked.includes('dot-giay'), false, 'khong duoc bam Dot giay tien');
  eq(clicked.includes('phot-lo'), false, 'khong duoc bam Phot lo');
  lacks(logs, 'chờ màn mới', 'khong duoc ket cho man moi');
  lacks(logs, 'màn hình chưa nhận diện', 'man trung phai duoc nhan dien');
  eq(bot.isRunning, false, 'sau man ket thuc thi dung');
  console.log('Vân Du truyen-quoc checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
