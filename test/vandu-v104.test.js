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

  console.log('vandu-v104 tests passed 100%!');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
