// Vân Du v1 — pure-logic checks, no Discord needed.
const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

const bot = new NpcBot({ executeJavaScript() {} }, 1);
bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test' });
eq(bot.mode, 'vandu', 'mode');
eq(bot.vanduCmd, '!vandu', 'vanduCmd');
eq(bot.vanduSkillOrder, ['Phá Giáp', 'Băng Phong', 'Hư Không Đại Na Di', 'Kim Đan Phá Sát', 'Băng Phong', 'Vạn Kiếm Quy Tông'], 'skill order');

// Circuit next element
eq(bot.vanduNextElement('sinh', 'Mộc'), 'Hỏa', 'sinh Mộc->Hỏa');
eq(bot.vanduNextElement('sinh', 'Thủy'), null, 'sinh ends at Thủy');
eq(bot.vanduNextElement('khac', 'Thổ'), 'Thủy', 'khac Thổ->Thủy');
eq(bot.vanduNextElement('khac', 'Kim'), 'Mộc', 'khac Kim->Mộc');

// Door element: game writes Thương Môn as Thượng Môn, both must map to Mộc.
eq(bot.vanduElementOfDoor('Thượng Môn'), 'Mộc', 'Thượng = Mộc');
eq(bot.vanduElementOfDoor('Thương Môn'), 'Mộc', 'Thương = Mộc');
eq(bot.vanduElementOfDoor('Cảnh Môn'), 'Hỏa', 'Cảnh = Hỏa');
eq(bot.vanduElementOfDoor('Tử Môn'), 'Thổ', 'Tử = Thổ');

// Door choice
eq(bot.vanduChooseDoor(['Thượng Môn', 'Cảnh Môn', 'Kinh Môn'], { type: 'sinh', last: 'Mộc' }), 'Cảnh Môn', 'sinh after Mộc picks Cảnh');
eq(bot.vanduChooseDoor(['Thượng Môn', 'Tử Môn', 'Hưu Môn'], { type: 'khac', last: 'Thổ' }), 'Hưu Môn', 'khac after Thổ picks Hưu');
eq(bot.vanduChooseDoor(['Tử Môn', 'Kinh Môn', 'Đỗ Môn'], null), 'Kinh Môn', 'no circuit: no Thương/Cảnh, not Tử');
eq(bot.vanduChooseDoor(['Tử Môn', 'Thượng Môn', 'Kinh Môn'], null), 'Thượng Môn', 'no circuit: Thương first');
eq(bot.vanduChooseDoor(['Tử Môn'], null), null, 'no circuit: only Tử -> no pick');

// Circuit parsing
eq(bot.vanduParseCircuit('Mạch Tương Sinh: [Mộc] → [Hỏa] → [?] → [?]'), { type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa' }, 'parse sinh progress');
eq(bot.vanduParseCircuit('Mạch Tương Khắc, định vị khởi đầu tại hành Thổ'), { type: 'khac', elements: ['Thổ'], last: 'Thổ' }, 'parse khac start');

// Buff choice: domain first, then gold, then reroll, then duplicate.
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, true).action, 'pick', 'domain candidate picked');
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, true).buttonText, '[Thuật] Thái Ất [Thuật Tông - Lam]', 'domain candidate is Thuật');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]', '[Khí] B [Khí Tông - Vàng (Thần Thoại)]'], { Kiếm: 0, Khí: 0 }, {}, true).buttonText, '[Khí] B [Khí Tông - Vàng (Thần Thoại)]', 'gold picked');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, {}, true), { action: 'reroll' }, 'no domain/gold -> reroll');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, { A: true }, false).buttonText, '[Kiếm] A [Kiếm Tông - Lam]', 'no reroll left -> duplicate picked');

// Shop
eq(bot.vanduShopAction(3, false, false), 'bi-tich', 'shop: 3 dan -> Bi Tich');
eq(bot.vanduShopAction(3, false, true), 'roi-di', 'shop: after Bi Tich -> Roi di');
eq(bot.vanduShopAction(1, false, false), 'mua-cuu-chuyen', 'shop: buy');
eq(bot.vanduShopAction(1, true, false), 'roi-di', 'shop: already bought this visit -> Roi di');

// HP heuristic
eq(bot.vanduPlayerHpPct('Khí Huyết: 42%'), 42, 'hp parse');

console.log('Vân Du logic checks passed');
