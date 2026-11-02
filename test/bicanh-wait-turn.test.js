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

testBicanhWaitTurnRetriesPreviousSkill()
  .then(testPeekBicanhEphemeralKind)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
