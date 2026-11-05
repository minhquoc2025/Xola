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
// V13 thay V10 ở đây: Thuật lam (không vàng/tím) mà còn lượt đổi thì Đổi, hết lượt mới chọn.
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, true), { action: 'reroll' }, 'V13: Thuat lam, con luot doi -> doi');
eq(bot.vanduChooseBuff(['[Thuật] Thái Ất [Thuật Tông - Lam]', '[Kiếm] Kiếm X [Kiếm Tông - Lam]'], { Thuật: 2, Kiếm: 0 }, {}, false).buttonText, '[Thuật] Thái Ất [Thuật Tông - Lam]', 'V13: Thuat lam, het luot doi -> chon Thuat');
// V17 thay V10 o day: Khi vang gio la 1 trong 12 buff cung (1 Khi vang)
// nen lay luon, khong Doi bo nhu truoc nua.
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]', '[Khí] B [Khí Tông - Vàng (Thần Thoại)]'], { Kiếm: 0, Khí: 0 }, {}, true).buttonText, '[Khí] B [Khí Tông - Vàng (Thần Thoại)]', 'V17: Khi vang la buff cung -> lay luon, khong doi');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]', '[Khí] B [Khí Tông - Vàng (Thần Thoại)]'], { Kiếm: 0, Khí: 0 }, {}, false).buttonText, '[Khí] B [Khí Tông - Vàng (Thần Thoại)]', 'V10: het luot doi -> vang con lai truoc');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, {}, true), { action: 'reroll' }, 'V10: khong counter/Thuat -> reroll');
eq(bot.vanduChooseBuff(['[Kiếm] A [Kiếm Tông - Lam]'], { Kiếm: 0 }, { A: true }, false).buttonText, '[Kiếm] A [Kiếm Tông - Lam]', 'V10: het luot doi -> chon con lai');
// V13 thay V10 ở ví dụ này: Thuật lam thì Đổi để tìm vàng/tím, Thuật tím thì chọn ngay.
eq(bot.vanduChooseBuff(['[Thuật] T [Thuật Tông - Lam]', '[Kiếm] Y [Kiếm Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma'), { action: 'reroll' }, 'V13: can Ma, Thuat lam, con luot doi -> doi');
eq(bot.vanduChooseBuff(['[Thuật] T [Thuật Tông - Tím (Cực Phẩm)]', '[Kiếm] Y [Kiếm Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma').buttonText, '[Thuật] T [Thuật Tông - Tím (Cực Phẩm)]', 'V13: can Ma, Thuat tim -> chon Thuat tim');
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

// V12 (log 2026-11-05 08:29): chỉ câu hoàn thành mạch thật mới xóa mạch.
// Bảng đố hoàn hảo có chữ "hoàn mỹ" nhưng không được xóa mạch đang đi dở.
eq(bot.vanduIsCircuitComplete('THIÊN CƠ HOÀN MỸ! Boss suy yếu!'), true, 'V12: Thien Co Hoan My -> xong mach');
eq(bot.vanduIsCircuitComplete('đã thông trọn vẹn mạch Tương Khắc'), true, 'V12: thong tron ven mach -> xong mach');
eq(bot.vanduIsCircuitComplete('Giải đố hoàn mỹ! +62,500 Ngân Lượng'), false, 'V12: giai do hoan my khong xoa mach');
eq(bot.vanduIsCircuitComplete('HOÀN MỸ'), false, 'V12: chu Hoan My don thuan khong xoa mach');
eq(bot.vanduIsCircuitComplete('Bản Đồ Thiên Cơ, Tiết Điểm 11/36'), false, 'V12: man cua thuong khong xoa mach');

// V13 (2026-11-05): có khắc chế/Thuật mà không vàng/tím thì Đổi, hết lượt mới chọn còn lại
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Kiếm] K [Kiếm Tông - Lam]'], {}, {}, true, 'Ma'), { action: 'reroll' }, 'V13: Ma lam, con luot doi -> doi');
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Kiếm] K [Kiếm Tông - Lam]'], {}, {}, false, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V13: Ma lam, het luot doi -> chon Ma lam');
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Tím (Cực Phẩm)]', '[Kiếm] K [Kiếm Tông - Lam]'], {}, {}, true, 'Ma').buttonText, '[Ma] M [Ma Tông - Tím (Cực Phẩm)]', 'V13: Ma tim, con luot doi -> chon Ma tim, khong doi');
// V17 thay V13 o day: Khi vang gio tinh vao nhom muon lay (chi tieu) nen
// co vang -> khong Doi nua; nhung thu tu ro thi khac che van thang, nen
// chon Ma Lam truoc Khi Vang (giong ban het luot doi ben duoi).
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Khí] K [Khí Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V17: Ma lam + Khi vang, con luot -> khong doi, chon Ma lam (khac che truoc)');
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Khí] K [Khí Tông - Vàng (Thần Thoại)]'], {}, {}, false, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V13: Ma lam + Khi vang, het luot doi -> chon Ma lam truoc vang khac tong');
eq(bot.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]'], {}, {}, true, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V13: khac che thang Thuat vang (luat cu giu nguyen)');

