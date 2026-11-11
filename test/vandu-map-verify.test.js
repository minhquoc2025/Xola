// Vân Du v56 — verify-after-pick: bot chỉ bấm Bắt Đầu khi game hiện đúng map đích.
// 2026-11-11, log anh gửi: 3 chuyến 07:33/07:39/07:46 đều log "đã chọn map
// Thiên Sơn Tuyết Lãnh" nhưng nhật ký game toàn Thanh Vân Trấn — cú bấm trả
// về tên nút (truthy) không có nghĩa là game đã đổi map. Test này lái
// vanduLoop bằng màn hình giả: exec luôn trả truthy khi bấm (giống click
// DOM thật), còn "sự thật của game" nằm ở màn scan trả về.
const path = require('path');
const vm = require('node:vm');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
function has(logs, sub, msg) {
  if (!logs.some((l) => l.includes(sub))) throw new Error(`${msg}: không thấy log chứa ${JSON.stringify(sub)} trong [${logs.join(' | ')}]`);
}
function lacks(logs, sub, msg) {
  if (logs.some((l) => l.includes(sub))) throw new Error(`${msg}: không được có log chứa ${JSON.stringify(sub)}`);
}

function startScreen(currentMap) {
  return {
    msgId: 'm-' + Math.random(),
    text: `Đại Vùng Đang Chọn: ${currentMap}\nBắt Đầu Xuất Phát`,
    buttons: ['Bắt Đầu Xuất Phát'],
  };
}
const tripEndScreen = { msgId: 'end', text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] };

async function runBot(screens, countResult, failTargeted) {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '', vanduRealm: 'Hóa Thần', vanduMap: 'Thiên Sơn Tuyết Lãnh' });
  const logs = [];
  bot.log = (m) => logs.push(String(m));
  bot.delay = async () => {};
  bot.sendChat = async () => {};
  bot.dismissEphemeralMessages = async () => {};
  const queue = [...screens];
  bot.vanduScanLatest = async () => {
    if (queue.length === 0) throw new Error('scan script exhausted');
    return queue.shift();
  };
  // exec stub: mọi cú bấm đều trả về tên nút (truthy), y như click DOM thật —
  // bot không được tin vào đó, chỉ tin màn scan trả về. Đồng thời ghi lại
  // hàm nào được gọi trước (V57: ExactText phải đi trước ClickButton;
  // V60: trigger/option phải đi trước ExactText).
  const calls = [];
  bot.exec = async (js) => {
    const s = String(js);
    if (s.includes('vanduCountMapOptions')) { calls.push({ fn: 'count', needle: 'thien son tuyet lanh' }); return countResult || '1/2'; }
    const needle = s.includes('thien son tuyet lanh') ? 'thien son tuyet lanh' : s.includes('thanh van tran') ? 'thanh van tran' : s.includes('bat dau xuat phat') ? 'bat dau xuat phat' : s.includes('tro ve giang ho') ? 'tro ve giang ho' : '';
    if (s.includes('vanduClickMapTrigger')) { calls.push({ fn: 'trigger', needle }); return failTargeted ? null : 'Thanh Vân Trấn'; }
    if (s.includes('vanduClickMapOption')) { calls.push({ fn: 'option', needle }); return failTargeted ? null : 'Thiên Sơn Tuyết Lãnh'; }
    if (s.includes("querySelectorAll('*')")) calls.push({ fn: 'exact', needle });
    else if (s.includes('[role="article"]')) calls.push({ fn: 'button', needle });
    else if (s.includes('[role="option"]')) calls.push({ fn: 'anywhere', needle });
    if (s.includes('thien son tuyet lanh')) return 'Thiên Sơn Tuyết Lãnh';
    if (s.includes('thanh van tran')) return 'Thanh Vân Trấn';
    if (s.includes('bat dau xuat phat')) return 'Bắt Đầu Xuất Phát';
    if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
    return '';
  };
  bot.isRunning = true;
  bot.runId = 1;
  await bot.vanduLoop(1);
  return { bot, logs, calls };
}

