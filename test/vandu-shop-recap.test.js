// Vân Du v62 — shop Tiên Thương nhận nhầm màn cửa sau khi rời shop.
// 2026-11-11, ảnh Tiết 10/36 của anh: bot rời shop lúc 10:28:58 rồi đơ
// luôn, log đứng im dù màn cửa hiện 3 nút (Thương/Tử/Đỗ) và mạch Sinh
// đang 2/5 cần Thổ (Tử Môn). Nguyên nhân: màn cửa có dòng recap "Đạo
// hữu rời khỏi lều buôn Tiên Thương an toàn..." nên điều kiện cũ
// norm.includes('tien thuong') nhận nhầm màn cửa thành shop; action
// 'mua-cuu-chuyen' (đan 2/3) bấm nút Mua không có trên màn, trả falsy mà
// không log gì, quét lại mãi — handler cửa (đứng sau handler shop) không
// bao giờ chạy. V62: shop chỉ nhận khi có nút hành động của nó (Mua/Bí
// Tịch), hoặc chữ Tiên Thương kèm nút Rời đi của shop. Kèm sửa parse mạch:
// game ghi "[🌿 Mộc] ✓ → [🔥 Hỏa] ✓" — emoji trong ngoặc, tick ngoài
// ngoặc — regex cũ chỉ cho khoảng trắng giữa ngoặc và mũi tên và hàm
// tuốt chỉ bỏ tick, nên parse ra rỗng, merge không tin game được.
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

// Màn cửa Tiết 10/36 đúng như ảnh anh gửi (recap Tiên Thương + mạch Sinh
// 2/5 dạng emoji + 3 nút cửa, không có nút shop nào).
const doorAfterShopText = `Đạo hữu rời khỏi lều buôn Tiên Thương an toàn, tiếp tục dấn bước vào sâu mê trận.
Khí Huyết 98%
Thẻ Buff 4 Thẻ Buff
Tiến Trình Tiết Điểm 10/36
Thiên Cơ 18 điểm
Ngân Lượng +387,500
Bản Đồ Thiên Cơ (Tầm Nhìn 3 Bước)
T.11 Tử Môn | Khai Môn
T.12 Trần Vực Thú I (Boss 12)
T.13 Sinh Môn | Đỗ Môn
Trận Đồ Ngũ Hành
THIÊN CƠ KHỚP HÀNH! (2/5)
Đạo hữu đã bước đúng huyền cơ mang hành Hỏa!
Mạch Tương Sinh: [🌿 Mộc] ✓ → [🔥 Hỏa] ✓ → [❓] ⌛ → [❓] → [❓]
(Tiến độ: 2/5)
Dị Biến: 👻 Cổ Ma Loạn Vũ • Cẩn nhắc kỹ trước mỗi quyết định!`;
const doorAfterShop = { msgId: 'door-10', text: doorAfterShopText, buttons: ['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'] };
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };
// Màn shop thật: có nút Mua + chữ Tiên Thương.
const shopScreen = { msgId: 'shop-1', text: 'Tiên Thương Hắc Thị\nMua Cửu Chuyển Hoàn Hồn Đan để hồi máu', buttons: ['Mua Cửu Chuyển Hoàn Hồn Đan', 'Bí Tịch Thượng Cổ', 'Rời đi tiếp tục hành trình'] };

async function runBot(screens) {
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
  const clicks = [];
  // exec stub y như click DOM thật: chỉ trả truthy khi nút cần bấm đang
  // có trên màn hiện tại (so theo chữ đã chuẩn hoá, như vanduClickButton),
  // không có thì trả null — stub trả truthy mọi nút sẽ giấu đúng lỗi
  // "bấm nút không có trên màn" mà test này cần bắt.
  bot.exec = async (js) => {
    const s = String(js);
    const m = s.match(/const needle = "([^"]*)"/);
    const needle = m ? m[1] : '';
    if (needle) {
      const btn = (current && current.buttons || []).find((b) => bot.vanduNormalize(b).includes(needle));
      if (btn) {
        if (needle.includes('tu mon')) clicks.push('tu mon');
        if (needle.includes('mua cuu chuyen')) clicks.push('mua cuu chuyen');
        if (needle.includes('bi tich')) clicks.push('bi tich');
        if (needle.includes('roi di tiep tuc hanh trinh')) clicks.push('roi di');
        if (needle.includes('tro ve giang ho')) clicks.push('tro ve giang ho');
        return btn;
      }
      return null;
    }
    return 'clicked';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);
  return { bot, logs, clicks };
}

