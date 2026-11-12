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

(async () => {
  // Ngưỡng: boss 12/24/36 là 50, còn lại (kể cả không đọc được Tiết) là 20.
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    eq(bot.vanduHealThreshold(12), 50, 'boss Tiet 12 nguong 50');
    eq(bot.vanduHealThreshold(24), 50, 'boss Tiet 24 nguong 50');
    eq(bot.vanduHealThreshold(36), 50, 'boss Tiet 36 nguong 50');
    eq(bot.vanduHealThreshold(1), 20, 'Tiet 1 nguong 20');
    eq(bot.vanduHealThreshold(11), 20, 'Tiet 11 nguong 20');
    eq(bot.vanduHealThreshold(13), 20, 'Tiet 13 nguong 20');
    eq(bot.vanduHealThreshold(23), 20, 'Tiet 23 nguong 20');
    eq(bot.vanduHealThreshold(35), 20, 'Tiet 35 nguong 20');
    eq(bot.vanduHealThreshold(0), 20, 'khong doc duoc Tiet tinh nhu thuong (20)');
  }

  // A: Tiết thường 23, HP 45% — KHÔNG xài đan, đánh skill tiếp.
  {
    const { logs, clicks } = await runBattle(23, 45);
    eq(clicks.includes('dan'), false, 'A: Tiet thuong HP 45% khong duoc xai dan');
    eq(clicks.includes('pha giap'), true, 'A: khong xai dan thi phai danh skill');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'A: khong duoc log hoi mau');
    has(logs, 'Vân Du [Tiết 23]: vào trận', 'A: log vao tran van ghi Tiet (v63)');
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

  // E: Tiết thường 23, HP đúng 20% — KHÔNG xài (luật là < 20%).
  {
    const { logs, clicks } = await runBattle(23, 20);
    eq(clicks.includes('dan'), false, 'E: Tiet thuong HP dung 20% khong xai (can < 20%)');
    lacks(logs, 'hồi máu bằng Cửu Chuyển', 'E: khong duoc log hoi mau');
  }

  console.log('vandu-heal-threshold: OK');
})().catch((e) => { console.error(e); process.exit(1); });
