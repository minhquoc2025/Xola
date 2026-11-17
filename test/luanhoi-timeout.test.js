const path = require('path');
const vm = require('vm');

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

// v97 — Luân Hồi "Hết Giờ" đóng tháp (ảnh anh gửi 2026-11-17 10:01):
// "⏰ Hết Giờ! Mày do dự quá lâu, Luân Hồi tháp đã đóng!" — bot phải tính
// thua 1 lượt rồi gõ lại !luanhoi, thay vì kẹt chờ skill/buff mãi.
// Fake DOM: article có id/textContent/innerHTML (chứa userId)/buttons,
// document chia sẻ 1 sandbox window để tick và helper thấy cùng trạng thái.
const LH_TIMEOUT_UID = '1477145807366131744';
const TIMEOUT_TEXT = '⏰ Hết Giờ! Mày do dự quá lâu, Luân Hồi tháp đã đóng!';

function lhArticle(id, text, html, buttons, attrs = {}) {
  const article = {
    id,
    textContent: text,
    innerHTML: html,
    _attrs: { ...attrs },
    _buttons: buttons,
    getAttribute(name) { return this._attrs[name] === undefined ? null : this._attrs[name]; },
    setAttribute(name, value) { this._attrs[name] = String(value); },
    removeAttribute(name) { delete this._attrs[name]; },
    querySelectorAll(sel) {
      if (String(sel).includes('button')) return this._buttons;
      return [];
    },
  };
  return article;
}

function lhSandbox(articles) {
  const windowObj = {};
  const documentObj = {
    querySelectorAll(sel) {
      if (String(sel).includes('article')) return articles;
      return [];
    },
    getElementById(id) { return articles.find(a => a.id === id) || null; },
  };
  return { document: documentObj, window: windowObj };
}

function lhBot(articles, sandbox) {
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.userId = LH_TIMEOUT_UID;
  bot.username = '';
  // Tick tự gọi mark/dismiss đầu vòng — stub để giữ nguyên cờ owned đã gắn sẵn.
  bot.markLuanhoiMessages = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  bot.log = () => {};
  return bot;
}

function timeoutArticle(id, text, owned) {
  return lhArticle(id, text, `avatars/${LH_TIMEOUT_UID}/abc.png ${text}`, [],
    owned ? { 'data-luanhoi-owned': 'true' } : {});
}

function cmdArticle() {
  return lhArticle('cmd', '!luanhoi', `avatars/${LH_TIMEOUT_UID}/abc.png !luanhoi`, []);
}

function isEndLoss(tick) {
  return !!(tick && tick.type === 'end' && tick.result === 'loss');
}

// 1. v97 — tick bước 0: tin "Hết Giờ" đóng tháp (owned) -> end/loss.
async function testLuanhoiTickTimeoutEndIsLoss() {
  const cmd = cmdArticle();
  const to = timeoutArticle('to1', TIMEOUT_TEXT, true);
  const sandbox = lhSandbox([cmd, to]);
  const bot = lhBot([cmd, to], sandbox);
  const tick = await bot.luanhoiBattleTick();
  if (!isEndLoss(tick)) throw new Error('tick phải trả end/loss khi thấy tin Hết Giờ đóng tháp, thực tế: ' + JSON.stringify(tick));
  if (!String(tick.rewardText || '').includes('Hết Giờ')) throw new Error('rewardText phải giữ nguyên tin Hết Giờ, thực tế: ' + tick.rewardText);
  console.log('Luanhoi tick timeout end is loss passed');
}

// 2. v97 — tin "Hết Giờ" KHÔNG owned (người khác) thì không được tính thua.
async function testLuanhoiTickTimeoutNotOwnedIsIgnored() {
  const cmd = cmdArticle();
  const to = timeoutArticle('to1', TIMEOUT_TEXT, false);
  const sandbox = lhSandbox([cmd, to]);
  const bot = lhBot([cmd, to], sandbox);
  const tick = await bot.luanhoiBattleTick();
  if (isEndLoss(tick)) throw new Error('tin Hết Giờ không owned không được tính thua, thực tế: ' + JSON.stringify(tick));
  console.log('Luanhoi tick timeout not owned is ignored passed');
}