// V14 (ảnh 2026-11-05, Tiết 1/36): nút KHÔNG ghi độ hiếm, độ hiếm chỉ ở mô tả.
// Quái Hư Ảo -> khắc chế Ma, bảng có Ma Vàng, hết lượt Đổi -> phải chọn Ma Vàng, không đứng im.
const shotText = 'CHIẾN THẮNG VANG DỘI! Đạo hữu đã chém gục [Tiên Tiêu Hư Ảo] Băng Tuyết Dạ Báo! '
  + '1. [Vận] Đại Đạo Đồng Quy [Vận Mệnh • Vàng (Thần Thoại)] '
  + '2. [Ma] Ma Tôn Giáng Thế [Ma Tông • Vàng (Thần Thoại)] '
  + '3. [Kiếm] Bạt Kiếm Thuật [Kiếm Tông • Lục (Phổ Thông)] '
  + '4. [Ma] Tuyệt Đối Tập Kích [Ma Tông • Lam (Hiếm)]';
const shotButtons = ['[Vận] Đại Đạo Đồng Quy', '[Ma] Ma Tôn Giáng Thế', '[Kiếm] Bạt Kiếm Thuật', '[Ma] Tuyệt Đối Tập Kích'];
eq(bot.vanduBuffRarities(shotText, shotButtons), [4, 4, 1, 2], 'V14: doc do hiem tu mo ta theo thu tu nut');
eq(bot.vanduCounterSectFromText(shotText), 'Ma', 'V14: quai Hu Ao -> Ma');
eq(bot.vanduChooseBuff(shotButtons, {}, {}, false, 'Ma', bot.vanduBuffRarities(shotText, shotButtons)).buttonText, '[Ma] Ma Tôn Giáng Thế', 'V14: bang anh, het luot -> chon Ma Vang, khong doi, khong dung im');
eq(bot.vanduChooseBuff(shotButtons, {}, {}, true, 'Ma', bot.vanduBuffRarities(shotText, shotButtons)).buttonText, '[Ma] Ma Tôn Giáng Thế', 'V14: bang anh, con luot nhung da co Ma Vang -> chon ngay, khong doi');
// V14: nút "Hết Lượt Đổi Vận" là 0 lượt, không phải không đọc được.
eq(bot.vanduRerollRemaining('Hết Lượt Đổi Vận', ['Hết Lượt Đổi Vận']), 0, 'V14: Het Luot Doi Van -> 0');
eq(bot.vanduRerollRemaining('Đổi Vận (2 lượt)', []), 2, 'V14: Doi Van 2 luot van doc duoc');
// V14: độ hiếm không đọc được thì không coi là thấp để Đổi (an toàn hơn Đổi mất buff vàng).
eq(bot.vanduChooseBuff(['[Thuật] T'], {}, {}, true).buttonText, '[Thuật] T', 'V14: Thuat khong ro do hiem, con luot -> chon, khong doi');
// V14: tông Thuật không đúng dạng Tông/khung vẫn nhận, vàng bằng emoji vẫn nhận.
eq(bot.vanduParseBuffCard('Thái Ất Thuật Vàng').sect, 'Thuật', 'V14: ten co chu Thuat -> tong Thuat');
eq(bot.vanduBuffRarity('[Thuật] T 🟡'), 4, 'V14: emoji vang -> 4');
eq(bot.vanduChooseBuff(['Thái Ất Thuật 🟡'], {}, {}, true).buttonText, 'Thái Ất Thuật 🟡', 'V14: Thuat vang emoji -> chon ngay');

