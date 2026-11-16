const path = require('path');
const vm = require('vm');

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

// 1. Bicanh loop: combo 29,26,23, click 23 bị game báo "Đợi lượt trước xử lý
// xong đã!" thì vòng sau phải click lại 23, KHÔNG được tiến tới 29 của vòng sau.
// Bot cũ: 29,26,23,29,26,23... nhưng game chỉ tính 29,26,29,26,23 -> lệch cooldown.
async function testBicanhWaitTurnRetriesPreviousSkill() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  let calls = 0;
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    calls++;
    // Lần click thứ 4 là skill 29 của vòng sau, nhưng clickNext phát hiện tin
    // "Đợi lượt..." còn sót từ lần click 23 trước đó -> báo waitTurn, không click 29.
    if (calls === 4) return { clicked: null, waitTurn: true };
    // Lần thứ 5 phải là click lại 23, sau đó dừng loop để test kết thúc.
    if (calls === 5) {
      bot.isRunning = false;
      return { clicked: skillName, waitTurn: false };
    }
    return { clicked: skillName, waitTurn: false };
  };

  await bot.bicanhLoop(1);

  const expected = [s29, s26, s23, s29, s23];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh wait-turn phải click lại skill trước đó, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('Đợi lượt trước xử lý xong đã!') && line.includes(s23))) {
    throw new Error('Bicanh wait-turn phải log rõ là click lại skill trước đó, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh wait-turn retries previous skill passed');
}

// 1b. v89 — "Tương tác này không thành công" thì bấm lại skill trước đó.
async function testBicanhInteractionFailedRetriesPreviousSkill() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  let calls = 0;
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    calls++;
    // Lần click thứ 4 là skill 29 của vòng sau, nhưng clickNext phát hiện tin
    // "Tương tác này không thành công" còn sót từ lần click 23 trước đó ->
    // báo interactionFailed, không click 29.
    if (calls === 4) return { clicked: null, interactionFailed: true };
    // Lần thứ 5 phải là click lại 23, sau đó dừng loop để test kết thúc.
    if (calls === 5) {
      bot.isRunning = false;
      return { clicked: skillName, interactionFailed: false };
    }
    return { clicked: skillName, interactionFailed: false };
  };

  await bot.bicanhLoop(1);

  const expected = [s29, s26, s23, s29, s23];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh interaction-failed phải click lại skill trước đó, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('Tương tác này không thành công') && line.includes(s23))) {
    throw new Error('Bicanh interaction-failed phải log rõ là click lại skill trước đó, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh interaction-failed retries previous skill passed');
}

// 2. peekBicanhEphemeralKind: phân biệt 2 loại tin nhắn trước khi dismiss.
function makePeekBot(messages) {
  return new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, {
      document: { querySelectorAll: () => messages },
    }),
  }, 1);
}
function msg(text, dismissed = false) {
  return {
    textContent: text,
    getAttribute: (name) => (name === 'data-bot-ephemeral-dismissed' && dismissed ? 'true' : null),
  };
}

async function testPeekBicanhEphemeralKind() {
  const waitMsg = msg('⏳ Đợi lượt trước xử lý xong đã! Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn');
  const cdMsg = msg('⏳ Vạn Kiếm Quy Tông đang hồi! Còn 1 turn. Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn');

  const waitBot = makePeekBot([cdMsg, waitMsg]);
  if (await waitBot.peekBicanhEphemeralKind() !== 'wait-turn') {
    throw new Error('peek phải ưu tiên "Đợi lượt..." hơn "đang hồi"');
  }
  const cdBot = makePeekBot([cdMsg]);
  if (await cdBot.peekBicanhEphemeralKind() !== 'cooldown') {
    throw new Error('peek phải nhận ra "đang hồi" là cooldown');
  }
  const dismissedBot = makePeekBot([msg('Đợi lượt trước xử lý xong đã!', true)]);
  if (await dismissedBot.peekBicanhEphemeralKind() !== null) {
    throw new Error('peek phải bỏ qua tin nhắn đã dismiss');
  }
  const noneBot = makePeekBot([msg('Chào bạn')]);
  if (await noneBot.peekBicanhEphemeralKind() !== null) {
    throw new Error('peek phải trả null khi không có tin nhắn ephemeral');
  }
  // Tin "Đợi lượt..." chỉ nằm ở thẻ bọc class ephemeral, không phải article:
  // peek phải quét cả 2 loại selector như dismiss, nếu không sẽ miss và loop
  // vẫn tiến skill sai dù dismiss vẫn bấm được tin đó.
  const classOnlyBot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, {
      document: {
        querySelectorAll: (selector) => (String(selector).includes('ephemeral') ? [waitMsg] : []),
      },
    }),
  }, 1);
  if (await classOnlyBot.peekBicanhEphemeralKind() !== 'wait-turn') {
    throw new Error('peek phải tìm được tin "Đợi lượt..." ở thẻ bọc class ephemeral');
  }
  console.log('Bicanh ephemeral peek classification passed');
}

