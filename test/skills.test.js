const fs = require('fs');
const path = require('path');

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

if (bot.isOwnedGameMessage('Nam: Hiep, xem trận battle NPC này của tôi', 'Hiep', ['npc', 'battle', 'fight', 'đánh'])) {
  throw new Error('Bot incorrectly treated a mention as the current user battle message');
}

if (!bot.isOwnedGameMessage('Hiep đã đánh NPC rồi, còn 3 giây nữa', 'Hiep', ['npc', 'battle', 'fight', 'đánh'])) {
  throw new Error('Bot failed to recognize the current user battle message');
}

if (!mainContent.includes('matchesUserMessage') && !mainContent.includes('isOwnedGameMessage')) {
  throw new Error('Missing user-aware message filter helper');
}

console.log('Skill list check passed');
console.log('NPC message matching guard passed');
