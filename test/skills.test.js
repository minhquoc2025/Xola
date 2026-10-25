const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rendererPath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
const mainPath = path.join(__dirname, '..', 'src', 'main', 'npc-bot.js');
const rendererContent = fs.readFileSync(rendererPath, 'utf8');
const mainContent = fs.readFileSync(mainPath, 'utf8');

const expected = [
  'Cửu Chuyển Hồi Xuân',
  'Kim Đan Phá Sát',
  'Tam Muội Chân Hỏa',
];

for (const name of expected) {
  if (!rendererContent.includes(name)) {
    throw new Error(`Missing skill: ${name}`);
  }
}

const forbiddenPatterns = [
  'msg.textContent.includes(username)',
  '!msg.textContent.includes(username)',
  'if (username && !msg.textContent.includes(username)) continue;'
];

for (const pattern of forbiddenPatterns) {
  if (mainContent.includes(pattern)) {
    throw new Error(`Found unsafe message matcher: ${pattern}`);
  }
}

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));
const bot = new NpcBot({ executeJavaScript() {} }, 1);

if (bot.diangucBuffWaitMs !== 10000) {
  throw new Error('Địa Ngục buff wait should default to 10 seconds');
}

bot.updateConfig({ diangucBuffWaitMs: 0 });
if (bot.diangucBuffWaitMs !== 0) {
  throw new Error('Địa Ngục buff wait should allow immediate automatic selection');
}

if (bot.isOwnedGameMessage('Nam: Hiep, xem trận battle NPC này của tôi', 'Hiep', ['npc', 'battle', 'fight', 'đánh'])) {
  throw new Error('Bot incorrectly treated a mention as the current user battle message');
}

if (!bot.isOwnedGameMessage('Hiep đã đánh NPC rồi, còn 3 giây nữa', 'Hiep', ['npc', 'battle', 'fight', 'đánh'])) {
  throw new Error('Bot failed to recognize the current user battle message');
}

if (bot.isOwnedGameMessage('Nam: Hiep, xem trận bí cảnh của tôi', 'Hiep', ['bicanh', 'bi cảnh', 'bí cảnh', 'thap', 'tầng', 'đánh'])) {
  throw new Error('Bot incorrectly treated another player\'s Bicanh message as the current user battle');
}

if (!bot.isOwnedGameMessage('Hiep đã đánh bí cảnh và leo tầng 107', 'Hiep', ['bicanh', 'bi cảnh', 'bí cảnh', 'thap', 'tầng', 'đánh'])) {
  throw new Error('Bot failed to recognize the current user Bicanh battle message');
}

if (!mainContent.includes('matchesUserMessage') && !mainContent.includes('isOwnedGameMessage')) {
  throw new Error('Missing user-aware message filter helper');
}

bot.updateConfig({ bicanhSkillOrder: '1,2,3' });
if (!Array.isArray(bot.bicanhSkillOrder) || JSON.stringify(bot.bicanhSkillOrder) !== JSON.stringify([1, 2, 3])) {
  throw new Error('Bot failed to normalize bicanh combo skill order from CSV string to array');
}

console.log('Skill list check passed');
console.log('NPC message matching guard passed');
console.log('Combo skill normalization guard passed');

async function testNoResponseDeduplication() {
  const timeoutMessage = {
    id: 'battle-message-123',
    textContent: 'Khánh Linh đã không phản hồi kịp thời',
    getAttribute: () => null,
    querySelectorAll: () => [{ textContent: 'Kiếm Khí Xung Thiên' }],
  };
  const noResponseBot = new NpcBot({
    executeJavaScript: script => vm.runInNewContext(script, {
      document: { querySelectorAll: () => [timeoutMessage] },
    }),
  }, 1);
  const logs = [];
  let battleChecks = 0;
  noResponseBot.isRunning = true;
  noResponseBot.runId = 1;
  noResponseBot.bicanhSkillOrder = [1];
  noResponseBot.log = (...args) => logs.push(args.join(' '));
  noResponseBot.delay = async () => {};
  noResponseBot.checkBattleEnd = async () => {
    battleChecks++;
    return battleChecks === 4 ? { ended: true, result: 'win' } : null;
  };
  noResponseBot.clickNextNpcSkill = async () => 'Kiếm Khí Xung Thiên';
  noResponseBot.checkBicanhCooldown = async () => 0;

  const result = await noResponseBot.clickButtonsUntilEnd(false, 1);
  const warnings = logs.filter(line => line.includes('"Không phản hồi kịp thời" liên tiếp'));
  if (result.type !== 'ended' || warnings.length !== 1) {
    throw new Error('A persistent timeout message was counted more than once');
  }
  console.log('NPC timeout message deduplication passed');
}

async function testSellAllAfterRollX10() {
  const sent = [];
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.mode = 'upgrade';
  bot.spamType = 'roll_x10';
  bot.upgradeCmd = '/roll_x10';
  bot.spamCount = 3;
  bot.upgradeDelayMs = 100;
  bot.isRunning = true;
  bot.runId = 1;
  bot.log = () => {};
  bot.delay = async () => {};
  bot.sendSlashChat = async cmd => { sent.push(cmd); };

  await bot.upgradeLoop(1);

  const expected = [
    '/roll_x10',
    '/roll_x10',
    '/roll_x10',
    '/sellall star:🔵 1 Sao',
    '/sellall star:🟢 2 Sao',
    '/sellall star:🟡 3 Sao',
  ];
  if (JSON.stringify(sent) !== JSON.stringify(expected)) {
    throw new Error('Spam /roll_x10 phải dọn túi sau khi đạt target, thực tế: ' + JSON.stringify(sent));
  }
  console.log('Spam /roll_x10 sell-all cleanup passed');
}

async function testNoSellAllForOtherSpamTypes() {
  const sent = [];
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.mode = 'upgrade';
  bot.spamType = 'hp';
  bot.upgradeCmd = '/upgrade hp';
  bot.spamCount = 2;
  bot.upgradeDelayMs = 100;
  bot.isRunning = true;
  bot.runId = 1;
  bot.log = () => {};
  bot.delay = async () => {};
  bot.sendSlashChat = async cmd => { sent.push(cmd); };

  await bot.upgradeLoop(1);

  if (sent.some(cmd => cmd.startsWith('/sellall'))) {
    throw new Error('Chỉ spam /roll_x10 mới được dọn túi, thực tế: ' + JSON.stringify(sent));
  }
  console.log('Non-roll_x10 spam does not sell items passed');
}

async function testLuanhoiTowerFallIsLoss() {
  const resultMessage = {
    textContent: '💀 Ngã Xuống Luân Hồi Tháp! Nhận 10% thưởng tích lũy.',
    getAttribute: name => name === 'data-luanhoi-owned' ? 'true' : null,
    querySelectorAll: () => [],
  };
  const bot = new NpcBot({
    executeJavaScript: script => vm.runInNewContext(script, {
      document: { querySelectorAll: () => [resultMessage] },
      window: { luanhoiBuffTierClicked: 190 },
    }),
  }, 1);
  bot.markLuanhoiMessages = async () => {};
  bot.dismissEphemeralMessages = async () => {};

  const result = await bot.luanhoiBattleTick();
  if (!result || result.type !== 'end' || result.result !== 'loss') {
    throw new Error('Luân Hồi tower fall result was not recognized as a loss: ' + JSON.stringify(result));
  }
  console.log('Luân Hồi tower fall loss detection passed');
}

testNoResponseDeduplication()
  .then(testSellAllAfterRollX10)
  .then(testNoSellAllForOtherSpamTypes)
  .then(testLuanhoiTowerFallIsLoss)
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
