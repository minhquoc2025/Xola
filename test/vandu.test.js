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
// V10: Thuật fallback, vàng chỉ ở bước còn lại (sau khi hết lượt đổi)
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, true).action, 'pick', 'V10: co Thuat -> pick, khong doi');
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, true).buttonText, '[Thuật] Thái Ất [Thuật Tông - Lam]', 'V10: Thuat duoc chon');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]', '[Khí] B [Khí Tông - Vàng (Thần Thoại)]'], { Kiếm: 0, Khí: 0 }, {}, true), { action: 'reroll' }, 'V10: khong counter/Thuat, con luot doi -> doi, khong lay vang ngay');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]', '[Khí] B [Khí Tông - Vàng (Thần Thoại)]'], { Kiếm: 0, Khí: 0 }, {}, false).buttonText, '[Khí] B [Khí Tông - Vàng (Thần Thoại)]', 'V10: het luot doi -> vang con lai truoc');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, {}, true), { action: 'reroll' }, 'V10: khong counter/Thuat -> reroll');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, { A: true }, false).buttonText, '[Kiếm] A [Kiếm Tông - Lam]', 'V10: het luot doi -> chon con lai');
// V10: ví dụ anh đưa — quái Hư Ảo cần Ma, bảng không có Ma mà có Thuật thì chọn Thuật, không đổi
eq(bot.vanduChooseBuff(['[Thuật] T [Thuật Tông - Lam]', '[Kiếm] Y [Kiếm Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma').buttonText, '[Thuật] T [Thuật Tông - Lam]', 'V10: can Ma, khong Ma co Thuat -> Thuat, khong doi, khong lay vang Kiem');
// V10: khắc chế thắng cả Thuật vàng (luật cũ tiết 6 giữ nguyên)
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V10: counter Ma thang Thuat vang');
// V10: trong Thuật, tím trước lam
eq(bot.vanduChooseBuff(['[Thuật] A [Thuật Tông - Lam]', '[Thuật] B [Thuật Tông - Tím (Cực Phẩm)]'], {}, {}, true).buttonText, '[Thuật] B [Thuật Tông - Tím (Cực Phẩm)]', 'V10: trong Thuat, tim truoc lam');
// V10: đọc số lượt Đổi Vận trên bảng (2 hoặc 4, không đếm cứng)
eq(bot.vanduRerollRemaining('Đổi Vận (4 lượt)', ['Đổi Vận (4 lượt)']), 4, 'doi van 4 luot');
eq(bot.vanduRerollRemaining('Đổi Vận (2 lượt)', []), 2, 'doi van 2 luot');
eq(bot.vanduRerollRemaining('Đổi Vận (0 lượt)', []), 0, 'doi van 0 luot');
eq(bot.vanduRerollRemaining('không có nút đổi', []), null, 'khong doc duoc -> null');

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

// V8 (2026-11-05): không có mạch, ưu tiên Thương -> Sinh -> Cảnh -> Kinh
eq(bot.vanduChooseDoor(['Hưu Môn', 'Kinh Môn'], null), 'Kinh Môn', 'no circuit: Kinh truoc Huu (bang moi)');
eq(bot.vanduChooseDoor(['Cảnh Môn', 'Kinh Môn'], null), 'Cảnh Môn', 'no circuit: Canh truoc Kinh');
eq(bot.vanduChooseDoor(['Cảnh Môn', 'Thương Môn', 'Tử Môn'], null), 'Thương Môn', 'no circuit: man Tiet 11, Thuong thang');
eq(bot.vanduChooseDoor(['Khai Môn', 'Hưu Môn'], null), 'Hưu Môn', 'no circuit: duoi sau Kinh, Huu truoc Khai');
eq(bot.vanduChooseDoor(['Đỗ Môn', 'Khai Môn'], null), 'Khai Môn', 'no circuit: duoi sau Kinh, Khai truoc Do');

// V9 (2026-11-05): Thổ có 2 cửa Sinh/Tử — Sinh trước, không có Sinh thì Tử,
// cho cả mạch Sinh (Hỏa->Thổ) và mạch Khắc (Mộc->Thổ)
eq(bot.vanduChooseDoor(['Tử Môn', 'Cảnh Môn', 'Kinh Môn'], { type: 'sinh', last: 'Hỏa' }), 'Tử Môn', 'sinh Hoa->Tho, chi co Tu -> Tu');
eq(bot.vanduChooseDoor(['Tử Môn', 'Cảnh Môn', 'Kinh Môn'], { type: 'khac', last: 'Mộc' }), 'Tử Môn', 'khac Moc->Tho, chi co Tu -> Tu');
eq(bot.vanduChooseDoor(['Sinh Môn', 'Tử Môn', 'Cảnh Môn'], { type: 'sinh', last: 'Hỏa' }), 'Sinh Môn', 'sinh Hoa->Tho, co ca Sinh/Tu -> Sinh');
eq(bot.vanduChooseDoor(['Sinh Môn', 'Tử Môn', 'Cảnh Môn'], { type: 'khac', last: 'Mộc' }), 'Sinh Môn', 'khac Moc->Tho, co ca Sinh/Tu -> Sinh');

// V11 (lỗi nghiêm trọng 2026-11-05): mạch Khắc Kim->Mộc, lượt trước Kinh->Đỗ,
// lượt sau phải Thổ (Sinh/Tử), không được quay lại Thương.
// - Bot tự tiến mạch sau cú bấm đúng.
eq(bot.vanduAdvanceCircuit({ type: 'khac', elements: ['Kim'], last: 'Kim' }, 'Mộc'), { type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, 'V11: bam Do (Moc) dung buoc Khac -> tien toi Moc');
eq(bot.vanduAdvanceCircuit({ type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, 'Hỏa'), { type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, 'V11: cua khong phai buoc tiep (Hoa, trong khi can Tho) thi khong tien');
// - Màn hình cũ chỉ ghi neo Kim không được làm tụt mạch đã tiến tới Mộc.
eq(bot.vanduMergeCircuit({ type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, { type: 'khac', elements: ['Kim'], last: 'Kim' }), { type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, 'V11: man cu chi ghi Kim khong lam tut mach');
eq(bot.vanduMergeCircuit({ type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }, { type: 'khac', elements: ['Kim', 'Mộc', 'Thổ'], last: 'Thổ' }), { type: 'khac', elements: ['Kim', 'Mộc', 'Thổ'], last: 'Thổ' }, 'V11: man moi dai hon thi nhan');
eq(bot.vanduMergeCircuit({ type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa' }, { type: 'khac', elements: ['Kim'], last: 'Kim' }), { type: 'khac', elements: ['Kim'], last: 'Kim' }, 'V11: doi loai mach thi nhan mach moi');
// - Chuỗi đầy đủ của lỗi: sau Đỗ, mạch là Mộc, cửa có Thương + Sinh -> phải Sinh (Thổ), không phải Thương.
eq(bot.vanduChooseDoor(['Thương Môn', 'Sinh Môn', 'Cảnh Môn'], { type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }), 'Sinh Môn', 'V11: Khac Moc->Tho, co Thuong + Sinh -> Sinh, khong quay lai Thuong');
// - Đang có mạch mà không có cửa đúng thì không bấm (null), không rơi về ưu tiên cửa.
eq(bot.vanduChooseDoor(['Thương Môn', 'Cảnh Môn', 'Kinh Môn'], { type: 'khac', elements: ['Kim', 'Mộc'], last: 'Mộc' }), null, 'V11: Khac can Tho ma khong co cua Tho -> khong bam');
eq(bot.vanduChooseDoor(['Thương Môn', 'Cảnh Môn'], { type: 'khac', elements: [], last: null }), null, 'V11: co mach nhung chua biet hanh hien tai -> khong doan');
// - Chưa có mạch thì ưu tiên cửa vẫn dùng như cũ (cửa đầu tiên khi vô mạch).
eq(bot.vanduChooseDoor(['Thương Môn', 'Sinh Môn', 'Cảnh Môn'], null), 'Thương Môn', 'V11: chua co mach -> uu tien cua nhu cu');
