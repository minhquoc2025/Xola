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

// 4. Loop Bicanh: skill bị báo hồi 2 turn thì phải bỏ qua cho tới khi đủ
// 2 lượt chấp nhận, thay vì bấm lại ngay vòng sau và lại bị báo hồi.
async function testBicanhCooldownSkip() {
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
    if (skillName === s26 && counts[s26] === 1) {
      // Trước lần click s26 này, s29 vừa bị báo hồi 2 turn.
      return { clicked: skillName, waitTurn: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 2 } };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, cooldownDetail: null };
  };

  await bot.bicanhLoop(1);

  // s29 bị bỏ qua 1 lần giữa s23 và s26, chỉ click lại sau khi s23 + s26
  // đều được chấp nhận (2 lượt), chứ không phải ngay vòng sau s23.
  const expected = [s29, s26, s23, s26, s23, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh cooldown phải bỏ qua skill chưa hồi, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('Bỏ qua') && line.includes(s29))) {
    throw new Error('Bicanh cooldown phải log rõ skill bị bỏ qua, log thực tế: ' + JSON.stringify(logs));
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
// sắp bấm) thì loop phải tiến tới skill khác ngay, không bấm skill đó, và
// không bấm lại nó cho tới khi đủ lượt chấp nhận.
async function testBicanhSkipCurrentCooldown() {
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
    // Lần đầu tới s29: đã biết s29 đang hồi 2 turn, không được bấm nó.
    if (skillName === s29 && counts[s29] === 1) {
      return { clicked: null, waitTurn: false, cooldownDetail: { kind: 'cooldown', skill: s29, turns: 2 }, skipCurrent: true };
    }
    if (skillName === s29 && counts[s29] === 2) bot.isRunning = false;
    return { clicked: skillName, waitTurn: false, cooldownDetail: null, skipCurrent: false };
  };

  await bot.bicanhLoop(1);

  // s29 bị bỏ qua ở lần đầu (ghi hồi 2 turn), sau đó s26 + s23 qua lượt
  // thì s29 vẫn bị bỏ qua 1 lần nữa vì lượt của s23 chỉ được trừ ở lượt
  // bấm tiếp theo, sau bước kiểm tra map — đây là thận trọng có chủ ý:
  // thà bỏ qua thêm 1 vòng còn hơn bấm lại khi vẫn đang hồi. Sau s26 +
  // s23 của vòng sau thì s29 mới được bấm lại.
  const expected = [s29, s26, s23, s26, s23, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh skipCurrent phải tiến skill khác ngay, thực tế: ' + JSON.stringify(seen));
  }
  if (!logs.some((line) => line.includes('Bỏ qua') && line.includes(s29) && line.includes('đã biết trước khi bấm'))) {
    throw new Error('Bicanh skipCurrent phải log rõ là đã biết trước khi bấm, log thực tế: ' + JSON.stringify(logs));
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

// 12. Lượt không bấm không được trừ cooldown: s29 hồi 2 turn, s23 bị
// "không tìm thấy" 2 lần liên tiếp thì s29 chỉ được trừ 1 lần (cho lượt
// s26 đã bấm trước đó), không phải trừ mỗi lần không tìm thấy, nếu không
// s29 sẽ về 0 sớm và bị bấm lại khi vẫn đang hồi.
async function testBicanhNotFoundDoesNotDecrementCooldown() {
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

  // s29 (lần 1) -> s26 (ghi s29=2) -> s23 không tìm thấy x2 -> s23 bấm được
  // -> s29 bị bỏ qua 1 lần (còn 1, chưa về 0) -> s26 -> s23 -> s29 bấm lại.
  const expected = [s29, s26, s23, s23, s23, s26, s23, s29];
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    throw new Error('Bicanh not-found không được trừ cooldown mỗi lần, thực tế: ' + JSON.stringify(seen));
  }
  console.log('Bicanh not-found does not decrement cooldown passed');
}

testBicanhWaitTurnRetriesPreviousSkill()
  .then(testPeekBicanhEphemeralKind)
  .then(testPeekBicanhEphemeralDetail)
  .then(testBicanhCooldownSkip)
  .then(testDismissMarksParentArticle)
  .then(testBicanhSkipCurrentCooldown)
  .then(testClickNextSkipsKnownCooldownSkill)
  .then(testPeekWrongPerson)
  .then(testBicanhWrongPersonRetriesPreviousSkill)
  .then(testClickNextWrongPersonDoesNotClick)
  .then(testBicanhDuplicateWaitTurnDoesNotStepBackTwice)
  .then(testBicanhNotFoundDoesNotDecrementCooldown)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