// 3. v97 — tin timeout kiểu Bicanh ("Hết thời gian ở tầng 581") không phải hết lượt Luân Hồi.
async function testLuanhoiTickBicanhTimeoutIsNotLuanhoiEnd() {
  const cmd = cmdArticle();
  const bic = timeoutArticle('bic1', 'Bí Cảnh Vực Sâu — ⏰ Hết thời gian ở tầng 581! — Đã nhận thưởng tích lũy: 374751 (gold), 34 Đá cao cấp', true);
  const sandbox = lhSandbox([cmd, bic]);
  const bot = lhBot([cmd, bic], sandbox);
  const tick = await bot.luanhoiBattleTick();
  if (isEndLoss(tick)) throw new Error('tin Hết thời gian tầng 581 của Bicanh không được tính thua Luân Hồi, thực tế: ' + JSON.stringify(tick));
  console.log('Luanhoi tick Bicanh timeout is not Luanhoi end passed');
}

// 4. v97 — màn chọn cổng ("Luân Hồi tháp — Chọn 1 cổng!") có tháp nhưng không có "hết giờ" -> không tính thua.
async function testLuanhoiTickGateScreenIsNotEnd() {
  const cmd = cmdArticle();
  const gate = timeoutArticle('gate1', 'Luân Hồi tháp — Hòa — Chọn 1 cổng!', true);
  const sandbox = lhSandbox([cmd, gate]);
  const bot = lhBot([cmd, gate], sandbox);
  const tick = await bot.luanhoiBattleTick();
  if (isEndLoss(tick)) throw new Error('màn chọn cổng không được tính thua, thực tế: ' + JSON.stringify(tick));
  console.log('Luanhoi tick gate screen is not end passed');
}

// 5. v97 — helper thuần luanhoiIsTimeoutEnd: đúng cặp mới nhận.
async function testLuanhoiIsTimeoutEndPure() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  const yes = [
    TIMEOUT_TEXT,
    'Het Gio! May do du qua lau, Luan Hoi thap da dong!',
    '⏰ HẾT GIỜ! Mày do dự quá lâu, LUÂN HỒI THÁP ĐÃ ĐÓNG!',
  ];
  for (const t of yes) {
    if (!bot.luanhoiIsTimeoutEnd(t)) throw new Error('phải nhận timeout, thực tế không: ' + t);
  }
  const no = [
    'Bí Cảnh Vực Sâu — ⏰ Hết thời gian ở tầng 581!',
    'Luân Hồi tháp — Hòa — Chọn 1 cổng!',
    'Hết Giờ! Mày do dự quá lâu, cánh cửa đã đóng!',
    '',
    null,
  ];
  for (const t of no) {
    if (bot.luanhoiIsTimeoutEnd(t)) throw new Error('không được nhận timeout, thực tế nhận: ' + t);
  }
  console.log('Luanhoi isTimeoutEnd pure passed');
}

// 6. v97 — helper quét pre-battle: thấy tin timeout owned thì trả text, không thấy thì null.
async function testLuanhoiCheckTimeoutEndHelper() {
  const cmd = cmdArticle();
  const to = timeoutArticle('to1', TIMEOUT_TEXT, true);
  const sandbox = lhSandbox([cmd, to]);
  const bot = lhBot([cmd, to], sandbox);
  const found = await bot.luanhoiCheckTimeoutEnd();
  if (found !== TIMEOUT_TEXT) throw new Error('helper phải trả đúng tin Hết Giờ, thực tế: ' + found);

  const gate = timeoutArticle('gate1', 'Luân Hồi tháp — Hòa — Chọn 1 cổng!', true);
  const sandbox2 = lhSandbox([cmd, gate]);
  const bot2 = lhBot([cmd, gate], sandbox2);
  const notFound = await bot2.luanhoiCheckTimeoutEnd();
  if (notFound !== null) throw new Error('không có tin timeout thì helper phải trả null, thực tế: ' + notFound);
  console.log('Luanhoi checkTimeoutEnd helper passed');
}

Promise.resolve()
  .then(testLuanhoiTickTimeoutEndIsLoss)
  .then(testLuanhoiTickTimeoutNotOwnedIsIgnored)
  .then(testLuanhoiTickBicanhTimeoutIsNotLuanhoiEnd)
  .then(testLuanhoiTickGateScreenIsNotEnd)
  .then(testLuanhoiIsTimeoutEndPure)
  .then(testLuanhoiCheckTimeoutEndHelper)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