// 3b. v89 — peek nhận ra tin "Tương tác này không thành công".
async function testPeekInteractionFailed() {
  const failBot = makePeekBot([msg('Tương tác này không thành công. Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn')]);
  const detail = await failBot.peekBicanhEphemeralDetail();
  if (!detail || detail.kind !== 'interaction-failed') {
    throw new Error('peek phải nhận ra "Tương tác này không thành công", thực tế: ' + JSON.stringify(detail));
  }
  // Ưu tiên hơn "đang hồi" (trả về ngay như wait-turn).
  const bothBot = makePeekBot([msg('⏳ Kim Đan Phá Sát đang hồi! Còn 2 turn.'), msg('Tương tác này không thành công.')]);
  if (await bothBot.peekBicanhEphemeralKind() !== 'interaction-failed') {
    throw new Error('peek phải ưu tiên "Tương tác này không thành công" hơn "đang hồi"');
  }
  console.log('Bicanh interaction-failed peek passed');
}

// 3. peek detail: parse được skill + số turn từ tin "đang hồi".
async function testPeekBicanhEphemeralDetail() {
  const cdBot = makePeekBot([msg('⏳ Kim Đan Phá Sát đang hồi! Còn 2 turn. Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn')]);
  const detail = await cdBot.peekBicanhEphemeralDetail();
  if (!detail || detail.kind !== 'cooldown' || detail.skill !== 'Kim Đan Phá Sát' || detail.turns !== 2) {
    throw new Error('peek detail phải parse skill + turns, thực tế: ' + JSON.stringify(detail));
  }
  const waitBot = makePeekBot([msg('⏳ Đợi lượt trước xử lý xong đã!')]);
  const waitDetail = await waitBot.peekBicanhEphemeralDetail();
  if (!waitDetail || waitDetail.kind !== 'wait-turn') {
    throw new Error('peek detail phải nhận ra wait-turn, thực tế: ' + JSON.stringify(waitDetail));
  }
  console.log('Bicanh ephemeral peek detail passed');
}

// 4. Loop Bicanh: skill bị báo hồi 2 turn thì phải chờ rồi bấm lại đúng
// skill đó, thay vì bấm lại ngay vòng sau và lại bị báo hồi (v92: hồi
// tính bằng lượt bấm được chấp nhận, không tính bằng thời gian — s29 ghi
// 2, tới lượt nó chỉ trừ 1 (cú bấm s23 được chấp nhận) nên còn 1 lượt,
// bot chờ 2 vòng rồi bấm thử đúng s29 (probe, không nhảy skill)).
async function testBicanhCooldownSkip() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    if (skillName === s26 && counts[s26] === 1) {
      // Trước lần click s26 này, s29 vừa bị báo hồi 2 turn.
      return { clicked: skillName, waitTurn: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 2 } };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, cooldownDetail: null };
  };

  await bot.bicanhLoop(1);

  // Xoay chuẩn: s29 bị ghi hồi 2 turn, tới lượt s29 (sau s23 được chấp
  // nhận, trừ 1) còn 1 lượt nên bot phải CHỜ 2 vòng rồi bấm thử đúng s29,
  // KHÔNG nhảy tới s26/s23 nữa.
  const expected = [s29, s26, s23, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh xoay chuẩn phải chờ và bấm lại đúng skill đang hồi, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('đang hồi') && line.includes(s29) && line.includes('không nhảy'))) {
    throw new Error('Bicanh xoay chuẩn phải log rõ là chờ đúng skill, không nhảy, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh cooldown skip passed');
}

// 5. Dismiss: bấm link ở node footer thì phải đánh dấu cả article cha là
// dismissed, nếu không peek/check sẽ đọc lại tin cũ mãi.
async function testDismissMarksParentArticle() {
  const attrs = {};
  const article = {
    textContent: '⏳ Kim Đan Phá Sát đang hồi! Còn 2 turn. Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn',
    getAttribute: (name) => attrs[name] || null,
    setAttribute: (name, value) => { attrs[name] = value; },
    querySelectorAll: () => [],
    closest: () => article,
  };
  let linkClicked = false;
  const footer = {
    textContent: 'Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn',
    getAttribute: () => null,
    setAttribute: () => {},
    querySelectorAll: () => [{ textContent: 'Bỏ qua tin nhắn', disabled: false, click: () => { linkClicked = true; } }],
    closest: () => article,
  };
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, {
      document: { querySelectorAll: () => [article, footer] },
    }),
  }, 1);
  bot.log = () => {};
  await bot.dismissEphemeralMessages();
  if (!linkClicked) throw new Error('dismiss phải bấm link Bỏ qua tin nhắn');
  if (attrs['data-bot-ephemeral-dismissed'] !== 'true') {
    throw new Error('dismiss phải đánh dấu article cha là dismissed, thực tế: ' + JSON.stringify(attrs));
  }
  console.log('Bicanh dismiss marks parent article passed');
}

// 6. Loop Bicanh: clickNext báo skipCurrent (tin hồi chiêu đúng là skill
// sắp bấm) thì loop phải CHỜ và bấm lại đúng skill đó, KHÔNG tiến tới
// skill khác (xoay chuẩn). v92: chờ không trừ map — sau 3 vòng chờ bot
// bấm thử đúng skill đó (probe) thay vì đợi mốc thời gian hết hạn như v85.
async function testBicanhSkipCurrentCooldown() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    // Lần đầu tới s29: đã biết s29 đang hồi 2 turn, không được bấm nó.
    if (skillName === s29 && counts[s29] === 1) {
      return { clicked: null, waitTurn: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 2 }, skipCurrent: true };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // Xoay chuẩn: s29 lần đầu đã biết đang hồi 2 turn, bot chờ 2 vòng rồi
  // bấm thử đúng s29 (probe), không qua s26/s23 ở giữa.
  const expected = [s29, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh skipCurrent xoay chuẩn phải chờ và bấm lại đúng skill, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes(s29) && line.includes('đã biết trước khi bấm') && line.includes('không nhảy'))) {
    throw new Error('Bicanh skipCurrent phải log rõ là đã biết trước khi bấm và không nhảy, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh skipCurrent cooldown passed');
}

