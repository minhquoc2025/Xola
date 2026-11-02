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

testBicanhWaitTurnRetriesPreviousSkill()
  .then(testPeekBicanhEphemeralKind)
  .then(testPeekBicanhEphemeralDetail)
  .then(testBicanhCooldownSkip)
  .then(testDismissMarksParentArticle)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
