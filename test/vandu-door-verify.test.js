// Vân Du v67 — kiểm tra màn sau mỗi cú bấm cửa.
// 2026-11-12, log 09:27:01: chuyến 3 Tiết 17, bot bấm Tử Môn (Thổ, mạch
// Sinh Hỏa->Thổ) 3 lần mà màn không đổi, guard dừng bot. Trước v67 bot
// tin cú bấm rồi tự tiến mạch ngay, chỉ guard mới phát hiện màn không
// đổi sau 3 lượt quét. V67: bấm xong quét lại sau 2s — màn đổi (msgId
// mới, hoặc mạch game tiến tới đúng hành vừa bấm, hoặc hết màn cửa) thì
// mới tin và tiến mạch; chưa đổi thì không tự tiến mạch, log cảnh báo
// 1 lần/màn, guard vẫn dừng sau 3 lần như cũ.
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

// Màn cửa Tiết 17/36 như log 09:26:57 — mạch Sinh 2/5 đang Hỏa, cần Thổ.
const doorText = `Ngã Rẽ Bát Quái — Hãy chọn 1 cửa để tiến sâu.
Khí Huyết 98%
Thẻ Buff 4 Thẻ Buff
Tiến Trình Tiết Điểm 17/36
Thiên Cơ 18 điểm
Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước)
T.18 Hưu Môn | Kinh Môn
T.19 Thương Môn | Đỗ Môn
Trận Đồ Ngũ Hành
THIÊN CƠ KHỚP HÀNH! (2/5)
Đạo hữu đã bước đúng huyền cơ mang hành Hỏa!
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]
(Tiến độ: 2/5)`;
const doorScreen = { msgId: 'door-17', text: doorText, buttons: ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'] };
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

function makeBot(scanFn) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  let current = null;
  bot.vanduScanLatest = async () => { current = scanFn(); return current; };
  const clicks = [];
  bot.exec = async (js) => {
    const s = String(js);
    const m = s.match(/const needle = "([^"]*)"/);
    const needle = m ? m[1] : '';
    if (needle) {
      const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
      if (!btn) return null;
      if (needle.includes('tu mon')) clicks.push('tu mon');
      if (needle.includes('tro ve giang ho')) clicks.push('tro ve giang ho');
      return btn;
    }
    return 'clicked';
  };
  bot.isRunning = true;
  bot.runId = 1;
  return { bot, logs, clicks };
}

(async () => {
  // Helper thuần: màn đổi thì true, màn y nguyên thì false.
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    eq(bot.vanduDoorClickLanded(doorScreen, { msgId: 'door-18', text: 'x', buttons: ['Phá Giáp'] }, { type: 'sinh', last: 'Hỏa' }, 'Thổ'), true, 'msgId moi la man doi');
    eq(bot.vanduDoorClickLanded(doorScreen, doorScreen, { type: 'sinh', last: 'Hỏa' }, 'Thổ'), false, 'cung msgId, cung mach la chua doi');
    const edited = { msgId: 'door-17', text: doorText.replace('[🔥 Hỏa] ✓ → [❓] ⌛', '[🔥 Hỏa] ✓ → [🪨 Thổ] ✓'), buttons: ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'] };
    eq(bot.vanduDoorClickLanded(doorScreen, edited, { type: 'sinh', last: 'Hỏa' }, 'Thổ'), true, 'cung msgId nhung mach game tien toi Tho la man doi');
  }

  // A (bug chính): bấm trả truthy nhưng màn không đổi — không được log
  // thành công giả, không tự tiến mạch; guard dừng sau 3 lần như cũ.
  {
    const { bot, logs, clicks } = makeBot(() => doorScreen);
    await bot.vanduLoop(1);
    eq(clicks.filter((c) => c === 'tu mon').length, 3, 'A: phai bam Tu Mon dung 3 lan roi dung');
    lacks(logs, 'mạch sinh tiến Hỏa -> Thổ', 'A: khong duoc log tien mach khi man chua doi');
    has(logs, 'màn không đổi', 'A: phai log canh bao bam khong vao game');
    has(logs, 'đã bấm 💀 Tử Môn 3 lần mà màn không đổi', 'A: guard van dung sau 3 lan');
    eq(bot.isRunning, false, 'A: guard dung thi stop bot');
  }

  // B (không phá đường thường): bấm xong màn đổi (msgId mới) — tiến
  // mạch và log thành công như cũ, chỉ bấm 1 lần.
  {
    let advanced = false;
    const { bot, logs, clicks } = makeBot(() => (advanced ? tripEndScreen : doorScreen));
    const origExec = bot.exec;
    bot.exec = async (js) => {
      const r = await origExec(js);
      if (String(js).includes('tu mon') && r) advanced = true;
      return r;
    };
    await bot.vanduLoop(1);
    eq(clicks.filter((c) => c === 'tu mon').length, 1, 'B: bam trung chi bam 1 lan');
    has(logs, 'mạch sinh tiến Hỏa -> Thổ', 'B: man doi thi van log tien mach');
    lacks(logs, 'màn không đổi', 'B: man doi thi khong log canh bao');
    eq(bot.isRunning, false, 'B: het chuyen thi dung sach');
  }

  console.log('vandu-door-verify: OK');
})().catch((e) => { console.error(e); process.exit(1); });