// 7. clickNext thật: peek thấy tin hồi chiêu đúng là skill sắp bấm thì
// không được bấm nút skill đó (mock exec: peek script trả detail, dismiss
// trả null, click script không được chạy tới nút).
async function testClickNextSkipsKnownCooldownSkill() {
  const skillName = 'Kim Đan Phá Sát';
  let clickScriptRun = false;
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => ({ kind: 'cooldown', skill: skillName, turns: 2 });
  bot.dismissEphemeralMessages = async () => {};
  bot.exec = async (code) => {
    // Script click skill chứa isOwnedGameMessage; peek/dismiss đã mock ở trên
    // nên mọi exec còn lại ở đây đều là script click -> ghi nhận là đã chạy.
    clickScriptRun = true;
    return null;
  };
  const result = await bot.clickNextBicanhSkill(skillName);
  if (!result || !result.skipCurrent || result.clicked) {
    throw new Error('clickNext phải trả skipCurrent và không click skill đang hồi, thực tế: ' + JSON.stringify(result));
  }
  if (clickScriptRun) {
    throw new Error('clickNext không được chạy script click khi skill đã biết đang hồi');
  }
  console.log('Bicanh clickNext skipCurrent passed');
}

// 8. Tin "Có phải mày đâu!" (bấm nhầm của người khác): peek phải nhận ra
// là wrong-person, và loop phải lùi về skill trước đó để bấm lại đúng trận,
// KHÔNG tiến tới skill tiếp theo, KHÔNG coi như lượt đã qua.
async function testPeekWrongPerson() {
  const wrongBot = makePeekBot([msg('🤡 Có phải mày đâu! Chỉ bạn mới có thể thấy điều này • Bỏ qua tin nhắn')]);
  const detail = await wrongBot.peekBicanhEphemeralDetail();
  if (!detail || detail.kind !== 'wrong-person') {
    throw new Error('peek phải nhận ra "Có phải mày đâu!" là wrong-person, thực tế: ' + JSON.stringify(detail));
  }
  console.log('Bicanh wrong-person peek passed');
}

async function testBicanhWrongPersonRetriesPreviousSkill() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    // Lần tới s26: peek thấy tin "Có phải mày đâu!" từ lần click s29 trước
    // đó -> loop phải lùi về s29 bấm lại, không được tiến tới s23.
    if (skillName === s26 && counts[s26] === 1) {
      return { clicked: null, waitTurn: false, wrongPerson: true, cooldownDetail: null, skipCurrent: false };
    }
    if (skillName === s23 && counts[s23] === 1) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  const expected = [s29, s26, s29, s26, s23];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh wrong-person phải bấm lại skill trước đó, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('Có phải mày đâu') && line.includes(s29))) {
    throw new Error('Bicanh wrong-person phải log rõ là bấm lại skill trước đó, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh wrong-person retries previous skill passed');
}

async function testClickNextWrongPersonDoesNotClick() {
  let clickScriptRun = false;
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => ({ kind: 'wrong-person', skill: null, turns: null });
  bot.dismissEphemeralMessages = async () => {};
  bot.exec = async () => { clickScriptRun = true; return null; };
  const result = await bot.clickNextBicanhSkill('Kim Đan Phá Sát');
  if (!result || !result.wrongPerson || result.clicked) {
    throw new Error('clickNext phải trả wrongPerson và không click, thực tế: ' + JSON.stringify(result));
  }
  if (clickScriptRun) {
    throw new Error('clickNext không được chạy script click khi thấy tin bấm nhầm');
  }
  console.log('Bicanh clickNext wrong-person passed');
}

