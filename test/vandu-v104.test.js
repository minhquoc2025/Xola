const path = require('path');
const { NpcBot } = require(path.join(__dirname, '..', 'src', 'main', 'npc-bot.js'));

function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

(async () => {
  const bot = new NpcBot({ executeJavaScript() {} }, 1);
  bot.updateConfig({ mode: 'vandu', vanduCmd: '!vandu', username: 'Test', userId: '' });

  // 1. Test Đạo Tâm (mạng sống): khởi đầu 4/4
  eq(bot.vanduLives, 4, 'Khởi đầu phải có 4 mạng (3 Đạo tâm + 1 Waifu)');

  // 2. Test Ngưỡng hồi máu cho Thiết Mao Hắc Lang ở tầng cao >= 20
  eq(bot.vanduHealThreshold(23, '[Huyết Tế] Thiết Mao Hắc Lang', false), 65, 'Thiet Mao Hac Lang o Tiet 23 phai co nguong hoi 65%');
  eq(bot.vanduHealThreshold(11, '[Hư Ảo] Thiết Mao Hắc Lang', true), 65, 'Boss Thiet Mao Hac Lang co nguong hoi 65%');
  eq(bot.vanduHealThreshold(5, 'Quái Thường', false), 20, 'Quai thuong tang 5 nguong hoi 20%');

  // 3. Test Buff Tiết 1-12: ưu tiên 5 Thuật trước khi nâng sao
  bot.vanduNode = 8;
  const chooseWithReroll = bot.vanduChooseBuff(
    ['[Thuật] Tam Muội Chân Hỏa [Thuật Tông - Lam]', '[Kiếm] Vạn Kiếm Quy Tông [Kiếm Tông - Vàng]'],
    { Thuật: 2 },
    { 'Tam Muội Chân': 1 },
    true // còn lượt đổi
  );
  eq(chooseWithReroll.action, 'reroll', 'Tiet 8 chua du 5 Thuat con luot doi -> phai Reroll de tim Thuat moi');

  const chooseNoReroll = bot.vanduChooseBuff(
    ['[Thuật] Tam Muội Chân Hỏa [Thuật Tông - Lam]', '[Kiếm] Vạn Kiếm Quy Tông [Kiếm Tông - Vàng]'],
    { Thuật: 2 },
    { 'Tam Muội Chân': 1 },
    false // hết lượt đổi
  );
  eq(chooseNoReroll.reason, 'duplicate', 'Tiet 8 het luot doi -> moi duoc phep an dup nang sao');

  // 4. Test status object
  const status = bot.getStatus();
  eq(status.vanduLives, 4, 'getStatus co vanduLives = 4');
  eq(status.vanduMaxLives, 4, 'getStatus co vanduMaxLives = 4');

  // 5. Test danh mục tra cứu Tông & Độ hiếm cho thẻ nâng cấp ⬆️T2/T3 (tránh lỗi ?:? hoặc nhầm tông)
  const cTuKhi = bot.vanduParseBuffCard('⬆️T2 ⏳ ★★ Tụ Khí Hoàn Ngu');
  eq(cTuKhi.sect, 'Thuật', 'Tu Khi Hoan Nguyen phai la Thuat Tong (khong phai Khi)');
  eq(bot.vanduBuffRarity('⬆️T2 ⏳ ★★ Tụ Khí Hoàn Ngu'), 2, 'Tu Khi Hoan Nguyen la Lam (2)');

  const cThanMa = bot.vanduParseBuffCard('⬆️T2 🔆 ★★ Thần Ma Trụ Thế');
  eq(cThanMa.sect, 'Khí', 'Than Ma Tru The phai la Khi Tong (khong phai Ma)');
  eq(bot.vanduBuffRarity('⬆️T2 🔆 ★★ Thần Ma Trụ Thế'), 4, 'Than Ma Tru The la Vang (4)');

  const cThienCo = bot.vanduParseBuffCard('⬆️T2 📜 ★★ Thiên Cơ Đồ Lục');
  eq(cThienCo.sect, 'Vận', 'Thien Co Do Luc phai la Van Menh');
  eq(bot.vanduBuffRarity('⬆️T2 📜 ★★ Thiên Cơ Đồ Lục'), 3, 'Thien Co Do Luc la Tim (3), khong nham chu Luc');

  const cKimCang = bot.vanduParseBuffCard('⬆️T2 👑 ★★ Kim Cang Bất Ho');
  eq(cKimCang.sect, 'Khí', 'Kim Cang Bat Hoai la Khi Tong');
  eq(bot.vanduBuffRarity('⬆️T2 👑 ★★ Kim Cang Bất Ho'), 4, 'Kim Cang Bat Hoai la Vang (4)');

  // 6. Test case thực tế từ log vandu2011-1.txt:
  // 6.1: Tiết 14 (dòng 202): Đã có 5 Thuật, Khí = 0. Sổ bot lỡ lưu 'Phá Pháp Phù C': 1 nhưng nút thật trên màn là 1★ mới "🔵[Thuật] 🔱 Phá Pháp Phù C".
  // Phải nhận diện đúng Phá Pháp Phù C là thẻ 1★ mới (không pick thêm Thuật thứ 6) và chọn "🔵[Khí] 🪞 Phản Chấn Cương" để gom Khí!
  bot.vanduNode = 14;
  const pickTiet14 = bot.vanduChooseBuff(
    ['🔵[Khí] 🪞 Phản Chấn Cương', '🟢[Kiếm] ⚔️ Phong Nhuệ Kiế', '🔵[Thuật] 🔱 Phá Pháp Phù C', '🟡[Kiếm] 👑 Vạn Kiếm Quy Tô'],
    { Thuật: 5, Ma: 1, Kiếm: 1, Vận: 1, Khí: 0 },
    { 'Phá Pháp Phù C': 1 },
    true,
    'Thuật'
  );
  eq(pickTiet14.reason, 'khi', 'Tiet 14: Da du 5 Thuat, Khi = 0 -> phai lay Phan Chan Cuong (Khi), khong pick nham Pha Phap 1★');
  eq(pickTiet14.buttonText, '🔵[Khí] 🪞 Phản Chấn Cương', 'Tiet 14: Chon Phan Chan Cuong');

  // 6.2: Tiết 19 (dòng 260): Đã đủ Thuật, Khí < 5, bảng có cả Tức Nhưỡng Quy Nguyên (Khí:Lam) và Thái Ất Thần Lô (⬆️T2) -> ưu tiên gom Khí trước!
  bot.vanduNode = 19;
  const pickTiet19 = bot.vanduChooseBuff(
    ['🟡[Thuật] 🔆 Ngũ Hành Nghịc', '⬆️T2 👑 ★★ Thái Ất Thần Lô', '🔵[Khí] 🌿 Tức Nhưỡng Quy N', '⬆️T2 🔆 ★★ Ma Tôn Giáng Th'],
    { Thuật: 5, Ma: 1, Kiếm: 2, Vận: 1, Khí: 1 },
    { 'Thái Ất Thần L': 1 },
    true,
    'Thuật'
  );
  eq(pickTiet19.reason, 'khi', 'Tiet 19: Khi < 5 -> uu tien gom Tuc Nhuong Quy Nguyen (Khi) truoc khi nang sao Thai At');
  eq(pickTiet19.buttonText, '🔵[Khí] 🌿 Tức Nhưỡng Quy N', 'Tiet 19: Chon Tuc Nhuong Quy Nguyen');

  // 6.3: Tiết 20 (dòng 305): Bảng có "⬆️T3 ⚡ ★★★ Cửu Thiên Lôi", "⬆️T2 👑 ★★ Kim Cang Bất Ho", và thẻ 1★ "🟣[Thuật] 🌀 Chân Pháp Vô B" (đã bị đào thải).
  // Không được pick nhầm "🟣[Thuật] 🌀 Chân Pháp Vô B", mà phải chọn nâng sao Core Buff "⬆️T3 ⚡ ★★★ Cửu Thiên Lôi"!
  bot.vanduNode = 20;
  const pickTiet20 = bot.vanduChooseBuff(
    ['🔵[Thuật] ⏳ Tụ Khí Hoàn Ng', '⬆️T3 ⚡ ★★★ Cửu Thiên Lôi', '⬆️T2 👑 ★★ Kim Cang Bất Ho', '🟣[Thuật] 🌀 Chân Pháp Vô B'],
    { Thuật: 5, Ma: 1, Kiếm: 2, Vận: 1, Khí: 1 },
    { 'Chân Pháp Vô B': 1, 'Cửu Thiên Lôi': 2, 'Kim Cang Bất Hoạ': 1 },
    true,
    'Thuật'
  );
  eq(pickTiet20.reason, 'duplicate', 'Tiet 20: Chon nang sao Core Buff');
  eq(pickTiet20.buttonText, '⬆️T3 ⚡ ★★★ Cửu Thiên Lôi', 'Tiet 20: Chon ⬆️T3 Cuu Thien Loi (Core Buff ★2 -> ★3), khong chon nham Chan Phap Vo B 1★');

  // 7. Test Shop khi đủ 3 Đan và đã đủ 5 Thuật -> rời đi, không mua Bí Tịch Thượng Cổ
  bot.vanduSectCounts = { Thuật: 3 };
  eq(bot.vanduShopAction(3, false, false), 'bi-tich', 'Chua du 5 Thuat, 3 dan -> van bam Bi Tich');
  bot.vanduSectCounts = { Thuật: 5 };
  eq(bot.vanduShopAction(3, false, false), 'roi-di', 'Da du 5 Thuat, 3 dan -> roi di ngay, khong mua Bi Tich tranh thua Thuat/loang tui');
  eq(bot.vanduShopAction(2, false, false), 'mua-cuu-chuyen', 'Da du 5 Thuat nhung dan < 3 -> van mua Cuu Chuyen');

  // 8. Test trọng số dupPriority (vandu2011-2.txt): Thẻ Vàng Thần Thoại & hệ khắc chế thắng thẻ Lam/Lục
  // 8.1: Tiết 20 (dòng 288): Thần Ma Trụ Thế (Khí:Vàng ★1) thắng Phá Pháp Phù Chú (Thuật:Lam ★2)
  bot.vanduNode = 20;
  const pick20_v2 = bot.vanduChooseBuff(
    ['⬆️T2 🔆 ★★ Thần Ma Trụ Thế', '⬆️T3 🔱 ★★★ Phá Pháp Phù C', '⬆️T2 ❄️ ★★ Băng Phách Hàn', '🟣[Vận] 📜 Thiên Cơ Đồ Lục'],
    { Thuật: 6, Vận: 1, Khí: 1, Kiếm: 2 },
    { 'Thần Ma Trụ Thế': 1, 'Phá Pháp Phù C': 2, 'Băng Phách Hà': 1 },
    true,
    'Kiếm'
  );
  eq(pick20_v2.buttonText, '⬆️T2 🔆 ★★ Thần Ma Trụ Thế', 'Tiet 20 (vandu2011-2): Nang sao Than Ma Tru The (Khi:Vang) thay vi Pha Phap Phu Chu (Thuat:Lam)');

  // 8.2: Tiết 21 (dòng 225): Vạn Kiếm Quy Tông (Kiếm:Vàng ★1, khắc chế Kiếm) thắng Dẫn Lôi Thuật (Thuật:Lục ★2)
  bot.vanduNode = 21;
  const pick21_v2 = bot.vanduChooseBuff(
    ['⬆️T3 ⚡ ★★★ Dẫn Lôi Thuật', '⬆️T2 👑 ★★ Vạn Kiếm Quy Tô', '🟢[Kiếm] 🗡️ Bạt Kiếm Thuật', '⬆️T2 🔆 ★★ Thần Ma Trụ Thế'],
    { Thuật: 5, Vận: 1, Khí: 1, Kiếm: 1 },
    { 'Dẫn Lôi Thuật': 2, 'Vạn Kiếm Quy Tô': 1, 'Thần Ma Trụ Thế': 1 },
    true,
    'Kiếm'
  );
  eq(pick21_v2.buttonText, '⬆️T2 👑 ★★ Vạn Kiếm Quy Tô', 'Tiet 21 (vandu2011-2): Nang sao Van Kiem Quy Tong (Kiem:Vang, khac che) thay vi Dan Loi Thuat (Thuat:Luc)');

  // 8.3: Tiết 23 (dòng 321): Vạn Kiếm Quy Tông (Kiếm:Vàng ★1) thắng Tụ Khí Hoàn Nguyên (Thuật:Lam ★1)
  bot.vanduNode = 23;
  const pick23_v2 = bot.vanduChooseBuff(
    ['⬆️T2 👑 ★★ Vạn Kiếm Quy Tô', '🟡[Thuật] 👑 Thái Ất Thần L', '🟢[Kiếm] 🗡️ Bạt Kiếm Thuật', '⬆️T2 ⏳ ★★ Tụ Khí Hoàn Ngu'],
    { Thuật: 6, Vận: 1, Khí: 2, Kiếm: 3 },
    { 'Vạn Kiếm Quy Tô': 1, 'Tụ Khí Hoàn Ng': 1 },
    true,
    'Kiếm'
  );
  eq(pick23_v2.buttonText, '⬆️T2 👑 ★★ Vạn Kiếm Quy Tô', 'Tiet 23 (vandu2011-2): Nang sao Van Kiem Quy Tong (Kiem:Vang) thay vi Tu Khi Hoan Nguyen (Thuat:Lam)');

  // 9. Test vanduBattleLoop 600ms retry branch không bị crash TypeError: Assignment to constant variable (`screen = retryScreen`)
  {
    const b2 = new NpcBot({ executeJavaScript() {} }, 2);
    b2.updateConfig({ mode: 'vandu', vanduCmd: '!vandu' });
    b2.vanduSkillOrder = ['Lôi Đình Vạn Quân', 'Hư Không Đại Na Di', 'Băng Phong'];
    b2.isRunning = true;
    b2.runId = 99;
    b2.delay = async () => {};
    b2.dismissEphemeralMessages = async () => {};
    const clickedSkills = [];
    b2.vanduClickButton = async (name) => { clickedSkills.push(name); return name; };
    let scanCall = 0;
    const screens = [
      // Hiệp 1: Lôi Đình Vạn Quân sẵn sàng
      { text: 'TRẠNG THÁI CHIẾN TRƯỜNG\n❤️ Tôi: 100/100 (100%)\n[Cuồng Bạo] Băng Tuyết Dạ Báo: 100/100 (100%)', buttons: ['⚡ Lôi Đình Vạn Quân', '🌀 Hư Không Đại Na Di', '🌊 Băng Phong'] },
      // Hiệp 2: Hư Không Đại Na Di sẵn sàng
      { text: 'TRẠNG THÁI CHIẾN TRƯỜNG\n❤️ Tôi: 100/100 (100%)\n[Cuồng Bạo] Băng Tuyết Dạ Báo: 68/100 (68%)', buttons: ['⚡ Lôi Đình Vạn Quân (2)', '🌀 Hư Không Đại Na Di', '🌊 Băng Phong'] },
      // Hiệp 3 - lần quét đầu: Băng Phong đang lag/cooldown (1), kích hoạt retry 600ms
      { text: 'TRẠNG THÁI CHIẾN TRƯỜNG\n❤️ Tôi: 100/100 (100%)\n[Cuồng Bạo] Băng Tuyết Dạ Báo: 40/100 (40%)', buttons: ['⚡ Lôi Đình Vạn Quân (2)', '🌀 Hư Không Đại Na Di (2)', '🌊 Băng Phong (1)'] },
      // Hiệp 3 - lần quét retry sau 600ms: Băng Phong hết cooldown -> chạy vào `screen = retryScreen`
      { text: 'TRẠNG THÁI CHIẾN TRƯỜNG\n❤️ Tôi: 100/100 (100%)\n[Cuồng Bạo] Băng Tuyết Dạ Báo: 40/100 (40%)', buttons: ['⚡ Lôi Đình Vạn Quân (1)', '🌀 Hư Không Đại Na Di (1)', '🌊 Băng Phong'] },
      // Kết thúc trận (màn chọn buff)
      { text: 'Tông Môn Lĩnh Vực', buttons: ['🟡[Khí] 👑 Kim Cang Bất Hoạ'] }
    ];
    b2.vanduScanLatest = async () => screens[Math.min(scanCall++, screens.length - 1)];
    await b2.vanduBattleLoop(99);
    eq(clickedSkills, ['Lôi Đình Vạn Quân', 'Hư Không Đại Na Di', 'Băng Phong'], 'vanduBattleLoop retry 600ms khong crash va click dung Bang Phong o hiep 3');
  }

  console.log('vandu-v104 tests passed 100%!');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