// V15 (2026-11-05): thứ tự skill Vân Du lấy từ cấu hình chung (29,26,23),
// không chọn cứng nữa; rỗng thì giữ mặc định cũ.
const bot2 = new NpcBot({ executeJavaScript() {} }, 1);
eq(bot2.vanduSkillOrder, ['Phá Giáp', 'Băng Phong', 'Hư Không Đại Na Di', 'Kim Đan Phá Sát', 'Băng Phong', 'Vạn Kiếm Quy Tông'], 'V15: mac dinh khi chua co cau hinh');
bot2.updateConfig({ vanduSkillNames: ['Hư Không Đại Na Di', 'Kim Đan Phá Sát', 'Vạn Kiếm Quy Tông'] });
eq(bot2.vanduSkillOrder, ['Hư Không Đại Na Di', 'Kim Đan Phá Sát', 'Vạn Kiếm Quy Tông'], 'V15: cau hinh 29,26,23 -> thu tu theo cau hinh');
bot2.updateConfig({ vanduSkillNames: [] });
eq(bot2.vanduSkillOrder, ['Hư Không Đại Na Di', 'Kim Đan Phá Sát', 'Vạn Kiếm Quy Tông'], 'V15: cau hinh rong -> giu thu tu cu, khong ve mac dinh');

// V16 (2026-11-05): Số lần đi — bấm Trở Về Giang Hồ là hết 1 chuyến.
const bot3 = new NpcBot({ executeJavaScript() {} }, 1);
eq(bot3.vanduTripCount, 0, 'V16: khoi tao 0 chuyen');
eq(bot3.vanduCountTrip(), 1, 'V16: chuyen 1');
eq(bot3.vanduCountTrip(), 2, 'V16: chuyen 2');
eq(bot3.vanduTripCount, 2, 'V16: giu qua cac lan goi (khong reset o vanduLoop)');
bot3.resetStats();
eq(bot3.vanduTripCount, 0, 'V16: Reset Stats ve 0');