// 11. Lùi đợi lượt 2 lần liên tiếp mà không có click ở giữa là sai: tin
// thứ 2 không thể sinh ra từ click mới, nên loop phải bấm thử skill hiện
// tại (ignoreEphemeral) thay vì lùi thêm 1 skill nữa và bấm lại skill đã
// được tính (nguyên nhân "mỗi skill bị bấm 2 lần" ở log 09:06:43-45).
async function testBicanhDuplicateWaitTurnDoesNotStepBackTwice() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  let forceUsed = false;
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName, opts = {}) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    if (opts.ignoreEphemeral) {
      forceUsed = true;
      bot.isRunning = false;
      return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
    }
    // s29 (vòng sau) báo đợi lượt lần 1 -> lùi về s23. Tới s23 lại báo đợi
    // lượt lần 2 mà không có click nào ở giữa -> phải bấm thử s23, không
    // được lùi về s26.
    if (skillName === s29 && counts[s29] === 2) return { clicked: null, waitTurn: true, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
    if (skillName === s23 && counts[s23] === 2) return { clicked: null, waitTurn: true, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  if (!forceUsed) throw new Error('Bicanh duplicate wait-turn phải bấm thử skill hiện tại với ignoreEphemeral');
  // Sau lần đợi lượt thứ 2, s26 không được xuất hiện lại (lùi thêm là sai).
  const afterSecondWait = seen.slice(5);
  if (afterSecondWait.includes(s26)) {
    throw new Error('Bicanh duplicate wait-turn không được lùi về skill trước nữa, thực tế: ' + JSON.stringify(seen));
  }
  console.log('Bicanh duplicate wait-turn does not step back twice passed');
}

// 12. v92 — "không tìm thấy" KHÔNG làm lượt trôi: s29 hồi 2 turn, s23
// bị "không tìm thấy" 2 lần liên tiếp thì tới lượt s29 vẫn còn 1 lượt
// (chỉ trừ 1 là lượt của cú bấm s26 được chấp nhận trước đó) — bot phải
// CHỜ rồi bấm thử đúng s29 (probe), không được bấm ngay như v85 (v85 cho
// là 4000ms đã trôi qua nên hết hồi — sai: chờ/không tìm thấy không trôi
// lượt, log thật 2026-11-16: chờ 8s = 0 lượt).
async function testBicanhNotFoundDoesNotTickCooldown() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    if (skillName === s26 && counts[s26] === 1) {
      return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 2 }, skipCurrent: false };
    }
    if (skillName === s23 && counts[s23] <= 2) {
      return { clicked: null, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // Xoay chuẩn: s29 (lần 1) -> s26 (ghi s29=2 turn) -> s23 không tìm
  // thấy x2 (không trừ lượt nào) -> s23 bấm được (trừ 1: s29 còn 1) ->
  // tới lượt s29 bot CHỜ 2 vòng rồi bấm thử đúng s29 (probe), không nhảy
  // qua s26/s23 nữa.
  const expected = [s29, s26, s23, s23, s23, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh not-found không được trừ cooldown mỗi lần, thực tế: ' + JSON.stringify(seen));
  }
  // v92: lần chờ s29 phải ghi "còn 1 lượt" (không tìm thấy không trừ),
  // và phải có dòng probe sau 3 vòng chờ (chờ không trôi lượt nên không
  // được kẹt mãi, cũng không được bấm ngay như v85).
  if (!logs.some((line) => line.includes('đang hồi còn 1 lượt') && line.includes(s29))) {
    throw new Error('Bicanh not-found không được trừ cooldown: tới lượt s29 phải còn đúng 1 lượt, log thực tế: ' + JSON.stringify(logs));
  }
  if (!logs.some((line) => line.includes('đã chờ 3 vòng') && line.includes(s29) && line.includes('bấm thử'))) {
    throw new Error('Bicanh not-found phải probe s29 sau 3 vòng chờ, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh not-found does not tick cooldown passed');
}

// 13. Xoay chuẩn thay cho chặn vừa bấm: thứ tự Kim -> Hư, với Vạn đã
// ghi hồi 1 và Kim đã ghi hồi 2 trước lần bấm Hư, thì tới lượt Vạn bot
// phải CHỜ rồi bấm thử đúng Vạn (probe), không nhảy skill khác, và
// không bấm lại Hư ở giữa. v92: Vạn ghi 1, tới lượt nó chỉ trừ 1 (cú
// bấm Hư được chấp nhận) — chờ 2 vòng rồi probe, không đợi thời gian.
async function testBicanhDoesNotReclickJustUsedSkillAfterSkips() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [26, 29, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  // v92: không còn đồng hồ giả — cooldown tính bằng lượt bấm được chấp nhận,
  // delay chỉ là chờ, không làm lượt trôi.
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s26 = bot.luanhoiSkillNames[25];
  const s29 = bot.luanhoiSkillNames[28];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    // Lần bấm Kim ghi Vạn hồi 1; lần bấm Hư ghi Kim hồi 2. Sau đó Kim và
    // Vạn đều bị bỏ qua theo map, quay lại Hư thì phải bị chặn vừa bấm.
    if (skillName === s26 && counts[s26] === 1) {
      return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: { kind: 'cooldown', skill: s23, turns: 1 }, skipCurrent: false };
    }
    if (skillName === s29 && counts[s29] === 1) {
      return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: { kind: 'cooldown', skill: s26, turns: 2 }, skipCurrent: false };
    }
    if (skillName === s23 && counts[s23] === 1) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, wrongPerson: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // Xoay chuẩn: Kim -> Hư -> Vạn, Vạn chờ 2 vòng rồi bấm thử đúng Vạn
  // (probe), không có lần bấm Hư thứ 2 chen vào giữa.
  const expected = [s26, s29, s23];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh xoay chuẩn phải bấm đúng thứ tự Kim -> Hư -> Vạn, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('đang hồi') && line.includes(s23) && line.includes('không nhảy'))) {
    throw new Error('Bicanh xoay chuẩn phải log rõ là chờ đúng Vạn, không nhảy, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh does not reclick just used skill after skips passed');
}

