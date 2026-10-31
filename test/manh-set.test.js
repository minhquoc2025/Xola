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
