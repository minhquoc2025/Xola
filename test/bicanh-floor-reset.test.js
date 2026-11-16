const path = require('path');
const vm = require('vm');

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

// 1. Bicanh loop: combo 32,29,26,23 (Lôi Đình, Hư, Kim, Vạn). Đánh tầng 1
// tới skill thứ 3 thì game sang tầng 2 — vòng sau phải chạy lại từ skill
// đầu (Lôi Đình), KHÔNG được bấm tiếp Vạn của vòng cũ. Cooldown giữ qua
// tầng (v83) và tính bằng LƯỢT BẤM ĐƯỢC CHẤP NHẬN (v92, không tính bằng
// thời gian thật nữa — log thật 2026-11-16: chờ 8s = 0 lượt trôi): Lôi
// Đình dùng ở tầng 1 ghi 3, tới lúc sang tầng 2 chỉ mới trừ 1 (cú bấm Hư
// ở tầng 1 được chấp nhận) nên còn 2 lượt — bot CHỜ 2 vòng rồi bấm thử
// đúng Lôi Đình (probe, không nhảy skill); Hư hồi 3 turn do game báo ở
// click Kim tầng 1, tới lượt Hư chỉ mới trừ 1 (cú bấm Lôi Đình probe được
// chấp nhận) nên còn 2 lượt — Hư CŨNG phải chờ rồi probe, KHÔNG được
// bấm ngay (v85 cho bấm ngay vì thời gian chờ Lôi Đình làm mốc hết hạn
// — sai: chờ không trôi lượt).
async function testBicanhFloorResetRestartsCombo() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s32 = bot.luanhoiSkillNames[31];
  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  let floorNow = 1;
  bot.bicanhCurrentFloor = async () => floorNow;
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    // Click thứ 3 (Kim, tầng 1): ghi Hư hồi 3 turn, rồi game sang tầng 2.
    if (skillName === s26 && counts[s26] === 1) {
      floorNow = 2;
      return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 3 }, skipCurrent: false };
    }
    if (seen.length === 5) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // Tầng 1: Lôi Đình -> Hư -> Kim; tầng 2: Lôi Đình -> Hư (chạy lại từ đầu).
  const expected = [s32, s29, s26, s32, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh sang tầng mới phải chạy lại combo từ đầu, thực tế: ' + JSON.stringify(seen));
  }
  // Map cooldown tầng cũ PHẢI được giữ (v83) và tính bằng lượt (v92):
  // sau dòng log "sang tầng 2" phải có lần chờ "đang hồi còn N lượt" cho
  // Lôi Đình (dùng ở tầng 1 ghi 3, tới lúc sang tầng mới chỉ trừ 1 nên
  // còn 2 lượt) VÀ một dòng probe "đã chờ 3 vòng... bấm thử" cho Lôi
  // Đình (chờ không trôi lượt nên bot không được kẹt mãi, cũng không
  // được nhảy skill). Hư CŨNG phải có lần chờ (hồi 3 turn do game báo ở
  // click Kim tầng 1, tới lượt Hư chỉ trừ 1 nên còn 2 lượt — v85 sai ở
  // đây khi cho Hư bấm ngay vì thời gian chờ Lôi Đình làm mốc hết hạn).
  const floorIdx = logs.findIndex((line) => line.includes('sang tầng 2') && line.includes(s32));
  if (floorIdx < 0) {
    throw new Error('Bicanh sang tầng phải log rõ là chạy lại combo từ đầu, log thực tế: ' + JSON.stringify(logs));
  }
  const afterFloor = logs.slice(floorIdx);
  if (!afterFloor.some((line) => line.includes('đang hồi còn') && line.includes(s32) && line.includes('lượt — chờ rồi bấm lại'))) {
    throw new Error('Bicanh sang tầng phải giữ cooldown skill vừa dùng: Lôi Đình dùng ở tầng 1 mới trôi 1 lượt nên phải chờ hồi, không được bấm lại ngay, log thực tế: ' + JSON.stringify(logs));
  }
  if (!afterFloor.some((line) => line.includes('đã chờ 3 vòng') && line.includes(s32) && line.includes('bấm thử'))) {
    throw new Error('Bicanh sang tầng phải probe Lôi Đình sau 3 vòng chờ (chờ không trôi lượt nên không được kẹt mãi), log thực tế: ' + JSON.stringify(logs));
  }
  if (!afterFloor.some((line) => line.includes('đang hồi còn') && line.includes(s29) && line.includes('lượt — chờ rồi bấm lại'))) {
    throw new Error('Bicanh sang tầng phải chờ Hư nữa: hồi 3 turn ở tầng 1 chỉ trừ 1 lượt nên tới lượt Hư vẫn còn 2 lượt, không được bấm ngay như v85, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh floor reset restarts combo passed');
}

// 2. bicanhCurrentFloor: đọc "Tầng N/600" từ màn battle mới nhất của mình,
// bỏ qua tin "Thắng tầng N!" (không có /600) và màn của người khác.
const BICANH_FLOOR_UID = '1477145807366131744';
function floorArticle(text, html) {
  return {
    textContent: text,
    innerHTML: html,
    getAttribute: () => null,
  };
}
function floorBot(articles, userId) {
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, {
      document: { querySelectorAll: () => articles },
    }),
  }, 1);
  bot.userId = userId;
  bot.username = '';
  return bot;
}

