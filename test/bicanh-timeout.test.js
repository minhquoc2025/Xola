const path = require('path');
const vm = require('vm');

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

const BICANH_TIMEOUT_UID = '1477145807366131744';

function timeoutArticle(text, html) {
  return {
    textContent: text,
    innerHTML: html,
    getAttribute: () => null,
    removeAttribute: () => {},
  };
}
function timeoutBot(articles) {
  const sandbox = {
    document: { querySelectorAll: () => articles },
    window: {},
  };
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.userId = BICANH_TIMEOUT_UID;
  bot.username = '';
  return bot;
}
function battleArticle() {
  return timeoutArticle('Bí Cảnh [Nguyễn Anh] — Tầng 1/600', `<@!${BICANH_TIMEOUT_UID}> Bí Cảnh tầng 1`);
}
function timeoutMsgArticle(floor) {
  return timeoutArticle(
    `Bí Cảnh Vực Sâu Hết thời gian ở tầng ${floor}! Đã nhận thưởng tích lũy: 889135`,
    `<@!${BICANH_TIMEOUT_UID}> Hết thời gian ở tầng ${floor}!`,
  );
}

// 1. Loop Bicanh: đang đánh mà game báo "Hết thời gian ở tầng 546!" thì
// bot phải DỪNG (lượt đã kết thúc, game đã trả thưởng tích lũy), không
// được quay "Không tìm thấy skill" mãi. Màn này bicanhCurrentFloor không
// đọc được (không có "/600") nên phải có handler riêng (v86).
async function testBicanhTimeoutStopsLoop() {
  const articles = [battleArticle()];
  const bot = timeoutBot(articles);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  let fakeNow = 0;
  bot.delay = async (ms) => { fakeNow += (ms || 0); };
  bot.bicanhNowMs = () => fakeNow;
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s32 = bot.luanhoiSkillNames[31];
  const s29 = bot.luanhoiSkillNames[28];
  const seen = [];
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    // Sau click thứ 2, game đăng màn timeout tầng 546 (màn mới nhất).
    if (seen.length === 2) articles.push(timeoutMsgArticle(546));
    // An toàn: code cũ (không có handler timeout) sẽ bấm tiếp mãi, dừng
    // tay sau 6 click để test kết thúc và rớt ở assert bên dưới.
    if (seen.length >= 6) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  if (seen.length !== 2) {
    throw new Error('Bicanh gặp màn hết thời gian phải dừng ngay sau 2 click, thực tế bấm: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('hết thời gian ở tầng 546') && line.includes('dừng bot'))) {
    throw new Error('Bicanh hết thời gian phải log rõ tầng và dừng bot, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh timeout stops loop passed');
}

// 2. bicanhTimeoutFloor: đọc đúng tầng từ màn timeout, bỏ qua màn timeout
// cũ (trước baseline), màn của người khác, và màn không có timeout.
async function testBicanhTimeoutFloorParsing() {
  // Màn timeout mới (sau baseline 1) -> 546.
  const botA = timeoutBot([battleArticle(), timeoutMsgArticle(546)]);
  if ((await botA.bicanhTimeoutFloor(1)) !== 546) {
    throw new Error('bicanhTimeoutFloor phải đọc tầng 546 từ màn timeout mới');
  }
  // Màn timeout cũ (trước baseline 2) -> null, không dừng oan lượt mới.
  const botB = timeoutBot([timeoutMsgArticle(546), battleArticle()]);
  if ((await botB.bicanhTimeoutFloor(2)) !== null) {
    throw new Error('bicanhTimeoutFloor phải bỏ qua màn timeout của lượt trước (trước baseline)');
  }
  // Màn timeout của người khác (không có User ID) -> null.
  const foreign = timeoutArticle('Bí Cảnh Vực Sâu Hết thời gian ở tầng 999!', 'Hết thời gian ở tầng 999 người khác');
  const botC = timeoutBot([battleArticle(), foreign]);
  if ((await botC.bicanhTimeoutFloor(1)) !== null) {
    throw new Error('bicanhTimeoutFloor phải bỏ qua màn timeout của người khác');
  }
  // Không có màn timeout -> null.
  const botD = timeoutBot([battleArticle()]);
  if ((await botD.bicanhTimeoutFloor(1)) !== null) {
    throw new Error('không có màn timeout thì bicanhTimeoutFloor phải null');
  }
  console.log('Bicanh timeout floor parsing passed');
}

// 3. Màn timeout của lượt TRƯỚC vẫn nằm trong DOM thì lượt mới KHÔNG được
// dừng oan: baseline lấy lúc vào trận phải loại nó ra.
async function testBicanhStaleTimeoutDoesNotStopNewRun() {
  const articles = [timeoutMsgArticle(546), battleArticle()];
  const bot = timeoutBot(articles);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  let fakeNow = 0;
  bot.delay = async (ms) => { fakeNow += (ms || 0); };
  bot.bicanhNowMs = () => fakeNow;
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const seen = [];
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    if (seen.length >= 3) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  if (seen.length !== 3) {
    throw new Error('màn timeout cũ không được dừng lượt mới, thực tế bấm: ' + JSON.stringify(seen));
  }
  if (logs.some((line) => line.includes('hết thời gian'))) {
    throw new Error('màn timeout cũ không được log hết thời gian, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh stale timeout does not stop new run passed');
}

testBicanhTimeoutStopsLoop()
  .then(testBicanhTimeoutFloorParsing)
  .then(testBicanhStaleTimeoutDoesNotStopNewRun)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
