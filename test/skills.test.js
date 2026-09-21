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