async function testBicanhCurrentFloorParsesNewestBattle() {
  const oldBattle = floorArticle('Bí Cảnh [Nguyễn Anh] — Tầng 373/600', `<@!${BICANH_FLOOR_UID}> Bí Cảnh tầng 373`);
  const winMsg = floorArticle('✅ Thắng tầng 373!', `<@!${BICANH_FLOOR_UID}> Thắng tầng 373!`);
  const newBattle = floorArticle('Bí Cảnh [Nguyễn Anh] — Tầng 374/600', `<@!${BICANH_FLOOR_UID}> Bí Cảnh tầng 374`);
  const bot = floorBot([oldBattle, winMsg, newBattle], BICANH_FLOOR_UID);
  const floor = await bot.bicanhCurrentFloor();
  if (floor !== 374) throw new Error('bicanhCurrentFloor phải đọc tầng mới nhất 374, thực tế: ' + floor);

  // Màn người khác (không có User ID) dù mới hơn cũng bị bỏ qua.
  const other = floorArticle('Bí Cảnh [Người khác] — Tầng 999/600', 'Bí Cảnh tầng 999 người khác');
  const bot2 = floorBot([oldBattle, newBattle, other], BICANH_FLOOR_UID);
  if ((await bot2.bicanhCurrentFloor()) !== 374) throw new Error('bicanhCurrentFloor phải bỏ qua màn người khác');

  // Không có màn nào ghi "Tầng N/600" thì trả null, không đoán.
  const noFloor = floorArticle('Bí Cảnh — đang tải...', `<@!${BICANH_FLOOR_UID}> Bí Cảnh`);
  const bot3 = floorBot([noFloor], BICANH_FLOOR_UID);
  if ((await bot3.bicanhCurrentFloor()) !== null) throw new Error('không đọc được tầng thì bicanhCurrentFloor phải null');

  // exec trả về 0 (stub () => 0 trong các test loop cũ) thì cũng là null.
  const bot4 = new NpcBot({ executeJavaScript: () => 0 }, 1);
  if ((await bot4.bicanhCurrentFloor()) !== null) throw new Error('exec trả 0 thì bicanhCurrentFloor phải null');
  console.log('Bicanh current floor parses newest battle passed');
}

// 3. Không đọc được tầng (null) giữa trận thì KHÔNG được reset combo —
// vòng xoay tiếp tục từ chỗ đang dừng, không chạy lại từ đầu giữa tầng.
async function testBicanhFloorNullDoesNotReset() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s32 = bot.luanhoiSkillNames[31];
  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  let calls = 0;
  bot.bicanhCurrentFloor = async () => { calls++; return calls <= 2 ? 1 : null; };
  const seen = [];
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    if (seen.length === 5) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  const expected = [s32, s29, s26, s23, s32];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('không đọc được tầng thì combo phải tiếp tục, không reset giữa tầng, thực tế: ' + JSON.stringify(seen));
  }
  if (logs.some((line) => line.includes('sang tầng'))) {
    throw new Error('không đọc được tầng thì không được log sang tầng, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh floor null does not reset passed');
}

testBicanhFloorResetRestartsCombo()
  .then(testBicanhCurrentFloorParsesNewestBattle)
  .then(testBicanhFloorNullDoesNotReset)
  .then(testBicanhStopsAtMaxFloor)
  .then(testBicanhFloorExposedInStatus)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

// 5. v90 — tầng hiện tại phải lộ ra getStatus để thẻ trạng thái quét được.
async function testBicanhFloorExposedInStatus() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  bot.log = () => {};
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  let calls = 0;
  bot.bicanhCurrentFloor = async () => { calls++; return calls <= 2 ? 541 : 542; };
  const seen = [];
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    if (seen.length === 5) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  if (bot.bicanhFloor !== 542) {
    throw new Error('bot phải ghi tầng hiện tại vào bicanhFloor, thực tế: ' + bot.bicanhFloor);
  }
  const status = bot.getStatus();
  if (status.bicanhFloor !== 542) {
    throw new Error('getStatus phải lộ bicanhFloor cho thẻ trạng thái, thực tế: ' + JSON.stringify(status.bicanhFloor));
  }
  console.log('Bicanh floor exposed in status passed');
}

// 4. v87 — tới tầng 600 (tối đa) thì dừng ngay, không bấm skill nữa.
async function testBicanhStopsAtMaxFloor() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [32, 29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  bot.bicanhCurrentFloor = async () => 600;
  const seen = [];
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    if (seen.length >= 5) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  if (seen.length !== 0) {
    throw new Error('Bicanh tới tầng 600 phải dừng ngay, không bấm skill nào, thực tế bấm: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('tầng 600') && line.includes('dừng bot'))) {
    throw new Error('Bicanh tới tầng 600 phải log rõ tầng tối đa và dừng bot, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh stops at max floor passed');
}