// V17 (2026-11-05): tui cung 5 Thuat + 1 Van vang + 1 Khi vang + 5 khac che,
// trung nang sao toi da 4 lan, vang > tim > lam > luc trong moi ro.
const botV17 = new NpcBot({ executeJavaScript() {} }, 1);
eq(botV17.vanduCounterPicks, 0, 'V17: khoi tao 0 luot khac che');
eq(botV17.vanduChooseBuff(['[Vận] V [Vận Mệnh - Vàng (Thần Thoại)]', '[Ma] Ma Tôn Giáng Thế [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lục]', '[Ma] T [Ma Tông - Lam]'], { Ma: 0, Vận: 0 }, {}, false, 'Ma').buttonText, '[Ma] Ma Tôn Giáng Thế [Ma Tông - Vàng (Thần Thoại)]', 'V17: bang tiet 1 -> Ma Vang (khac che thang Van Vang khi cung vang)');
eq(botV17.vanduChooseBuff(['[Vận] V [Vận Mệnh - Vàng (Thần Thoại)]', '[Ma] Ma Tôn Giáng Thế [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lục]', '[Ma] T [Ma Tông - Lam]'], { Ma: 0, Vận: 0 }, {}, false, 'Ma').reason, 'counter', 'V17: ly do la counter');
eq(botV17.vanduChooseBuff(['[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 0 }, {}, true, 'Ma').buttonText, '[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]', 'V17: khong co khac che -> lay Thuat Vang');
eq(botV17.vanduChooseBuff(['[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 0 }, {}, true, 'Ma').reason, 'thuat', 'V17: ly do la thuat');
eq(botV17.vanduChooseBuff(['[Vận] V [Vận Mệnh - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 0, Khí: 1 }, {}, true, 'Ma', null, 5).buttonText, '[Vận] V [Vận Mệnh - Vàng (Thần Thoại)]', 'V17: chi con Van thieu -> lay Van Vang');
eq(botV17.vanduChooseBuff(['[Vận] V [Vận Mệnh - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 0, Khí: 1 }, {}, true, 'Ma', null, 5).reason, 'van', 'V17: ly do la van');
eq(botV17.vanduChooseBuff(['[Khí] K [Khí Tông - Vàng (Thần Thoại)]', '[Kiếm] Y [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 1, Khí: 0 }, {}, true, 'Ma', null, 5).reason, 'khi', 'V17: chi con Khi thieu -> lay Khi Vang');
eq(botV17.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Lam]'], { Thuật: 0 }, {}, true, 'Ma'), { action: 'reroll' }, 'V17: chi tieu toan lam -> doi');
eq(botV17.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Lam]'], { Thuật: 0 }, {}, false, 'Ma').buttonText, '[Ma] M [Ma Tông - Lam]', 'V17: het luot doi -> chon Ma Lam (khac che truoc)');
eq(botV17.vanduChooseBuff(['[Ma] Ma Tôn [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 1, Khí: 1, Ma: 1 }, { 'Ma Tôn': 2 }, true, 'Ma', null, 5).buttonText, '[Ma] Ma Tôn [Ma Tông - Vàng (Thần Thoại)]', 'V17: chi tieu du -> lay trung nang sao');
eq(botV17.vanduChooseBuff(['[Ma] Ma Tôn [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 1, Khí: 1, Ma: 1 }, { 'Ma Tôn': 2 }, true, 'Ma', null, 5).reason, 'duplicate', 'V17: ly do la duplicate');
eq(botV17.vanduChooseBuff(['[Ma] Ma Tôn [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 5, Vận: 1, Khí: 1, Ma: 1 }, { 'Ma Tôn': 5 }, false, 'Ma', null, 5).buttonText, '[Kiếm] K [Kiếm Tông - Lam]', 'V17: trung da nang 4 lan (5 lan chon) -> khong nang nua, lay buff con lai');
eq(botV17.vanduChooseBuff(['[Ma] M [Ma Tông - Vàng (Thần Thoại)]', '[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]'], { Thuật: 0 }, {}, true, 'Ma', null, 5).buttonText, '[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]', 'V17: du luot khac che -> khac che khong chen nua, lay Thuat Vang');
eq(botV17.vanduChooseBuff(['[Thuật] T [Thuật Tông - Vàng (Thần Thoại)]', '[Ma] M [Ma Tông - Lam]'], { Thuật: 5 }, {}, false, 'Ma', null, 0).buttonText, '[Ma] M [Ma Tông - Lam]', 'V17: Thuat du 5 -> Thuat Vang khong phai chi tieu, lay Ma Lam khac che');
eq(botV17.vanduChooseBuff(['[Ma] M [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Lam]', '[Kiếm] K [Kiếm Tông - Lam]'], { Thuật: 0 }, { 'K': 1 }, true, 'Ma').buttonText, '[Kiếm] K [Kiếm Tông - Lam]', 'V17: chi tieu toan lam + co trung -> lay trung truoc khi doi');
eq(botV17.vanduChooseBuff(['[Vận] V [Vận Mệnh - Tím (Cực Phẩm)]', '[Thuật] T [Thuật Tông - Lam]'], { Thuật: 0, Vận: 0 }, {}, true, 'Ma'), { action: 'reroll' }, 'V17: Van tim khong phai chi tieu (Van can vang) -> doi, khong lay Van Tim');
