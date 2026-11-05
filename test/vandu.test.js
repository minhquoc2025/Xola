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

// Circuit next element — V7: mạch là vòng tròn (bảng 2026-11-05)
eq(bot.vanduNextElement('sinh', 'Mộc'), 'Hỏa', 'sinh Mộc->Hỏa');
eq(bot.vanduNextElement('sinh', 'Thủy'), 'Mộc', 'sinh Thuy->Moc (quay vong)');
eq(bot.vanduNextElement('sinh', 'Kim'), 'Thủy', 'sinh Kim->Thuy');
eq(bot.vanduNextElement('khac', 'Thổ'), 'Thủy', 'khac Thổ->Thủy');
eq(bot.vanduNextElement('khac', 'Kim'), 'Mộc', 'khac Kim->Mộc');
eq(bot.vanduNextElement('khac', 'Mộc'), 'Thổ', 'khac Moc->Tho (quay vong)');
eq(bot.vanduNextElement('khac', 'Hỏa'), 'Kim', 'khac Hoa->Kim');

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

// Map theo cảnh giới (tool chọn cảnh giới -> bot chọn map tương ứng)
eq(bot.vanduMapForRealm('Hóa Thần'), 'Thiên Sơn Tuyết Lãnh', 'Hoa Than -> Thien Son');
eq(bot.vanduMapForRealm('Luyện Khí'), 'Thanh Vân Trấn', 'Luyen Khi -> Thanh Van');
eq(bot.vanduMapForRealm('Trúc Cơ'), 'Vạn Sơn Liên Mạch', 'Truc Co -> Van Son');
eq(bot.vanduMapForRealm('Kết Đan'), 'Đông Hải Tiên Đảo', 'Ket Dan -> Dong Hai');
eq(bot.vanduMapForRealm('Nguyên Anh'), 'Tây Vực Sa Mạc', 'Nguyen Anh -> Tay Vuc');
eq(bot.vanduMapForRealm('Không có'), '', 'realm lạ -> rỗng');
eq(bot.vanduCurrentMap('Đại Vùng Đang Chọn: 🌿 Thanh Vân Trấn\nHệ số'), 'Thanh Vân Trấn', 'parse current map');
bot.updateConfig({ mode: 'vandu', vanduRealm: 'Hóa Thần', vanduMap: 'Thiên Sơn Tuyết Lãnh' });
eq(bot.vanduTargetMap(), 'Thiên Sơn Tuyết Lãnh', 'target map từ config');
bot.updateConfig({ mode: 'vandu', vanduRealm: 'Hóa Thần', vanduMap: '' });
eq(bot.vanduTargetMap(), 'Thiên Sơn Tuyết Lãnh', 'target map suy từ realm khi map rỗng');

