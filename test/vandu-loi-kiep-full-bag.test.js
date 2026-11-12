// Vân Du v65 — vào Kinh Môn (Lôi Kiếp) khi túi Buff đã đủ 12 thì bấm
// "Khắc Khổ Phòng Ngự" thay vì đánh cược Lôi Kiếp Tôi Thể.
// 2026-11-12, anh chốt + 2 ảnh: ảnh 1 là bảng Lôi Kiếp ở Tiết 13/36
// (3 nút: Lôi Kiếp Tôi Thể / Khắc Khổ Phòng Ngự +10% Giảm Dame vĩnh
// viễn / Cẩn trọng vượt qua), ảnh 2 là bảng cộng hưởng ghi "Túi tối đa
// 12 Buff" và "Lv1 đào thải khi đầy" — túi đầy mà cược lấy buff mới thì
// buff mới sẽ đào thải buff cũ, nên lấy giảm dame vĩnh viễn cho chắc.
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

// Màn Lôi Kiếp đúng như ảnh anh gửi (Tiết 13/36, Kinh Môn).
function loiKiepScreen(bagText, buttons) {
  return {
    msgId: 'loi-kiep-13',
    text: `Kinh Môn tràn ngập những đạo tử lôi xé toạc hư không, sát phạt cuồng bạo!
Nơi đây ẩn chứa cơ duyên lôi kiếp tôi thể tốt cùng nguy hiểm nhưng cũng mang lại sức mạnh thần thánh.
Đạo hữu có dám liều mạng thử thách?
Diễn Biến Vừa Qua
Đạo hữu bước vào ⚡ Kinh Môn — Vùng đất sấm sét cuồng loạn!
Khí Huyết
100%
${bagText}
Tiến Trình
Tiết Điểm 13/36
Thiên Cơ
28 điểm
Ngân Lượng
+787,500
Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước)
[Vị Trí Hiện Tại: Tiết Điểm 13/36]
T.14: Hưu Môn | Tử Môn
T.15: Kinh Môn | Thương Môn
T.16: Khai Môn | Sinh Môn
Dị Biến: Vận Mệnh Nghịch Chuyển • Cẩn nhắc kỹ trước mỗi quyết định!`,
    buttons: buttons || ['Lôi Kiếp Tôi Thể', 'Khắc Khổ Phòng Ngự (+10% Giảm Dame vĩnh viễn)', 'Cẩn trọng vượt qua'],
  };
}
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

async function runBot(screens, setup) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [...screens];
  let current = null;
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    current = queue.shift();
    return current;
  };
  // setup chạy ở lần quét ĐẦU TIÊN, sau khi vanduLoop đã reset trạng
  // thái đầu chuyến (vanduOwnedBuffs = {}) — preset trước loop sẽ bị
  // reset xóa mất, nên case D/E phải gài sau reset mới giống thật (bot
  // đã pick đủ buff trong chuyến rồi mới gặp Lôi Kiếp).
  if (setup) {
    const origScan = bot.vanduScanLatest;
    let done = false;
    bot.vanduScanLatest = async () => {
      const s = await origScan();
      if (!done) { done = true; setup(bot); }
      return s;
    };
  }
  const clicks = [];
  bot.exec = async (js) => {
    const s = String(js);
    const m = s.match(/const needle = "([^"]*)"/);
    const needle = m ? m[1] : '';
    if (needle) {
      const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
      if (!btn) return null;
      if (needle.includes('loi kiep toi the')) clicks.push('loi kiep');
      if (needle.includes('khac kho phong ngu')) clicks.push('khac kho');
      if (needle.includes('tro ve giang ho')) clicks.push('tro ve giang ho');
      return btn;
    }
    return 'clicked';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);
  return { bot, logs, clicks };
}