(async () => {
  // A (V59, log 09:41 chuyến 2 của anh): cú bấm lần 1 ĐÃ ăn nhưng game
  // sửa dòng "Đại Vùng Đang Chọn" chậm — màn quét ngay sau cú bấm vẫn đọc
  // Thanh Vân, edit chỉ về ở lần quét thứ 2 sau bấm. Bot phải chờ poll
  // (quét lại tối đa 3 lần) thay vì tính là bấm hụt.
  {
    const { bot, logs, calls } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thiên Sơn Tuyết Lãnh'),
      startScreen('Thiên Sơn Tuyết Lãnh'),
      tripEndScreen,
    ]);
    has(logs, 'chờ game xác nhận', 'A: phai log cho xac nhan sau cum bam');
    has(logs, 'map đang chọn đã là Thiên Sơn Tuyết Lãnh', 'A: phai xac nhan map truoc khi xuat phat');
    has(logs, 'Bắt Đầu Xuất Phát', 'A: phai bam Bat Dau sau khi xac nhan');
    const iVerified = logs.findIndex((l) => l.includes('map đang chọn đã là'));
    const iDepart = logs.findIndex((l) => l.includes('🚀 Vân Du: Bắt Đầu Xuất Phát'));
    eq(iVerified >= 0 && iDepart > iVerified, true, 'A: Bat Dau phai sau dong xac nhan map');
    eq(bot.vanduMapPickTries, 1, 'A: poll xac nhan ngay o lan bam 1, khong can bam lan 2');
    lacks(logs, 'đã chọn map Thiên Sơn Tuyết Lãnh theo cảnh giới', 'A: khong duoc log kieu cu (tin cum bam)');
    lacks(logs, 'quét lại vẫn thấy', 'A: poll da thay map dung, khong duoc log bam hut');
    eq(bot.isRunning, false, 'A: het chuyen thi dung');
    // V57: bấm map thử ExactText trước, và log chẩn đoán số option sau khi mở.
    // V60: mở list thử trigger [role=combobox] trước, bấm map thử option
    // [role=option] trước — bấm theo chữ có thể trúng span chữ trong tin
    // nhắn cũ (log 09:54).
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 1 chỗ, chứa tên 2 chỗ', 'A: phai log dem option');
    const firstTargetPick = calls.find((c) => c.needle === 'thien son tuyet lanh' && c.fn !== 'count');
    eq(firstTargetPick && firstTargetPick.fn, 'option', 'A: bam map dich thu option khoanh trong popout truoc (V60/V61)');
    const firstOpen = calls.find((c) => c.needle === 'thanh van tran');
    eq(firstOpen && firstOpen.fn, 'trigger', 'A: mo list thu trigger [role=combobox] truoc (V60)');
  }

  // A2 (V59): poll lần 1 quét 3 lần vẫn Thanh Vân (edit chưa về) -> bot
  // thử bấm lại lần 2, poll lần 2 thấy Thiên Sơn -> đi luôn, không dừng oan.
  {
    const { bot, logs } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thiên Sơn Tuyết Lãnh'),
      startScreen('Thiên Sơn Tuyết Lãnh'),
      tripEndScreen,
    ]);
    has(logs, 'quét lại vẫn thấy Thanh Vân Trấn, thử lại', 'A2: phai log thu lai sau poll lan 1 that bai');
    has(logs, 'map đang chọn đã là Thiên Sơn Tuyết Lãnh', 'A2: phai xac nhan map truoc khi xuat phat');
    has(logs, 'Bắt Đầu Xuất Phát', 'A2: phai bam Bat Dau sau khi xac nhan');
    eq(bot.vanduMapPickTries, 2, 'A2: bam 2 lan thi map moi an');
    eq(bot.isRunning, false, 'A2: het chuyen thi dung');
  }

  // B: bấm 3 lần, poll sau mỗi lần quét 3 lần vẫn Thanh Vân -> dừng,
  // KHÔNG bấm Bắt Đầu. Đây đúng là 3 chuyến 07:33/07:39/07:46 trong log
  // anh gửi — code cũ đi luôn Thanh Vân, code mới phải dừng lại.
  {
    const { bot, logs, calls } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
    ]);
    has(logs, 'đã thử chọn map Thiên Sơn Tuyết Lãnh 3 lần', 'B: phai log dung sau 3 lan thu');
    has(logs, 'quét lại vẫn thấy Thanh Vân Trấn, thử lại', 'B: phai log thu lai sau moi poll that bai');
    lacks(logs, '🚀 Vân Du: Bắt Đầu Xuất Phát', 'B: khong duoc xuat phat khi map chua dung');
    eq(bot.vanduMapPickTries, 3, 'B: dung 3 lan thu');
    eq(bot.vanduMapPicked, false, 'B: khong duoc danh dau da chon');
    eq(bot.isRunning, false, 'B: dung bot sau khi break');
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 1 chỗ', 'B: phai log dem option moi lan mo');
    const firstTargetPick = calls.find((c) => c.needle === 'thien son tuyet lanh' && c.fn !== 'count');
    eq(firstTargetPick && firstTargetPick.fn, 'option', 'B: bam map dich thu option khoanh trong popout truoc (V60/V61)');
  }

  // C (V57, log 08:32 của anh): mở list rồi mà tên map đích không có trong
  // DOM (0/0) -> dừng ngay sau lần 1, khỏi thử 3 lần vô ích.
  {
    const { bot, logs } = await runBot([startScreen('Thanh Vân Trấn')], '0/0');
    has(logs, 'sau khi mở list, tên Thiên Sơn Tuyết Lãnh khớp đúng 0 chỗ, chứa tên 0 chỗ', 'C: phai log dem option 0/0');
    has(logs, 'không thấy tên Thiên Sơn Tuyết Lãnh đâu', 'C: phai log dung vi khong thay option');
    lacks(logs, '🚀 Vân Du: Bắt Đầu Xuất Phát', 'C: khong duoc xuat phat');
    eq(bot.vanduMapPickTries, 1, 'C: dung ngay sau lan 1');
    eq(bot.vanduMapPicked, false, 'C: khong duoc danh dau da chon');
    eq(bot.isRunning, false, 'C: dung bot sau khi break');
  }

  // E (V60, log 09:54 của anh — trigger/option không ăn): mở list bằng
  // trigger không được, bấm theo chữ cũng không ăn (dropdown chưa mở,
  // option thật = 0 dù chữ trùng tới 14 chỗ) -> bot phải log cảnh báo
  // "không thấy option thật", thử mở lại bằng trigger, rồi vẫn dừng sau
  // 3 lần như cũ (không có điều kiện dừng mới nào, chỉ thêm chẩn đoán).
  {
    const { bot, logs } = await runBot([
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
      startScreen('Thanh Vân Trấn'),
    ], '14/7/0', true);
    has(logs, 'option thật 0 chỗ', 'E: phai log so option that = 0');
    has(logs, 'không thấy option thật', 'E: phai canh bao khong thay option that');
    lacks(logs, 'thử mở lại bằng trigger', 'E: v61 bo khoi mo lai — mo lai se dong dropdown dang mo (log 10:06)');
    has(logs, 'đã thử chọn map Thiên Sơn Tuyết Lãnh 3 lần', 'E: phai log dung sau 3 lan thu');
    lacks(logs, '🚀 Vân Du: Bắt Đầu Xuất Phát', 'E: khong duoc xuat phat khi map chua dung');
    eq(bot.vanduMapPickTries, 3, 'E: dung 3 lan thu');
    eq(bot.vanduMapPicked, false, 'E: khong duoc danh dau da chon');
    eq(bot.isRunning, false, 'E: dung bot sau khi break');
  }

  // D (V60, log 09:54 của anh — trường hợp chính, V61 khoanh trong
  // popout thay vì [role=option]): kênh đã đầy chữ Thiên Sơn (🔍 14/7
  // ngay từ lần mở đầu) nên bấm theo chữ toàn trúng span chữ trong tin
  // nhắn cũ — bấm ảo, game không đổi map, poll cũng vô ích vì cú bấm
  // chưa bao giờ ăn. Bot phải mở list bằng trigger [role=combobox] và
  // bấm chọn bằng option khoanh trong popout ([role=listbox] trước);
  // bấm theo chữ ở đây được mô phỏng là trả tên nút (truthy) nhưng
  // KHÔNG đổi map. Và chỉ mở list 1 lần — mở lại sẽ đóng dropdown
  // đang mở (log 10:06).
  {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '', vanduRealm: 'Hóa Thần', vanduMap: 'Thiên Sơn Tuyết Lãnh' });
    const logs = [];
    bot.log = (m) => logs.push(String(m));
    bot.delay = async () => {};
    bot.sendChat = async () => {};
    bot.dismissEphemeralMessages = async () => {};
    let gameMap = 'Thanh Vân Trấn';
    let dropdownOpen = false;
    let departed = false;
    const calls = [];
    bot.vanduScanLatest = async () => (departed ? tripEndScreen : startScreen(gameMap));
    bot.exec = async (js) => {
      const s = String(js);
      const needle = s.includes('thien son tuyet lanh') ? 'thien son tuyet lanh' : s.includes('thanh van tran') ? 'thanh van tran' : s.includes('bat dau xuat phat') ? 'bat dau xuat phat' : s.includes('tro ve giang ho') ? 'tro ve giang ho' : '';
      if (s.includes('vanduCountMapOptions')) { calls.push({ fn: 'count', needle }); return `14/7/${dropdownOpen ? 1 : 0}`; }
      if (s.includes('vanduClickMapTrigger')) { calls.push({ fn: 'trigger', needle }); dropdownOpen = true; return 'Thanh Vân Trấn'; }
      if (s.includes('vanduClickMapOption')) {
        calls.push({ fn: 'option', needle });
        if (dropdownOpen && needle === 'thien son tuyet lanh') { gameMap = 'Thiên Sơn Tuyết Lãnh'; return 'Thiên Sơn Tuyết Lãnh'; }
        return null;
      }
      if (s.includes("querySelectorAll('*')")) calls.push({ fn: 'exact', needle });
      else if (s.includes('[role="article"]')) calls.push({ fn: 'button', needle });
      else if (s.includes('[role="option"]')) calls.push({ fn: 'anywhere', needle });
      if (s.includes('thien son tuyet lanh')) return 'Thiên Sơn Tuyết Lãnh';
      if (s.includes('thanh van tran')) return 'Thanh Vân Trấn';
      if (s.includes('bat dau xuat phat')) { departed = true; return 'Bắt Đầu Xuất Phát'; }
      if (s.includes('tro ve giang ho')) return 'Trở Về Giang Hồ';
      return '';
    };
    bot.isRunning = true;
    bot.runId = 1;
    await bot.vanduLoop(1);
    has(logs, 'option thật 1 chỗ', 'D: phai log thay option that sau khi mo list');
    has(logs, 'map đang chọn đã là Thiên Sơn Tuyết Lãnh', 'D: phai xac nhan map truoc khi xuat phat');
    has(logs, 'Bắt Đầu Xuất Phát', 'D: phai bam Bat Dau sau khi xac nhan');
    lacks(logs, 'không thấy option thật', 'D: mo list bang trigger thi phai thay option that');
    lacks(logs, 'quét lại vẫn thấy', 'D: bam option an ngay, khong can poll lai');
    eq(bot.vanduMapPickTries, 1, 'D: bam 1 lan thi map an');
    const firstOpen = calls.find((c) => c.needle === 'thanh van tran');
    eq(firstOpen && firstOpen.fn, 'trigger', 'D: mo list thu trigger [role=combobox] truoc');
    eq(calls.filter((c) => c.fn === 'trigger').length, 1, 'D: chi mo list 1 lan, khong mo lai (v61: mo lai se dong dropdown)');
    const firstTargetPick = calls.find((c) => c.needle === 'thien son tuyet lanh' && c.fn !== 'count');
    eq(firstTargetPick && firstTargetPick.fn, 'option', 'D: bam map dich thu option khoanh trong popout truoc');
    eq(bot.isRunning, false, 'D: het chuyen thi dung');
  }

  // F + G (V61 review, 2026-11-11): các test A–E chỉ lái vanduLoop bằng
  // stub exec (trả truthy theo tên hàm), KHÔNG chạy câu query DOM thật —
  // nên v60 sai selector [role=option] mà test vẫn pass. Hai test này
  // chạy JS thật của helper trong fake DOM (vm + document giả) để bắt
  // đúng lỗi đó.
  // Fake DOM tối thiểu: phần tử có role/class/text, parentElement,
  // closest, querySelectorAll, isVisible (offsetParent/getClientRects),
  // click ghi lại. textContent = chữ của mình + chữ các con (như DOM thật).
  function fakeEl(opts) {
    const el = {
      _role: opts.role || null,
      _cls: opts.cls || '',
      _own: opts.text || '',
      _parent: opts.parent || null,
      _children: [],
      _innerHTML: opts.html || '',
      disabled: false,
      clicked: false,
      offsetParent: opts.visible === false ? null : {},
      getClientRects() { return opts.visible === false ? [] : [{}]; },
      get textContent() { return this._own + this._children.map((c) => c.textContent).join(''); },
      get innerHTML() { return this._innerHTML; },
      get parentElement() { return this._parent; },
      getAttribute(name) { return name === 'role' ? this._role : name === 'class' ? this._cls : null; },
      closest(sel) {
        let p = this;
        while (p) { if (fakeMatches(p, sel)) return p; p = p._parent; }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (node) => { for (const c of node._children) { if (fakeMatches(c, sel)) out.push(c); walk(c); } };
        walk(this);
        return out;
      },
      click() { this.clicked = true; },
    };
    for (const c of opts.children || []) { c._parent = el; el._children.push(c); }
    return el;
  }
  function fakeMatches(el, sel) {
    if (sel === '*') return true;
    const parts = String(sel).split(',').map((s) => s.trim());
    return parts.some((part) => {
      const rm = part.match(/\[role="([^"]+)"\]/);
      if (rm && el._role !== rm[1]) return false;
      const cm = part.match(/\[class\*="([^"]+)"\]/);
      if (cm && !(el._cls || '').includes(cm[1])) return false;
      const hm = part.match(/\[aria-haspopup="([^"]+)"\]/);
      if (hm) return false;
      if (!rm && !cm && !hm) return false;
      return true;
    });
  }
  function fakeDocFrom(roots) {
    const all = [];
    const walk = (node) => { all.push(node); for (const c of node._children) walk(c); };
    for (const r of roots) walk(r);
    return { querySelectorAll(sel) { return all.filter((el) => fakeMatches(el, sel)); } };
  }
  function domBot(fakeDoc) {
    const bot = new NpcBot({ executeJavaScript() {} }, 1);
    bot.userId = '';
    bot.exec = async (js) => vm.runInNewContext(String(js), { document: fakeDoc });
    return bot;
  }

  // F: kênh có 2 trigger cùng hiện "Thanh Vân Trấn" (màn cũ + màn mới) —
  // helper phải bấm trigger MỚI NHẤT (cuối DOM), không phải cũ nhất.
  {
    const oldTrigger = fakeEl({ role: 'combobox', text: 'Thanh Vân Trấn' });
    const newTrigger = fakeEl({ role: 'combobox', text: 'Thanh Vân Trấn' });
    const bot = domBot(fakeDocFrom([oldTrigger, newTrigger]));
    const got = await bot.vanduClickMapTrigger('Thanh Vân Trấn');
    if (!got) throw new Error('F: trigger phai bam duoc');
    if (!newTrigger.clicked) throw new Error('F: phai bam trigger MOI NHAT (man moi)');
    if (oldTrigger.clicked) throw new Error('F: khong duoc bam trigger CU (man cu)');
    console.log('Vân Du map trigger picks newest combobox passed');
  }

  // G: span chữ trong tin nhắn cũ SÂU HƠN label trong listbox (đúng lỗi
  // log 09:54/10:06) — bấm option phải trúng label trong listbox, không
  // trúng span chữ; và đếm option thật phải >= 1 khi dropdown đang mở.
  {
    const decoy = fakeEl({ text: 'Thiên Sơn Tuyết Lãnh' });
    const deep1 = fakeEl({ children: [decoy] });
    const deep2 = fakeEl({ children: [deep1] });
    const deep3 = fakeEl({ children: [deep2] });
    const article = fakeEl({ role: 'article', html: 'tin nhan cu', children: [deep3] });
    const label = fakeEl({ text: 'Thiên Sơn Tuyết Lãnh' });
    const desc = fakeEl({ text: 'Cảnh Giới: Hóa Thần+' });
    const row = fakeEl({ cls: 'option_abc', children: [label, desc] });
    const listbox = fakeEl({ role: 'listbox', children: [row] });
    const bot = domBot(fakeDocFrom([article, listbox]));
    const got = await bot.vanduClickMapOption('Thiên Sơn Tuyết Lãnh');
    if (!got) throw new Error('G: option phai bam duoc');
    if (!label.clicked) throw new Error('G: phai bam label trong listbox, khong phai span chu');
    if (decoy.clicked) throw new Error('G: khong duoc bam span chu trong tin nhan cu (decoy sau hon)');
    const cnt = await bot.vanduCountMapOptions('Thiên Sơn Tuyết Lãnh');
    if (!cnt || cnt.options < 1) throw new Error('G: dem option that phai >= 1 khi dropdown dang mo, thuc te: ' + JSON.stringify(cnt));
    if (cnt.exact < 2) throw new Error('G: dem khop dung phai thay ca label lan decoy, thuc te: ' + JSON.stringify(cnt));
    console.log('Vân Du map option scoped in listbox passed');
  }

  console.log('Vân Du map-verify checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