(async () => {
  // Parse mạch dạng emoji (ảnh Tiết 10/36): phải ra [Mộc, Hỏa], last Hỏa.
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    eq(bot.vanduParseCircuit(doorAfterShopText), { type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa', fromProgress: true }, 'parse Sinh emoji 2/5');
    eq(bot.vanduParseCircuit('Mạch Tương Sinh: [✓ Mộc] → [✓ Hỏa] → [?] → [?] → [?]'), { type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa', fromProgress: true }, 'parse Sinh dang tick cu van dung');
    eq(bot.vanduChooseDoor(['⚔️ Thương Môn', '💀 Tử Môn', '🌀 Đỗ Môn'], { type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa' }), '💀 Tử Môn', 'Sinh sau Hoa -> Tu (Tho)');
  }

  // A (bug chính): màn cửa có recap Tiên Thương — bot phải bấm Tử Môn,
  // không được thử mua đan, không được im lặng đơ.
  {
    const { bot, logs, clicks } = await runBot([doorAfterShop, tripEndScreen, tripEndScreen]);
    has(logs, 'chọn cửa "💀 Tử Môn"', 'A: phai bam Tu Mon (Tho) theo mach Sinh 2/5');
    has(logs, 'mạch sinh tiến Hỏa -> Thổ', 'A: phai log tien mach Hoa -> Tho');
    eq(clicks.includes('mua cuu chuyen'), false, 'A: khong duoc bam Mua Cuu Chuyen tren man cua');
    eq(clicks.includes('tu mon'), true, 'A: phai co cum bam Tu Mon');
    lacks(logs, 'mua Cửu Chuyển Hoàn Hồn Đan', 'A: khong duoc log mua dan');
    lacks(logs, 'không bấm được nút Mua', 'A: khong duoc roi vao nhanh shop that bai');
    eq(bot.isRunning, false, 'A: het chuyen thi dung');
  }

  // B (không phá shop thật): màn shop có nút Mua thì vẫn mua đan 1/3,
  // rồi rời shop, rồi màn cửa sau đó vẫn bấm cửa bình thường.
  {
    const { logs, clicks } = await runBot([shopScreen, shopScreen, doorAfterShop, tripEndScreen, tripEndScreen]);
    has(logs, 'mua Cửu Chuyển Hoàn Hồn Đan (1/3)', 'B: shop that van mua dan');
    eq(clicks.includes('mua cuu chuyen'), true, 'B: phai co cum bam Mua');
    has(logs, 'rời shop, tiếp tục hành trình', 'B: mua xong thi roi shop');
    has(logs, 'chọn cửa "💀 Tử Môn"', 'B: man cua sau shop van bam Tu Mon');
  }

  // C (shop đã mua xong, nút Mua biến mất chỉ còn nút Rời đi, cùng 1
  // message nên khóa shop giữ nguyên): vẫn nhận là shop để bấm Rời đi,
  // không rơi xuống handler tiết điểm phụ.
  {
    const shopAfterBuy = { msgId: 'shop-1', text: shopScreen.text, buttons: ['Rời đi tiếp tục hành trình'] };
    const { logs, clicks } = await runBot([shopScreen, shopAfterBuy, doorAfterShop, tripEndScreen, tripEndScreen]);
    has(logs, 'mua Cửu Chuyển Hoàn Hồn Đan (1/3)', 'C: phai mua dan o man shop dau');
    has(logs, 'rời shop, tiếp tục hành trình', 'C: shop chi con nut Roi di van roi shop');
    eq(clicks.includes('roi di'), true, 'C: phai co cum bam Roi di');
    lacks(logs, 'tiết điểm phụ, bấm Rời đi', 'C: khong duoc nham thanh tiet diem phu');
    has(logs, 'chọn cửa "💀 Tử Môn"', 'C: man cua sau do van bam Tu Mon');
  }

  console.log('vandu-shop-recap: OK');
})();