// V2: cửa khi chưa có mạch Thương > Sinh, tie-break Thương > Đỗ
eq(bot.vanduChooseDoor(['Tử Môn', 'Hưu Môn', 'Sinh Môn'], null), 'Sinh Môn', 'no circuit: Thuong vang, Sinh truoc Huu');
eq(bot.vanduChooseDoor(['Đỗ Môn', 'Thương Môn'], { type: 'sinh', last: 'Thủy' }), 'Thương Môn', 'circuit tie Moc: Thuong truoc Do');
eq(bot.vanduChooseDoor(['Khai Môn', 'Kinh Môn'], { type: 'khac', last: 'Hỏa' }), 'Kinh Môn', 'circuit tie Kim: Kinh truoc Khai (chua chot rieng)');
// V2: bảng khắc chế
// V7 (bảng 2026-11-05): Cường Thể / Huyền Giáp -> Thuật
eq(bot.vanduCounterSectFromText('quái [Cường Thể] X'), 'Thuật', 'Cuong The -> Thuat');
eq(bot.vanduCounterSectFromText('quái [Huyền Giáp] X'), 'Thuật', 'Huyen Giap -> Thuat');
eq(bot.vanduCounterSectFromText('quái [Cuồng Thể] X'), 'Thuật', 'Cuong The (cu) -> Thuat');
eq(bot.vanduCounterSectFromText('đã chém gục [Hư Ảo] Băng Tuyết Dạ Báo'), 'Ma', 'Hu Ao -> Ma');
eq(bot.vanduCounterSectFromText('quái [Cuồng Bạo] X'), 'Khí', 'Cuong Bao -> Khi');
eq(bot.vanduCounterSectFromText('quái lạ không tên'), null, 'quai la -> null');
eq(bot.vanduChooseBuff(['[Ma] Độc Cô Bảo Môn [Ma Tông - Lam]', '[Ma] Ma Hóa Cuồng Nộ [Ma Tông - Tím (Cực Phẩm)]', '[Khí] Kim Cang [Khí Tông - Vàng (Thần Thoại)]'], { Ma: 1, Khí: 0 }, {}, true, 'Ma').buttonText, '[Ma] Ma Hóa Cuồng Nộ [Ma Tông - Tím (Cực Phẩm)]', 'counter Ma: Tim thang Lam, thang vang Khi');
// V2: đố Bát Quái
eq(bot.vanduPuzzleElement('Thơ: "Hỏa viêm bùng sáng giữa trời đêm, xích diễm quang minh thiêu rụi tà chướng"'), 'Hỏa', 'tho Hoa');
eq(bot.vanduPuzzleElement('Tiếng nước róc rách: "Thủy lưu vạn trượng hùng hùng dũng lũ, âm hàn nhu thuận"'), 'Thủy', 'tho Thuy');
eq(bot.vanduPuzzleDoor('Hỏa'), 'Ly', 'Hoa -> Ly');
eq(bot.vanduPuzzleDoor('Thủy'), 'Khảm', 'Thuy -> Kham');
eq(bot.vanduPuzzleDoor('Thổ'), 'Khôn', 'Tho -> Khon');
// V2: cooldown skill
eq(bot.vanduSkillCooldown('Băng Phong (2)'), 2, 'cooldown 2');
eq(bot.vanduSkillCooldown('Băng Phong'), null, 'khong cooldown');

// V3: User ID cho Vân Du (chỉ số, giống các chức năng kia)
eq(bot.vanduNormalizeUserId('123abc456'), '123456', 'userid chi giu so');
eq(bot.vanduNormalizeUserId('  987-654 '), '987654', 'userid bo khoang trang/gach');
bot.updateConfig({ mode: 'vandu', userId: '12a34' });
eq(bot.userId, '1234', 'updateConfig luu userid da loc');

console.log('Vân Du logic checks passed');

// V4: chuẩn hoá mạnh cho Vân Du
eq(bot.vanduNormalize('🚀 Bắt Đầu Xuất Phát'), 'bat dau xuat phat', 'emoji + Dau -> bat dau xuat phat');
eq(bot.vanduNormalize('🌿 Thanh Vân Trấn'), 'thanh van tran', 'map name cleaned');
eq(bot.vanduNormalize('Thiên Sơn Tuyết Lãnh'), 'thien son tuyet lanh', 'map target cleaned');

// V6: đọc map đang chọn, kể cả khi mô tả dính liền không có xuống dòng
eq(bot.vanduCurrentMap('Đại Vùng Đang Chọn: 🌿 Thanh Vân TrấnThôn trấn thanh bình nơi chân núi Thanh Vân khởi nguồn của mọi hành trình'), 'Thanh Vân Trấn', 'current map dinh mo ta -> Thanh Van');
eq(bot.vanduCurrentMap('Đại Vùng Đang Chọn: 🌿 Thiên Sơn Tuyết Lãnh\nMô tả'), 'Thiên Sơn Tuyết Lãnh', 'current map Thien Son');
eq(bot.vanduCurrentMap('không có dòng đại vùng'), '', 'khong co dong -> rong');
