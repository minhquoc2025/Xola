// V80: Luân Hồi nhớ cooldown như Bicanh (ảnh anh gửi 2026-11-13 10:11,
// tầng 308: Lôi Đình/Vạn Kiếm/Hư Không đều "đang hồi! Còn 1 turn",
// Vạn Kiếm "Còn 2 turn" — skill bấm loạn từ tầng 290).
// Nguyên nhân: luanhoiBattleTick dismiss tin ephemeral TRƯỚC khi ai đọc,
// rồi tăng idx cho mọi click kể cả click bị game từ chối (không tốn lượt
// game), nên vòng xoay lệch dần khỏi cooldown thật; trận tầng cao kéo dài
// nhiều lượt thì lệch tới mức toàn bấm skill đang hồi.
const path = require('path');
const vm = require('vm');

const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function eq(a, b, msg) { if (a !== b) throw new Error(msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function has(logs, needle, msg) { if (!logs.some((l) => l.includes(needle))) throw new Error(msg + ' (thieu log: ' + needle + ')'); }

// 1. Verdict: click bị báo hồi -> lùi idx, ghi map; click được chấp nhận
// -> ghi skill vừa dùng hồi 3 turn rồi trừ 1 cho mọi skill đang chờ.
async function testVerdict() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.log = () => {};
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.luanhoiSkillIdx = 5;
  bot.luanhoiCooldownLeft = new Map();

  const loi = 'Lôi Đình Vạn Quân';
  const kim = 'Kim Đan Phá Sát';
  const van = 'Vạn Kiếm Quy Tông';

  bot.luanhoiApplyClickVerdict({ kind: 'cooldown', skill: loi, turns: 2 }, loi);
  eq(bot.luanhoiSkillIdx, 4, 'click bi bao hoi phai lui idx');
  eq(bot.luanhoiCooldownLeft.get(bot.luanhoiNormSkill(loi)), 2, 'phai ghi map Loi=2');

  bot.luanhoiApplyClickVerdict(null, kim);
  eq(bot.luanhoiCooldownLeft.get(bot.luanhoiNormSkill(loi)), 1, 'click chap nhan phai tru map Loi 2->1');
  eq(bot.luanhoiCooldownLeft.get(bot.luanhoiNormSkill(kim)), 2, 'skill vua dung phai ghi 3 roi tru con 2');

  bot.luanhoiApplyClickVerdict({ kind: 'wait-turn', skill: null, turns: null }, van);
  eq(bot.luanhoiSkillIdx, 3, 'doi luot phai lui idx');
  has(logs, 'đợi lượt', 'phai log doi luot');
  console.log('Luanhoi verdict passed');
}

// 2. Tick thật (fake DOM): skill trong map phải bị bỏ qua, tick bấm skill
// sẵn sàng tiếp theo trong vòng xoay; cả 2 skill đều hồi -> wait-cooldown.
function tickButton(text) {
  const btn = { textContent: text, disabled: false, clicked: false, click() { btn.clicked = true; } };
  return btn;
}
function tickArticle(buttons) {
  return {
    id: 'bat-1',
    textContent: 'Luân Hồi Tháp — Tầng 308 Hòa — Chọn 1 cổng!',
    innerHTML: 'Hoa',
    getAttribute: (name) => (name === 'data-luanhoi-owned' ? 'true' : null),
    setAttribute: () => {},
    querySelectorAll: (sel) => (String(sel).includes('button') ? buttons : []),
  };
}
function makeTickBot(buttons, cooldownMap) {
  const article = tickArticle(buttons);
  const sandbox = {
    window: {},
    document: { querySelectorAll: (sel) => (String(sel).includes('article') ? [article] : []) },
    BigInt,
  };
  const bot = new NpcBot({
    executeJavaScript: (script) => vm.runInNewContext(script, sandbox),
  }, 1);
  bot.username = '';
  bot.userId = '';
  bot.log = () => {};
  bot.markLuanhoiMessages = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  bot.luanhoiCooldownLeft = cooldownMap;
  return { bot, article };
}

async function testTickSkipsCoolingSkill() {
  const loiBtn = tickButton('Lôi Đình Vạn Quân');
  const kimBtn = tickButton('Kim Đan Phá Sát');
  const map = new Map();
  const { bot } = makeTickBot([loiBtn, kimBtn], map);
  map.set(bot.luanhoiNormSkill('Lôi Đình Vạn Quân'), 2);
  // idx = vi tri Loi Dinh (31) de vong xoay bat dau dung o skill dang hoi.
  bot.luanhoiSkillIdx = 31;
  const tick = await bot.luanhoiBattleTick();
  eq(tick && tick.type, 'skill', 'tick phai bam duoc skill');
  eq(tick && tick.text, 'Kim Đan Phá Sát', 'tick phai bo qua Loi Dinh dang hoi va bam Kim Dan');
  eq(kimBtn.clicked, true, 'nut Kim Dan phai duoc click');
  eq(loiBtn.clicked, false, 'nut Loi Dinh dang hoi khong duoc click');
  console.log('Luanhoi tick skips cooling skill passed');
}

async function testTickWaitCooldownWhenAllCooling() {
  const loiBtn = tickButton('Lôi Đình Vạn Quân');
  const kimBtn = tickButton('Kim Đan Phá Sát');
  const map = new Map();
  const { bot } = makeTickBot([loiBtn, kimBtn], map);
  map.set(bot.luanhoiNormSkill('Lôi Đình Vạn Quân'), 2);
  map.set(bot.luanhoiNormSkill('Kim Đan Phá Sát'), 1);
  bot.luanhoiSkillIdx = 31;
  const tick = await bot.luanhoiBattleTick();
  eq(tick && tick.type, 'wait-cooldown', 'ca 2 skill deu hoi thi tick phai tra wait-cooldown');
  eq(loiBtn.clicked, false, 'khong duoc bam skill dang hoi');
  eq(kimBtn.clicked, false, 'khong duoc bam skill dang hoi');
  console.log('Luanhoi tick wait-cooldown passed');
}

// 3. Vòng luanhoiBattle (stub tick + peek): click Loi bi bao hoi 2 turn
// -> idx lui + map ghi; click Kim duoc chap nhan -> map tru; tick
// wait-cooldown -> cho 1 luot, map tru tiep; ket thuc win.
async function testBattleLoopVerdictAndWait() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.isRunning = true;
  bot.runId = 1;
  bot.log = () => {};
  const logs = [];
  bot.log = (...args) => logs.push(args.join(' '));
  bot.delay = async () => {};
  bot.luanhoiSkillIdx = 31;
  bot.luanhoiCooldownLeft = new Map();
  const loi = 'Lôi Đình Vạn Quân';
  const kim = 'Kim Đan Phá Sát';
  const normKim = bot.luanhoiNormSkill(kim);

  const ticks = [
    { type: 'skill', text: loi },
    { type: 'skill', text: kim },
    { type: 'wait-cooldown', skill: kim, skillNorm: normKim },
    { type: 'end', result: 'win', rewardText: 'Chiến thắng!' },
  ];
  let tickCalls = 0;
  bot.luanhoiBattleTick = async () => {
    const t = ticks[tickCalls++];
    if (t && t.type === 'skill') bot.luanhoiSkillIdx++;
    return t;
  };
  // Peek: sau click Loi thi bao hoi 2 turn; sau click Kim thi khong co tin.
  let peekCalls = 0;
  bot.peekBicanhEphemeralDetail = async () => {
    peekCalls++;
    if (peekCalls === 1) return { kind: 'cooldown', skill: loi, turns: 2 };
    return null;
  };

  const res = await bot.luanhoiBattle(false, 1);
  eq(res && res.ended, true, 'battle phai ket thuc win');
  eq(res && res.result, 'win', 'battle phai win');
  // idx: 31 +1 (Loi) -1 (lui) +1 (Kim) = 32.
  eq(bot.luanhoiSkillIdx, 32, 'idx phai 32 sau lui + tien');
  // Map: Loi=2 (sau click Kim chap nhan tru con 1, roi wait-cooldown khong
  // dung toi Loi); Kim: set 3 sau click Kim, tru con 2, wait-cooldown tru con 1.
  eq(bot.luanhoiCooldownLeft.get(bot.luanhoiNormSkill(loi)), 1, 'map Loi phai con 1');
  eq(bot.luanhoiCooldownLeft.get(normKim), 1, 'map Kim phai con 1 sau wait-cooldown');
  has(logs, 'đang hồi còn 2 turn', 'phai log Loi dang hoi 2 turn');
  has(logs, 'chờ 1 lượt rồi thử lại', 'phai log cho wait-cooldown');
  console.log('Luanhoi battle loop verdict and wait passed');
}

