const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));
const bot = new NpcBot({ executeJavaScript() {} }, 1);

const cases = [
  ['\u{1F4B0} T\u00edch l\u0169y: 352724 \u{1F48E} \u0110\u00e1: SC:5 TC:11 CC:28 \u{1F9E9} M\u1ea3nh set: 1 lo\u1ea1i', 1],
  ['M\u1ea3nh set: 0 lo\u1ea1i', 0],
  ['M\u1ea3nh set: 3 lo\u1ea1i', 3],
  ['Kh\u00f4ng c\u00f3 d\u00f2ng m\u1ea3nh', null],
  ['', null],
  [null, null],
];

for (const [input, expected] of cases) {
  const got = bot.parseLuanhoiManhSet(input);
  if (got !== expected) {
    throw new Error(`parseLuanhoiManhSet(${JSON.stringify(input)}) = ${got}, expected ${expected}`);
  }
}

console.log('M\u1ea3nh set parse passed');

// Checkbox "Đi tiếp khi chưa thấy Mảnh" (nhánh fix/luanhoi-stats, anh chốt 2026-11-06):
// bật (mặc định) thì tới Target mà Mảnh set: 0 loại vẫn leo tiếp; tắt thì dừng luôn.
if (bot.luanhoiContinueNoShard !== true) {
  throw new Error(`luanhoiContinueNoShard default = ${bot.luanhoiContinueNoShard}, expected true`);
}
if (bot.luanhoiShouldContinueNoShard(0) !== true) {
  throw new Error('luanhoiShouldContinueNoShard(0) with flag on = false, expected true');
}
if (bot.luanhoiShouldContinueNoShard(1) !== false) {
  throw new Error('luanhoiShouldContinueNoShard(1) = true, expected false');
}
if (bot.luanhoiShouldContinueNoShard(null) !== false) {
  throw new Error('luanhoiShouldContinueNoShard(null) = true, expected false');
}
bot.luanhoiContinueNoShard = false;
if (bot.luanhoiShouldContinueNoShard(0) !== false) {
  throw new Error('luanhoiShouldContinueNoShard(0) with flag off = true, expected false');
}
bot.luanhoiContinueNoShard = undefined;
if (bot.luanhoiShouldContinueNoShard(0) !== true) {
  throw new Error('luanhoiShouldContinueNoShard(0) with flag undefined = false, expected true (config cũ không đổi hành vi)');
}
bot.updateConfig({ luanhoiContinueNoShard: false });
if (bot.luanhoiContinueNoShard !== false) {
  throw new Error('updateConfig({ luanhoiContinueNoShard: false }) did not store false');
}
bot.updateConfig({ luanhoiContinueNoShard: true });
if (bot.luanhoiContinueNoShard !== true) {
  throw new Error('updateConfig({ luanhoiContinueNoShard: true }) did not store true');
}

console.log('Mảnh set continue-no-shard passed');