(async () => {
  // Đếm túi từ màn: "X Thẻ Buff" hoặc "Túi Buff X/12".
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    eq(bot.vanduBuffBagCount('Khí Huyết 100%\n8 Thẻ Buff\nTiết Điểm 13/36'), 8, 'man Loi Kiep ghi 8 The Buff thi dem 8');
    eq(bot.vanduBuffBagCount('12 Thẻ Buff'), 12, '12 The Buff thi dem 12');
    eq(bot.vanduBuffBagCount('Túi Buff 4/12 (Lv1 đào thải khi đầy)'), 4, 'bang cong huong Tui Buff 4/12 thi dem 4');
    eq(bot.vanduBuffBagCount('Túi Buff 12/12'), 12, 'Tui Buff 12/12 thi dem 12');
    eq(bot.vanduBuffBagCount('không có số buff'), null, 'man khong ghi so thi null');
  }

  // A (luật mới): túi đủ 12 -> bấm Khắc Khổ Phòng Ngự, không đánh cược.
  {
    const { logs, clicks } = await runBot([loiKiepScreen('12 Thẻ Buff'), tripEndScreen]);
    eq(clicks.includes('khac kho'), true, 'A: tui du 12 phai bam Khac Kho Phong Ngu');
    eq(clicks.includes('loi kiep'), false, 'A: tui du 12 khong duoc danh cuoc Loi Kiep');
    has(logs, 'túi Buff đã đủ 12, bấm Khắc Khổ Phòng Ngự', 'A: phai log ly do Khac Kho');
    has(logs, 'Vân Du [Tiết 13]:', 'A: log van ghi Tiet 13 (v63)');
    eq(clicks.includes('tro ve giang ho'), true, 'A: xong thi ve Giang Ho, het chuyen thi dung');
  }

  // B (không phá luật cũ): túi 8 -> vẫn đánh cược Lôi Kiếp như trước.
  {
    const { logs, clicks } = await runBot([loiKiepScreen('8 Thẻ Buff'), tripEndScreen]);
    eq(clicks.includes('loi kiep'), true, 'B: tui 8 phai danh cuoc Loi Kiep nhu cu');
    eq(clicks.includes('khac kho'), false, 'B: tui 8 khong duoc bam Khac Kho');
    has(logs, 'Lôi Kiếp Tôi Thể (đánh cược lấy buff)', 'B: phai log danh cuoc nhu cu');
  }

  // C: túi đủ 12 nhưng màn không có nút Khắc Khổ -> đánh cược như cũ.
  {
    const { logs, clicks } = await runBot([loiKiepScreen('12 Thẻ Buff', ['Lôi Kiếp Tôi Thể', 'Cẩn trọng vượt qua']), tripEndScreen]);
    eq(clicks.includes('loi kiep'), true, 'C: khong co nut Khac Kho thi danh cuoc nhu cu');
    eq(clicks.includes('khac kho'), false, 'C: khong co nut thi khong duoc bam Khac Kho');
    has(logs, 'Lôi Kiếp Tôi Thể (đánh cược lấy buff)', 'C: phai log danh cuoc');
  }

  // D: màn không ghi số túi nhưng bot đã đếm được đủ 12 buff (tự pick
  // trước đó) -> vẫn bấm Khắc Khổ.
  {
    const owned = {};
    for (let i = 0; i < 12; i++) owned['buff-' + i] = 1;
    const { logs, clicks } = await runBot(
      [loiKiepScreen('Khí Huyết 100%', ['Lôi Kiếp Tôi Thể', 'Khắc Khổ Phòng Ngự (+10% Giảm Dame vĩnh viễn)', 'Cẩn trọng vượt qua']), tripEndScreen],
      (bot) => { bot.vanduOwnedBuffs = owned; },
    );
    eq(clicks.includes('khac kho'), true, 'D: man khong ghi so nhung bot dem du 12 thi bam Khac Kho');
    eq(clicks.includes('loi kiep'), false, 'D: khong duoc danh cuoc');
    has(logs, 'túi Buff đã đủ 12, bấm Khắc Khổ Phòng Ngự', 'D: phai log ly do Khac Kho');
  }

  // E: màn không ghi số, bot mới đếm được 4 -> đánh cược như cũ.
  {
    const { logs, clicks } = await runBot(
      [loiKiepScreen('Khí Huyết 100%'), tripEndScreen],
      (bot) => { bot.vanduOwnedBuffs = { a: 1, b: 1, c: 1, d: 1 }; },
    );
    eq(clicks.includes('loi kiep'), true, 'E: khong biet tui day thi danh cuoc nhu cu');
    eq(clicks.includes('khac kho'), false, 'E: khong duoc bam Khac Kho');
  }

  console.log('vandu-loi-kiep-full-bag: OK');
})().catch((e) => { console.error(e); process.exit(1); });