// 4. clickNextLuanhoiSkill: khong bam duoc thi idx khong doi; click bi
// bao hoi thi tra null va idx khong doi; click ngon thi idx +1.
async function testClickNextIdx() {
  const bot = new NpcBot({ executeJavaScript: () => 0 }, 1);
  bot.username = '';
  bot.userId = '';
  bot.log = () => {};
  bot.markLuanhoiMessages = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  bot.luanhoiSkillIdx = 10;
  // Khong tim thay nut nao.
  bot.exec = async () => null;
  bot.peekBicanhEphemeralDetail = async () => null;
  eq(await bot.clickNextLuanhoiSkill(), null, 'khong bam duoc thi tra null');
  eq(bot.luanhoiSkillIdx, 10, 'khong bam duoc thi idx khong doi');
  // Bam duoc nhung bi bao hoi.
  bot.exec = async () => 'Kim Đan Phá Sát';
  bot.peekBicanhEphemeralDetail = async () => ({ kind: 'cooldown', skill: 'Kim Đan Phá Sát', turns: 2 });
  eq(await bot.clickNextLuanhoiSkill(), null, 'click bi bao hoi thi tra null');
  eq(bot.luanhoiSkillIdx, 10, 'click bi bao hoi thi idx khong doi');
  // Bam duoc ngon.
  bot.peekBicanhEphemeralDetail = async () => null;
  eq(await bot.clickNextLuanhoiSkill(), 'Kim Đan Phá Sát', 'click ngon thi tra ten skill');
  eq(bot.luanhoiSkillIdx, 11, 'click ngon thi idx +1');
  console.log('Luanhoi clickNext idx passed');
}

testVerdict()
  .then(testTickSkipsCoolingSkill)
  .then(testTickWaitCooldownWhenAllCooling)
  .then(testBattleLoopVerdictAndWait)
  .then(testClickNextIdx)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
