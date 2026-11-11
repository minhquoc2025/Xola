// Vân Du v56 — verify-after-pick: bot chỉ bấm Bắt Đầu khi game hiện đúng map đích.
// 2026-11-11, log anh gửi: 3 chuyến 07:33/07:39/07:46 đều log "đã chọn map
// Thiên Sơn Tuyết Lãnh" nhưng nhật ký game toàn Thanh Vân Trấn — cú bấm trả
// về tên nút (truthy) không có nghĩa là game đã đổi map. Test này lái
// vanduLoop bằng màn hình giả: exec luôn trả truthy khi bấm (giống click
// DOM thật), còn "sự thật của game" nằm ở màn scan trả về.
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

function startScreen(currentMap) {
  return {
    msgId: 'm-' + Math.random(),
    text: `Đại Vùng Đang Chọn: ${currentMap}\nBắt Đầu Xuất Phát`,
    buttons: ['Bắt Đầu Xuất Phát'],
  };
}
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

async function runBot(screens, countResult) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '', vanduRealm: 'Hóa Thần', vanduMap: 'Thiên Sơn Tuyết Lãnh' });
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [...screens];
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    return queue.shift();
  };
  // exec stub: mọi cú bấm đều trả về tên nút (truthy), y như click DOM thật —
  // bot không được tin vào đó, chỉ tin màn scan trả về. Đồng thời ghi lại
  // hàm nào được gọi trước (V57: ExactText phải đi trước ClickButton).
  const calls = [];
  bot.exec = async (js) => {
    const s = String(js);
    if (s.includes('vanduCountMapOptions')) { calls.push({ fn: 'count', needle: 'thien son tuyet lanh' }); return countResult || '1/2'; }
    const needle = s.includes('thien son tuyet lanh') ? 'thien son tuyet lanh' : s.includes('thanh van tran') ? 'thanh van tran' : s.includes('bat dau xuat phat') ? 'bat dau xuat phat' : s.includes('tro ve giang ho') ? 'tro ve giang ho' : '';
    if (s.includes("querySelectorAll('*')")) calls.push({ fn: 'exact', needle });
    else if (s.includes('[role="article"]')) calls.push({ fn: 'button', needle });
    else if (s.includes('[role="option"]')) calls.push({ fn: 'anywhere', needle });
    if (s.includes('thien son tuyet lanh')) return 'Thiên Sơn Tuyết Lãnh';
    if (s.includes('thanh van tran')) return 'Thanh Vân Trấn';
    if (s.includes('bat dau xuat phat')) return 'Bắt Đầu Xuất Phát';
    if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
    return '';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);
  return { bot, logs, calls };
}

(async () => {
  // A: bấm lần 1 không ăn (game vẫn Thanh Vân), bấm lần 2 ăn (game hiện
  // Thiên Sơn) -> chỉ bấm Bắt Đầu SAU khi quét thấy Thiên Sơn.
  {
    const { bot, logs, calls } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thiên Sơn Tuyết Lãnh'),
      tripEndScreen,
    ]);
    has(logs, 'chờ game xác nhận', 'A: phai log cho xac nhan sau cum bam');
    has(logs, 'map đang chọn đã là Thiên Sơn Tuyết Lãnh', 'A: phai xac nhan map truoc khi xuat phat');
    has(logs, 'Bắt Đầu Xuất Phát', 'A: phai bam Bat Dau sau khi xac nhan');
    const iVerified = logs.findIndex((l) => l.includes('map đang chọn đã là'));
    const iDepart = logs.findIndex((l) => l.includes('🚀 Vân Du: Bắt Đầu Xuất Phát'));
    eq(iVerified >= 0 && iDepart > iVerified, true, 'A: Bat Dau phai sau dong xac nhan map');
    eq(bot.vanduMapPickTries, 2, 'A: 2 lan bam thi map moi an');
    lacks(logs, 'đã chọn map Thiên Sơn Tuyết Lãnh theo cảnh giới', 'A: khong duoc log kieu cu (tin cum bam)');
    eq(bot.isRunning, false, 'A: het chuyen thi dung');
    // V57: bấm map thử ExactText trước, và log chẩn đoán số option sau khi mở.
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 1 chỗ, chứa tên 2 chỗ', 'A: phai log dem option');
    const firstTargetPick = calls.find((c) => c.needle === 'thien son tuyet lanh' && c.fn !== 'count');
    eq(firstTargetPick && firstTargetPick.fn, 'exact', 'A: bam map dich thu ExactText truoc');
    const firstOpen = calls.find((c) => c.needle === 'thanh van tran');
    eq(firstOpen && firstOpen.fn, 'exact', 'A: mo list thu ExactText truoc');
  }

  // B: bấm 3 lần mà game vẫn Thanh Vân -> dừng, KHÔNG bấm Bắt Đầu.
  // Đây đúng là 3 chuyến 07:33/07:39/07:46 trong log anh gửi — code cũ đi
  // luôn Thanh Vân, code mới phải dừng lại.
  {
    const { bot, logs, calls } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
    ]);
    has(logs, 'đã thử chọn map Thiên Sơn Tuyết Lãnh 3 lần', 'B: phai log dung sau 3 lan thu');
    lacks(logs, '🚀 Vân Du: Bắt Đầu Xuất Phát', 'B: khong duoc xuat phat khi map chua dung');
    eq(bot.vanduMapPickTries, 3, 'B: dung 3 lan thu');
    eq(bot.vanduMapPicked, false, 'B: khong duoc danh dau da chon');
    eq(bot.isRunning, false, 'B: dung bot sau khi break');
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 1 chỗ', 'B: phai log dem option moi lan mo');
    const firstTargetPick = calls.find((c) => c.needle === 'thien son tuyet lanh' && c.fn !== 'count');
    eq(firstTargetPick && firstTargetPick.fn, 'exact', 'B: bam map dich thu ExactText truoc');
  }

  // C (V57, log 08:32 của anh): mở list rồi mà tên map đích không có trong
  // DOM (0/0) -> dừng ngay sau lần 1, khỏi thử 3 lần vô ích.
  {
    const { bot, logs } = await runBot([startScreen('Thanh Vân Trấn')], '0/0');
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 0 chỗ, chứa tên 0 chỗ', 'C: phai log dem option 0/0');
    has(logs, 'không thấy tên Thiên Sơn Tuyết Lãnh đâu', 'C: phai log dung vi khong thay option');
    lacks(logs, '🚀 Vân Du: Bắt Đầu Xuất Phát', 'C: khong duoc xuat phat');
    eq(bot.vanduMapPickTries, 1, 'C: dung ngay sau lan 1');
    eq(bot.vanduMapPicked, false, 'C: khong duoc danh dau da chon');
    eq(bot.isRunning, false, 'C: dung bot sau khi break');
  }

  console.log('Vân Du map-verify checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