// 14. Focus màn battle mới (anh 2026-11-10): DOM dài quá game sinh message
// battle mới, bot phải focus màn mới nhất sau !bicanh chứa User ID.
// Fake DOM: article có id/innerHTML (chứa userId)/buttons, document chia
// sẻ 1 sandbox window để focus và click thấy cùng trạng thái.
const BICANH_FOCUS_UID = '1354743950086242366';
function focusButton(text, opts = {}) {
  const btn = {
    textContent: text,
    disabled: !!opts.disabled,
    offsetParent: opts.hidden ? null : {},
    clicked: false,
    click() { btn.clicked = true; },
  };
  return btn;
}
function focusArticle(id, text, html, buttons, attrs = {}) {
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
function focusSandbox(articles) {
  const windowObj = {};
  const documentObj = {
    querySelectorAll(sel) {
      if (String(sel).includes('data-bicanh-focus')) {
        return articles.filter(a => a.getAttribute('data-bicanh-focus') === 'true');
      }
      if (String(sel).includes('article')) return articles;
      return [];
    },
    getElementById(id) { return articles.find(a => a.id === id) || null; },
  };
  return { document: documentObj, window: windowObj };
}
function focusBattleArticles() {
  const skill = 'Hư Không Đại Na Di';
  const old1 = focusArticle('old1', 'Bí Cảnh — Tầng 5/600 · Quất Bất Lực', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 5/600`, [focusButton(skill)]);
  const cmd1 = focusArticle('cmd1', '!bicanh', `avatars/${BICANH_FOCUS_UID}/abc.png !bicanh`, []);
  const batA = focusArticle('batA', 'Bí Cảnh — Tầng 6/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 6/600`, [focusButton(skill)]);
  const batB = focusArticle('batB', 'Bí Cảnh — Tầng 6/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 6/600`, [focusButton(skill)]);
  return { old1, cmd1, batA, batB, skill };
}
function focusBot(articles, sandbox) {
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.userId = BICANH_FOCUS_UID;
  bot.username = '';
  bot._bicanhMsgBaseline = 1;
  return bot;
}

async function testBicanhFocusPicksLatestPostAnchorBattle() {
  const { old1, cmd1, batA, batB } = focusBattleArticles();
  const sandbox = focusSandbox([old1, cmd1, batA, batB]);
  const bot = focusBot([old1, cmd1, batA, batB], sandbox);
  const focused = await bot.bicanhFocusBattle();
  if (focused !== 'batB') throw new Error('focus phải chọn màn battle mới nhất sau !bicanh, thực tế: ' + focused);
  if (sandbox.window.botBicanhFocusMsgId !== 'batB') throw new Error('focus phải ghi window.botBicanhFocusMsgId = batB');
  if (batB.getAttribute('data-bicanh-focus') !== 'true') throw new Error('màn focus phải được đánh dấu data-bicanh-focus');
  if (batA.getAttribute('data-bicanh-focus') === 'true') throw new Error('màn cũ không được giữ dấu focus');
  console.log('Bicanh focus picks latest post-anchor battle passed');
}

async function testBicanhFocusSkipsOtherPlayerAndNonSkillScreens() {
  const { old1, cmd1, batA, skill } = focusBattleArticles();
  const other = focusArticle('other', 'Bí Cảnh — Tầng 6/600', 'Bí Cảnh — Tầng 6/600 người khác', [focusButton(skill)]);
  const noSkill = focusArticle('noskill', 'Bí Cảnh — Tầng 6/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 6/600`, [focusButton('Tiếp Tục')]);
  const sandbox = focusSandbox([old1, cmd1, noSkill, batA, other]);
  const bot = focusBot([old1, cmd1, batA, other, noSkill], sandbox);
  const focused = await bot.bicanhFocusBattle();
  if (focused !== 'batA') throw new Error('focus phải bỏ qua màn người khác và màn không có nút skill, thực tế: ' + focused);
  console.log('Bicanh focus skips other-player and non-skill screens passed');
}

async function testBicanhFocusReturnsNullBeforeAnchorAndWithoutUserId() {
  const { old1, cmd1 } = focusBattleArticles();
  const sandbox = focusSandbox([old1, cmd1]);
  const bot = focusBot([old1, cmd1], sandbox);
  if ((await bot.bicanhFocusBattle()) !== null) throw new Error('chưa có màn battle sau !bicanh thì focus phải null');
  let execCalls = 0;
  const noIdBot = new NpcBot({ executeJavaScript: () => { execCalls++; return 0; } }, 1);
  noIdBot.userId = '';
  if ((await noIdBot.bicanhFocusBattle()) !== null) throw new Error('không có User ID thì focus phải null');
  if (execCalls !== 0) throw new Error('không có User ID thì không được quét DOM tìm focus');
  console.log('Bicanh focus returns null before anchor and without userId passed');
}

async function testBicanhClickPrefersFocusedArticle() {
  const { cmd1, batA, batB, skill } = focusBattleArticles();
  const sandbox = focusSandbox([cmd1, batA, batB]);
  const bot = focusBot([cmd1, batA, batB], sandbox);
  bot._bicanhMsgBaseline = 0;
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  const result = await bot.clickNextBicanhSkill(skill);
  if (!result || !result.clicked) throw new Error('clickNext phải bấm được skill, thực tế: ' + JSON.stringify(result));
  if (!batB._buttons[0].clicked) throw new Error('click phải rơi vào nút skill ở màn focus mới nhất (batB)');
  if (batA._buttons[0].clicked) throw new Error('click không được rơi vào màn battle cũ (batA)');
  if (!logs.some((line) => line.includes('focus màn battle mới'))) throw new Error('đổi focus phải log 1 dòng, log thực tế: ' + JSON.stringify(logs));
  console.log('Bicanh click prefers focused article passed');
}

async function testBicanhClickWaitsWhenNewestBattleButtonDisabled() {
  // v91 — nút màn battle mới nhất bị khóa thì CHỜ (trả null), không được
  // rơi xuống bấm màn cũ: bấm màn cũ game không tính, trận mới hết giờ.
  const { cmd1, batA, batB, skill } = focusBattleArticles();
  batB._buttons[0].disabled = true;
  const sandbox = focusSandbox([cmd1, batA, batB]);
  sandbox.window.botBicanhFocusMsgId = 'batB';
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.userId = '';
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  const result = await bot.clickNextBicanhSkill(skill);
  if (result && result.clicked) throw new Error('màn mới nhất bị khóa nút thì click phải null (chờ), thực tế: ' + JSON.stringify(result));
  if (batA._buttons[0].clicked) throw new Error('không được rơi xuống bấm nút skill ở màn cũ (batA)');
  console.log('Bicanh click waits when newest battle button disabled passed');
}

// 17. v91 — màn mới chưa render nút thì focus null, không rơi xuống màn cũ.
async function testBicanhFocusIgnoresOldBattleWhenNewNotReady() {
  const { skill } = focusBattleArticles();
  const cmd = focusArticle('cmd', '!bicanh', `avatars/${BICANH_FOCUS_UID}/abc.png !bicanh`, []);
  const oldBattle = focusArticle('oldBattle', 'Bí Cảnh — Tầng 541/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 541/600`, [focusButton(skill)]);
  const newBattle = focusArticle('newBattle', 'Bí Cảnh — Tầng 542/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 542/600`, []);
  const sandbox = focusSandbox([cmd, oldBattle, newBattle]);
  const bot = focusBot([cmd, oldBattle, newBattle], sandbox);
  bot._bicanhMsgBaseline = 0;
  const focused = await bot.bicanhFocusBattle();
  if (focused !== null) throw new Error('màn mới chưa render nút thì focus phải null, không được rơi xuống màn cũ, thực tế: ' + focused);
  if (sandbox.window.botBicanhFocusMsgId) throw new Error('focus phải được xóa, không giữ id màn cũ, thực tế: ' + sandbox.window.botBicanhFocusMsgId);
  if (oldBattle.getAttribute('data-bicanh-focus') === 'true') throw new Error('màn cũ không được giữ dấu focus');
  console.log('Bicanh focus ignores old battle when new not ready passed');
}

// 18. v91 — click chỉ bấm trong màn mới nhất: màn mới chưa có nút thì
// không bấm màn cũ; màn mới có nút thì bấm đúng màn mới.
async function testBicanhClickOnlyNewestBattle() {
  const { skill } = focusBattleArticles();
  const cmd = focusArticle('cmd', '!bicanh', `avatars/${BICANH_FOCUS_UID}/abc.png !bicanh`, []);
  const oldBattle = focusArticle('oldBattle', 'Bí Cảnh — Tầng 541/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 541/600`, [focusButton(skill)]);
  const newBattle = focusArticle('newBattle', 'Bí Cảnh — Tầng 542/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 542/600`, []);
  const sandbox = focusSandbox([cmd, oldBattle, newBattle]);
  const bot = focusBot([cmd, oldBattle, newBattle], sandbox);
  bot._bicanhMsgBaseline = 0;
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  bot.delay = async () => {};
  const result = await bot.clickNextBicanhSkill(skill);
  if (result && result.clicked) throw new Error('màn mới chưa có nút thì click phải null, thực tế: ' + JSON.stringify(result));
  if (oldBattle._buttons[0].clicked) throw new Error('không được bấm nút skill ở màn cũ (tầng 541)');
  // Màn mới render nút xong thì bấm đúng màn mới.
  const newBtn = focusButton(skill);
  newBattle._buttons.push(newBtn);
  const result2 = await bot.clickNextBicanhSkill(skill);
  if (!result2 || !result2.clicked) throw new Error('màn mới có nút thì phải bấm được, thực tế: ' + JSON.stringify(result2));
  if (!newBtn.clicked) throw new Error('click phải rơi vào nút skill ở màn mới (tầng 542)');
  if (oldBattle._buttons[0].clicked) throw new Error('click không được rơi vào màn cũ (tầng 541)');
  console.log('Bicanh click only newest battle passed');
}


// 19. v94 — màn battle mới KHÔNG có chữ "Tầng N/600" nhưng có nút skill
// thì focus vẫn phải chuyển sang màn mới (timeout tầng 571: v91 chỉ khớp
// chữ tầng nên màn mới vô hình, bot cứ bấm màn cũ).
async function testBicanhFocusFollowsNewestBattleBySkillButtons() {
  const { skill } = focusBattleArticles();
  const cmd = focusArticle('cmd', '!bicanh', `avatars/${BICANH_FOCUS_UID}/abc.png !bicanh`, []);
  const oldBattle = focusArticle('oldBattle', 'Bí Cảnh — Tầng 570/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 570/600`, [focusButton(skill)]);
  const newBattle = focusArticle('newBattle', 'Bí Cảnh Vực Sâu', `<@!${BICANH_FOCUS_UID}> Bí Cảnh Vực Sâu`, [focusButton(skill)]);
  const sandbox = focusSandbox([cmd, oldBattle, newBattle]);
  const bot = focusBot([cmd, oldBattle, newBattle], sandbox);
  bot._bicanhMsgBaseline = 0;
  const focused = await bot.bicanhFocusBattle();
  if (focused !== 'newBattle') throw new Error('màn mới có nút skill thì focus phải chuyển sang màn mới dù không có chữ tầng, thực tế: ' + focused);
  if (oldBattle.getAttribute('data-bicanh-focus') === 'true') throw new Error('màn cũ không được giữ dấu focus');
  console.log('Bicanh focus follows newest battle by skill buttons passed');
}

// 20. v94 — click phải bấm trong màn battle mới (không chữ tầng, có nút
// skill), không bấm màn cũ.
async function testBicanhClickFollowsNewestBattleBySkillButtons() {
  const { skill } = focusBattleArticles();
  const cmd = focusArticle('cmd', '!bicanh', `avatars/${BICANH_FOCUS_UID}/abc.png !bicanh`, []);
  const oldBattle = focusArticle('oldBattle', 'Bí Cảnh — Tầng 570/600', `<@!${BICANH_FOCUS_UID}> Bí Cảnh — Tầng 570/600`, [focusButton(skill)]);
  const newBattle = focusArticle('newBattle', 'Bí Cảnh Vực Sâu', `<@!${BICANH_FOCUS_UID}> Bí Cảnh Vực Sâu`, [focusButton(skill)]);
  const sandbox = focusSandbox([cmd, oldBattle, newBattle]);
  const bot = focusBot([cmd, oldBattle, newBattle], sandbox);
  bot._bicanhMsgBaseline = 0;
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  bot.delay = async () => {};
  const result = await bot.clickNextBicanhSkill(skill);
  if (!result || !result.clicked) throw new Error('màn mới có nút skill thì phải bấm được, thực tế: ' + JSON.stringify(result));
  if (!newBattle._buttons[0].clicked) throw new Error('click phải rơi vào nút skill ở màn mới (không chữ tầng)');
  if (oldBattle._buttons[0].clicked) throw new Error('click không được rơi vào màn cũ (tầng 570)');
  console.log('Bicanh click follows newest battle by skill buttons passed');
}

// 21. v94 — fallback khi không có User ID: màn mới không chữ tầng nhưng
// có nút skill thì vẫn bấm màn mới, không bấm màn cũ.
async function testBicanhClickFallbackFollowsNewestBattleBySkillButtons() {
  const { skill } = focusBattleArticles();
  const oldBattle = focusArticle('oldBattle', 'Bí Cảnh — Tầng 570/600', 'Bí Cảnh — Tầng 570/600', [focusButton(skill)]);
  const newBattle = focusArticle('newBattle', 'Bí Cảnh Vực Sâu', 'Bí Cảnh Vực Sâu', [focusButton(skill)]);
  const sandbox = focusSandbox([oldBattle, newBattle]);
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.userId = '';
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  bot.delay = async () => {};
  const result = await bot.clickNextBicanhSkill(skill);
  if (!result || !result.clicked) throw new Error('fallback phải bấm được skill ở màn mới, thực tế: ' + JSON.stringify(result));
  if (!newBattle._buttons[0].clicked) throw new Error('fallback phải bấm nút ở màn mới (không chữ tầng)');
  if (oldBattle._buttons[0].clicked) throw new Error('fallback không được bấm nút ở màn cũ (tầng 570)');
  console.log('Bicanh click fallback follows newest battle by skill buttons passed');
}

async function testBicanhClickRetriesWhenButtonNotReady() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.userId = '';
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  let execCalls = 0;
  bot.exec = async () => {
    execCalls += 1;
    return execCalls === 1 ? null : 'Lôi Đình Vạn Quân';
  };
  let delayCalls = 0;
  bot.delay = async () => { delayCalls += 1; };
  const result = await bot.clickNextBicanhSkill('Lôi Đình Vạn Quân');
  if (!result || result.clicked !== 'Lôi Đình Vạn Quân') throw new Error('lần bấm 2 phải bấm được skill, thực tế: ' + JSON.stringify(result));
  if (execCalls !== 2) throw new Error('phải quét lại đúng 1 lần sau lần trượt đầu, thực tế quét ' + execCalls + ' lần');
  if (delayCalls !== 1) throw new Error('giữa 2 lần quét phải chờ 1 lần, thực tế chờ ' + delayCalls + ' lần');
  console.log('Bicanh click retries when button not ready passed');
}

async function testBicanhClickGivesUpAfterThreeAttempts() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.userId = '';
  bot.username = '';
  bot.peekBicanhEphemeralDetail = async () => null;
  bot.dismissEphemeralMessages = async () => {};
  let execCalls = 0;
  bot.exec = async () => { execCalls += 1; return null; };
  let delayCalls = 0;
  bot.delay = async () => { delayCalls += 1; };
  const result = await bot.clickNextBicanhSkill('Lôi Đình Vạn Quân');
  if (!result || result.clicked !== null) throw new Error('3 lần đều trượt thì phải trả clicked null, thực tế: ' + JSON.stringify(result));
  if (execCalls !== 3) throw new Error('phải quét đúng 3 lần rồi mới bỏ, thực tế quét ' + execCalls + ' lần');
  if (delayCalls !== 2) throw new Error('giữa 3 lần quét phải chờ đúng 2 lần, thực tế chờ ' + delayCalls + ' lần');
  console.log('Bicanh click gives up after three attempts passed');
}

async function testBicanhUserIdConfig() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  if (bot.userId !== '') throw new Error('userId mặc định phải rỗng');
  bot.updateConfig({ userId: BICANH_FOCUS_UID });
  if (bot.userId !== BICANH_FOCUS_UID) throw new Error('updateConfig phải nhận userId');
  console.log('Bicanh userId config passed');
}

testBicanhWaitTurnRetriesPreviousSkill()
  .then(testBicanhInteractionFailedRetriesPreviousSkill)
  .then(testPeekBicanhEphemeralKind)
  .then(testPeekBicanhEphemeralDetail)
  .then(testPeekInteractionFailed)
  .then(testBicanhCooldownSkip)
  .then(testDismissMarksParentArticle)
  .then(testBicanhSkipCurrentCooldown)
  .then(testClickNextSkipsKnownCooldownSkill)
  .then(testPeekWrongPerson)
  .then(testBicanhWrongPersonRetriesPreviousSkill)
  .then(testClickNextWrongPersonDoesNotClick)
  .then(testBicanhDuplicateWaitTurnDoesNotStepBackTwice)
  .then(testBicanhNotFoundDoesNotTickCooldown)
  .then(testBicanhDoesNotReclickJustUsedSkillAfterSkips)
  .then(testBicanhFocusPicksLatestPostAnchorBattle)
  .then(testBicanhFocusSkipsOtherPlayerAndNonSkillScreens)
  .then(testBicanhFocusReturnsNullBeforeAnchorAndWithoutUserId)
  .then(testBicanhClickPrefersFocusedArticle)
  .then(testBicanhClickWaitsWhenNewestBattleButtonDisabled)
  .then(testBicanhFocusIgnoresOldBattleWhenNewNotReady)
  .then(testBicanhClickOnlyNewestBattle)
  .then(testBicanhFocusFollowsNewestBattleBySkillButtons)
  .then(testBicanhClickFollowsNewestBattleBySkillButtons)
  .then(testBicanhClickFallbackFollowsNewestBattleBySkillButtons)
  .then(testBicanhClickRetriesWhenButtonNotReady)
  .then(testBicanhClickGivesUpAfterThreeAttempts)
  .then(testBicanhUserIdConfig)
  .then(testBicanhWaitProbesSameSkillAfterThreeWaits)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

// 27. v92 — nhánh chờ probe sau đúng 3 vòng: skill đã biết đang hồi 3
// turn, không có click nào khác ở giữa, thì bot phải chờ 3 vòng rồi bấm
// THỬ đúng skill đó (không nhảy sang skill khác), và các dòng chờ phải
// ghi cùng một số "còn 3 lượt" (map KHÔNG trừ trong lúc chờ — v85 thì
// các dòng chờ giảm dần 3->2->1 vì thời gian trôi, và không có dòng probe).
async function testBicanhWaitProbesSameSkillAfterThreeWaits() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.bicanhSkillOrder = [29, 26, 23];
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.waitForBicanhButton = async () => 'battle';
  bot.checkBicanhCooldown = async () => 0;

  const s29 = bot.luanhoiSkillNames[28];
  const s26 = bot.luanhoiSkillNames[25];
  const s23 = bot.luanhoiSkillNames[22];
  const seen = [];
  const counts = {};
  bot.clickNextBicanhSkill = async (skillName) => {
    seen.push(skillName);
    counts[skillName] = (counts[skillName] || 0) + 1;
    // Lần đầu tới s29: đã biết s29 đang hồi 3 turn, không được bấm nó.
    if (skillName === s29 && counts[s29] === 1) {
      return { clicked: null, waitTurn: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 3 }, skipCurrent: true };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // Chỉ bấm thử đúng s29 (lần skipCurrent + lần probe), không qua s26/s23.
  const expected = [s29, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh probe phải bấm thử đúng skill đang chờ, không nhảy skill khác, thực tế: ' + JSON.stringify(seen));
  }
  // Mọi dòng chờ cho s29 phải ghi cùng "còn 3 lượt" (map không trừ khi chờ).
  // Chỉ tính dòng chờ ở nhánh chờ ("lượt — chờ rồi bấm lại"), không tính
  // dòng skipCurrent ("3 turn — đã biết trước khi bấm") ở trên.
  const waitLines = logs.filter((line) => line.includes('lượt — chờ rồi bấm lại') && line.includes(s29));
  if (waitLines.length < 2) {
    throw new Error('Bicanh probe phải chờ ít nhất 2 vòng trước khi bấm thử, log thực tế: ' + JSON.stringify(logs));
  }
  if (waitLines.some((line) => !line.includes('còn 3 lượt'))) {
    throw new Error('Bicanh chờ không được trừ map: mọi dòng chờ s29 phải ghi "còn 3 lượt", log thực tế: ' + JSON.stringify(logs));
  }
  if (!logs.some((line) => line.includes('đã chờ 3 vòng') && line.includes(s29) && line.includes('bấm thử'))) {
    throw new Error('Bicanh phải probe s29 sau 3 vòng chờ, log thực tế: ' + JSON.stringify(logs));
  }
  console.log('Bicanh wait probes same skill after three waits passed');
}
