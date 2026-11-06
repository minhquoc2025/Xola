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
eq(bot.vanduChooseDoor(['Tử Môn'], null), 'Tử Môn', 'V18: no circuit: chi co Tu -> Tu la lua chon cuoi, bam luon thay vi dung im');

// Circuit parsing
eq(bot.vanduParseCircuit('Mạch Tương Sinh: [Mộc] → [Hỏa] → [?] → [?]'), { type: 'sinh', elements: ['Mộc', 'Hỏa'], last: 'Hỏa', fromProgress: true }, 'parse sinh progress');
eq(bot.vanduParseCircuit('Mạch Tương Khắc, định vị khởi đầu tại hành Thổ'), { type: 'khac', elements: ['Thổ'], last: 'Thổ', fromProgress: false }, 'parse khac start');

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
eq(bot.vanduShopAction(3, false, true), 'bi-tich', 'V44: du 3 dan, da bam Bi Tich van bam tiep, khong roi');
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
eq(bot.vanduChooseDoor(['Khai Môn', 'Kinh Môn'], { type: 'khac', last: 'Hỏa' }), 'Kinh Môn', 'circuit tie Kim: Kinh truoc Khai (da chot v18)');
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
// V30 (anh 2026-11-05, bang Tiet 7/36): tho co "Càn đạo biến hóa" thì
// chon Cửa Càn — khong phai Hoa (chu "hóa" trong "biến hóa" gay nham).
eq(bot.vanduPuzzleElement('Tiết Điểm 7/36: ĐỖ MÔN — Bát Quái Trận Đố\n📜 "Ngược nhìn trần động phủ thấy đồ hình tinh tú luân chuyển: Càn đạo biến hóa, các chinh tinh mệnh, chín tầng mây xanh cuồng khí trướng tổn!"'), 'Càn', 'V30: tho Can dao -> Can');
eq(bot.vanduPuzzleDoor('Càn'), 'Càn', 'V30: Can -> Cua Can');
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
eq(bot.vanduChooseDoor(['Khai Môn', 'Hưu Môn'], null), 'Khai Môn', 'V18: no circuit: Khai truoc Huu (thu tu moi)');
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

// V18 (2026-11-05): thu tu cua moi Thuong -> Sinh -> Canh -> Kinh -> Khai -> Do -> Huu -> Tu.
eq(bot.vanduChooseDoor(['Đỗ Môn', 'Hưu Môn'], null), 'Đỗ Môn', 'V18: no circuit: Do truoc Huu');
eq(bot.vanduChooseDoor(['Hưu Môn', 'Tử Môn'], null), 'Hưu Môn', 'V18: no circuit: Huu truoc Tu');
eq(bot.vanduChooseDoor(['Tử Môn', 'Đỗ Môn', 'Hưu Môn'], null), 'Đỗ Môn', 'V18: no circuit: Do thang ca Huu va Tu');

// V19 (2026-11-05): Ky Ngo bam nut xanh la — nhan dien mau nen Discord.
eq(botV17.vanduIsGreenColor('rgb(35, 165, 90)'), true, 'V19: xanh la Discord #23a55a');
eq(botV17.vanduIsGreenColor('rgba(35, 165, 90, 1)'), true, 'V19: xanh la rgba');
eq(botV17.vanduIsGreenColor('rgb(218, 55, 60)'), false, 'V19: do khong phai xanh');
eq(botV17.vanduIsGreenColor('rgb(88, 101, 242)'), false, 'V19: tim blurple khong phai xanh');
eq(botV17.vanduIsGreenColor('rgb(78, 80, 88)'), false, 'V19: xam khong phai xanh');
eq(botV17.vanduIsGreenColor('rgba(35, 165, 90, 0)'), false, 'V19: trong suot khong tinh');
eq(botV17.vanduIsGreenColor(''), false, 'V19: khong co mau -> false');

// V20 (2026-11-05, man Tiet 2/36): game bao "Chua khai mo" thi mach khong ton tai.
eq(botV17.vanduParseCircuit('Trận Đồ Ngũ Hành\nMạch Tương Sinh: ❓ Chưa khai mở — Hãy chọn một Môn Hộ để định vị Thiên Cơ!'), { type: 'sinh', elements: [], last: null, notOpened: true }, 'V20: parse Chua khai mo');
eq(botV17.vanduMergeCircuit({ type: 'sinh', elements: ['Hỏa', 'Thổ'], last: 'Thổ' }, { type: 'sinh', elements: [], last: null, notOpened: true }), null, 'V20: merge Chua khai mo -> xoa mach cu');
eq(botV17.vanduMergeCircuit({ type: 'sinh', elements: ['Hỏa'], last: 'Hỏa' }, null), { type: 'sinh', elements: ['Hỏa'], last: 'Hỏa' }, 'V20: merge man khong nhac mach -> giu nguyen');
eq(botV17.vanduChooseDoor(['Cảnh Môn [Hỏa]', 'Sinh Môn [Thổ]', 'Đỗ Môn [Mộc]'], null), 'Sinh Môn [Thổ]', 'V20: man Tiet 2 chua mo mach -> uu tien Sinh (Thuong vang)');
eq(botV17.vanduIsBuffCard('Hòa'), false, 'V20: nut rac ten nguoi choi khong phai the buff');
eq(botV17.vanduIsBuffCard('!vandu'), false, 'V20: nut rac lenh khong phai the buff');
eq(botV17.vanduIsBuffCard('Xỏ lá ba que'), false, 'V20: nut rac danh hieu khong phai the buff');
eq(botV17.vanduIsBuffCard('[Ma] 🖤 Ma Hóa Cuồng Nộ'), true, 'V20: the Ma that');
eq(botV17.vanduIsBuffCard('[Thuật] Tụ Khí Hoàn'), true, 'V20: the Thuat that');

// V21 (2026-11-05, man Tiet 8/36 Ky Duyen Mon): gap bang cuoc Ngan Luong
// thi bam nut an toan, khong cuoc tat tay. Kiem tra nhan dien nut.
eq(botV17.vanduNormalize('🚶 Bỏ qua đi tiếp an toàn').includes('bo qua di tiep an toan'), true, 'V21: nhan dien nut an toan Ky Duyen Mon');
eq(botV17.vanduNormalize('🎰 CẢ ĐỘ TẤT TAY (x2.5 hoặc mất sạch)').includes('bo qua di tiep an toan'), false, 'V21: nut cuoc khong nham voi nut an toan');

// V22 (2026-11-05, man Tiet 10/36): Khac neo Moc 1/5, cua Sinh la Tho, bot phai chon Sinh.
eq(botV17.vanduParseCircuit('Mạch Tương Khắc: [✓ Mộc] → [? ❓] → [? ❓] → [? ❓] → [? ❓](Tiến độ: 1/5)'), { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'V22: parse tick Moc');
eq(botV17.vanduParseCircuit('Mạch này là TƯƠNG KHẮC, định vị khởi đầu tại hành MỘC.'), { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: false }, 'V22: parse neo viet hoa');
botV17.vanduCircuitMsgId = 'M1';
eq(botV17.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ', 'Thủy'], last: 'Thủy' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M2'), { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'V22: man moi tin game, sua lech ve Moc');
eq(botV17.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M1'), { type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, 'V22: man cu quet lai giu mach dai (v11)');
botV17.vanduCircuitMsgId = 'M1';
eq(botV17.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Kim'], last: 'Kim', fromProgress: false }, 'M2'), { type: 'khac', elements: ['Kim'], last: 'Kim', fromProgress: false }, 'V22: man moi neo don la mach moi');
eq(botV17.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: [], last: null, fromProgress: false }, 'M2'), { type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, 'V22: man moi khong co thong tin mach -> giu nguyen');
eq(botV17.vanduChooseDoor(['Sinh Môn', 'Hưu Môn', 'Khai Môn'], { type: 'khac', elements: ['Mộc'], last: 'Mộc' }), 'Sinh Môn', 'V22: Khac sau Moc can Tho -> Sinh Mon');

// V23 (2026-11-05, log 09:40:58): bam cuoi chuyen co thu lai, khong con
// thu 1 lan roi dung nhu v16-v22.
(async () => {
  const mk = () => { const b = new NpcBot({ executeJavaScript() {} }, 1); b.isRunning = true; b.delay = async () => {}; b.log = () => {}; return b; };
  const b1 = mk();
  let n1 = 0;
  b1.vanduClickButton = async () => (++n1 === 2 ? 'Trở Về Giang Hồ' : null);
  b1.vanduClickExactText = async () => null;
  b1.vanduScanLatest = async () => ({ text: 'Bấm Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] });
  eq(await b1.vanduClickTripEndButton(), 'Trở Về Giang Hồ', 'V23: lan 2 bam duoc');
  const b2 = mk();
  b2.vanduClickButton = async () => null;
  b2.vanduClickExactText = async () => null;
  b2.vanduScanLatest = async () => ({ text: 'Trở Về Giang Hồ', buttons: ['Trở Về Giang Hồ'] });
  eq(await b2.vanduClickTripEndButton(), null, 'V23: het 5 lan, nut van con -> null');
  const b3 = mk();
  b3.vanduClickButton = async () => null;
  b3.vanduClickExactText = async () => null;
  b3.vanduScanLatest = async () => ({ text: 'man khac', buttons: ['Sinh Môn'] });
  eq(await b3.vanduClickTripEndButton(), 'gone', 'V23: nut bien mat giua chung -> gone');
  console.log('V23 trip-end retry: OK');
})().catch(e => { console.error(e); process.exit(1); });

// V24: Số lần đi Vân Du như Luân Hồi — đủ N thì dừng, chưa đủ thì chạy tiếp.
// Giới hạn 0 = chỉ 1 chuyến rồi dừng (không chạy vô hạn như Luân Hồi).
const botV24 = new NpcBot({ executeJavaScript() {} }, 1);
botV24.vanduTripCount = 0; botV24.vanduTotalTrips = 0;
eq(botV24.vanduShouldRestartTrips(), false, 'V24: gioi han 0, moi 0 chuyen -> dung sau 1');
botV24.vanduTripCount = 1; botV24.vanduTotalTrips = 0;
eq(botV24.vanduShouldRestartTrips(), false, 'V24: gioi han 0, xong 1 chuyen -> dung');
botV24.vanduTripCount = 1; botV24.vanduTotalTrips = 5;
eq(botV24.vanduShouldRestartTrips(), true, 'V24: 1/5 -> chay tiep');
botV24.vanduTripCount = 5; botV24.vanduTotalTrips = 5;
eq(botV24.vanduShouldRestartTrips(), false, 'V24: 5/5 -> dung');

// V25 (2026-11-05, man Tiet 11/36 Ky Ngo That Thai Ho Diep): gap bang
// nay thi bam Tinh toa giao cam, khong bam Bat buom. Kiem tra nhan dien nut.
eq(botV24.vanduNormalize('🧘 Tĩnh tọa giao cảm (Tốn 15% HP)').includes('tinh toa giao cam'), true, 'V25: nhan dien nut Tinh toa giao cam');
eq(botV24.vanduNormalize('🦋 Bắt bướm').includes('tinh toa giao cam'), false, 'V25: nut Bat buom khong nham voi Tinh toa');

// V26 (2026-11-05): buff cu nang sao thang buff moi lam/luc. Truong hop
// loi cu: ro dau la Ma moi Lam, ro sau co Thuat Tim (hasGood true) nen
// bot lay Ma moi Lam, bo qua buff cu. Gio phai lay buff cu.
eq(botV24.vanduChooseBuff(['[Ma] Mới [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Tím (Cực Phẩm)]', '[Kiếm] Cũ [Kiếm Tông - Lam]'], {}, { 'Cũ': 2 }, true, 'Ma').buttonText, '[Kiếm] Cũ [Kiếm Tông - Lam]', 'V26: cu thang moi Lam khi ro dau la moi Lam');
eq(botV24.vanduChooseBuff(['[Ma] Mới [Ma Tông - Lam]', '[Thuật] T [Thuật Tông - Tím (Cực Phẩm)]', '[Kiếm] Cũ [Kiếm Tông - Lam]'], {}, { 'Cũ': 2 }, true, 'Ma').reason, 'duplicate', 'V26: ly do la duplicate');
// Buff moi Vang o ro dau thi van thang buff cu (khong doi).
eq(botV24.vanduChooseBuff(['[Ma] Mới [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] Cũ [Kiếm Tông - Lam]'], {}, { 'Cũ': 2 }, true, 'Ma').buttonText, '[Ma] Mới [Ma Tông - Vàng (Thần Thoại)]', 'V26: moi Vang van thang cu');
// Ro dau khong ro do hiem (0) thi van lay nhu cu, khong coi la thap.
eq(botV24.vanduChooseBuff(['[Ma] Mới [Ma Tông]', '[Kiếm] Cũ [Kiếm Tông - Lam]'], {}, { 'Cũ': 2 }, true, 'Ma').buttonText, '[Ma] Mới [Ma Tông]', 'V26: moi khong ro do hiem van thang cu');

// V27: bang Tiet 7/36 (anh bao) — nut T2 khong ghi tong, ten bi cat ngan.
// Ten chuan hoa: bo emoji/ky hieu va tien to T2.
eq(bot.vanduNormalizeBuffName(bot.vanduParseBuffCard('⬆️T2 ★★ Huyết Tế Đoạt M').name), 'Huyết Tế Đoạt M', 'V27: ten T2 chuan hoa');
eq(bot.vanduNormalizeBuffName(bot.vanduParseBuffCard('🔵[Ma] 💀 Huyết Tế Đoạt Mện').name), 'Huyết Tế Đoạt Mện', 'V27: ten thuong chuan hoa');
eq(bot.vanduNormalizeBuffName('Thái Ất'), 'Thái Ất', 'V27: ten thuong khong doi');
// Nut T2 khong ghi tong van la the (truoc day bi loc mat).
eq(bot.vanduIsBuffCard('⬆️T2 ★★ Huyết Tế Đoạt M'), true, 'V27: nut T2 la the');
eq(bot.vanduIsBuffCard('Mew'), false, 'V27: nut ten nguoi khong phai the');
// Bang Tiet 7: co ban T2 Huyet Te (da so huu tu bang truoc) ma bot cu
// chon xanh luc Thon Huyet Ma Con — gio phai chon nang cap T2.
eq(bot.vanduChooseBuff(['⬆️T2 ★★ Nhất Kiếm Trảm', '⬆️T2 ★★ Huyết Tế Đoạt M', '[Ma] Thôn Huyết Ma Côn [Ma Tông - Lục (Phổ Thông)]', '[Vận] Thiên Cơ Đồ Lục [Vận Mệnh - Tím (Cực Phẩm)]'], { Kiếm: 1, Khí: 2, Thuật: 0, Ma: 3 }, { 'Huyết Tế Đoạt Mệnh': 1 }, false, 'Ma').buttonText, '⬆️T2 ★★ Huyết Tế Đoạt M', 'V27: bang Tiet 7 -> nang cap T2 thay vi xanh luc');
eq(bot.vanduChooseBuff(['⬆️T2 ★★ Nhất Kiếm Trảm', '⬆️T2 ★★ Huyết Tế Đoạt M', '[Ma] Thôn Huyết Ma Côn [Ma Tông - Lục (Phổ Thông)]', '[Vận] Thiên Cơ Đồ Lục [Vận Mệnh - Tím (Cực Phẩm)]'], { Kiếm: 1, Khí: 2, Thuật: 0, Ma: 3 }, { 'Huyết Tế Đoạt Mệnh': 1 }, false, 'Ma').reason, 'duplicate', 'V27: ly do la duplicate');
// Tong theo mo ta bang (nut T2 khong ghi tong): muc 1 Kiem, muc 2 Ma, muc 3 Ma, muc 4 Van.
const tiet7Text = '1. ⬆️ ★★ [CHÂN TRUYỀN] 🗡️ Nhất Kiếm Trảm Tiên [Kiếm Tông] • Đột phá lên Bậc 2\n2. ⬆️ ★★ [CHÂN TRUYỀN] 💀 Huyết Tế Đoạt Mệnh [Ma Tông] • Đột phá lên Bậc 2\n3. [Ma] 🩸 Thôn Huyết Ma Côn [Ma Tông - 🟢 Lục (Phổ Thông)] • Hút máu +10%\n4. [Vận] 📜 Thiên Cơ Đồ Lục [Vận Mệnh - 🟣 Tím (Cực Phẩm)] • Được Reroll';
const tiet7Btns = ['⬆️T2 ★★ Nhất Kiếm Trảm', '⬆️T2 ★★ Huyết Tế Đoạt M', '[Ma] Thôn Huyết Ma Côn', '[Vận] Thiên Cơ Đồ Lục'];
eq(bot.vanduBuffSects(tiet7Text, tiet7Btns), ['Kiếm', 'Ma', 'Ma', 'Vận'], 'V27: tong theo mo ta bang');
eq(bot.vanduChooseBuff(['⬆️T2 ★★ Huyết Tế Đoạt M', '[Kiếm] K [Kiếm Tông - Lam]'], {}, {}, false, 'Ma', null, 0, bot.vanduBuffSects(tiet7Text, tiet7Btns).slice(1, 2).concat(['Kiếm'])).buttonText, '⬆️T2 ★★ Huyết Tế Đoạt M', 'V27: T2 lay tong Ma tu mo ta -> khac che');
// V27: nhan dien man Ky Ngo — recap "Ho Phap dap le" khong du.
eq(bot.vanduIsKyNgoScreen('tiet diem 10 36 ky duyen mon cua vang sang ruc ho phap dap le than hanh phu 1 buff vo dinh tang cuong', ['bo qua di tiep an toan']), false, 'V27: Ky Duyen co chu Ho Phap khong phai Ky Ngo');
eq(bot.vanduIsKyNgoScreen('tiet diem 11 36 ky ngo ho phap phong thap co', ['dang huong']), true, 'V27: Ky Ngo co nut Dang huong');
eq(bot.vanduIsKyNgoScreen('tiet diem 11 36 ky ngo that thai ho diep van menh', ['tinh toa giao cam']), true, 'V27: Ky Ngo theo tieu de tiet diem');
eq(bot.vanduIsKyNgoScreen('tiet diem 10 36 canh mon tien thuong hac thi ho phap dap le', ['mua cuu chuyen hoan hon dan']), false, 'V27: man shop co chu Ho Phap khong phai Ky Ngo');
// V27: HP nguoi choi tu muc Dien Bien — khong lay HP quai 89%.
eq(bot.vanduPlayerHpPct('Linh Tuyền Thủ Thú [Hư Ảo] Băng Tuyết Đa Bảo: 840.364.197/943.248.306 HP (89%)\nDiễn Biến Hiệp Đấu\nHiệp cái: 275712739/505600508'), 55, 'V27: HP nguoi choi tu Dien Bien');
eq(bot.vanduPlayerHpPct('Diễn Biến Hiệp Đấu\nHiệp cái: 250000/500000'), 50, 'V27: HP 50% dung nguong hoi mau');
eq(bot.vanduPlayerHpPct('Tiết Điểm 12/36'), null, 'V27: Tiet Diem khong phai HP');
eq(bot.vanduPlayerHpPct('Tiết Điểm 12/36\nKhí Huyết: 42%'), 42, 'V27: fallback Khi Huyet');
console.log('ALL VANDU TESTS PASSED');

// V28: bang anh 2026-11-05 — do hiem ghi "[Vận Mệnh - Vàng (Thần Thoại)]",
// khong co "• Vàng" nhu bang cu nen cach doc cu ra 0 ket qua.
const shot28Text = '1. [Vận] Đại Đạo Đồng Quy [Vận Mệnh - 🟡 Vàng (Thần Thoại)]\n• Hiệu ứng: Tăng toàn bộ thuộc tính cơ bản thêm 25% và tăng 15% Tỉ Lệ Bạo Kích.\n2. [Ma] Ma Tôn Giáng Thế [Ma Tông - 🟡 Vàng (Thần Thoại)]\n• Hiệu ứng: Mỗi đòn cướp 5% Công/Thủ của địch, +30% Tấn Công và +20% Phòng Thủ!\n3. [Kiếm] Bạt Kiếm Thuật [Kiếm Tông - 🟢 Lục (Phổ Thông)]\n• Hiệu ứng: Tăng 12% Tỉ Lệ Bạo Kích trong suốt chuyến thám hiểm.\n4. [Ma] Tuyệt Đối Tập Kích [Ma Tông - 🔵 Lam (Hiếm)]\n• Hiệu ứng: Đòn đánh 100% trúng đích, +25% Chính Xác và +15% Tấn Công.';
const shot28Btns = ['[Vận] Đại Đạo Đồng Quy', '[Ma] Ma Tôn Giáng Thế', '[Kiếm] Bạt Kiếm Thuật', '[Ma] Tuyệt Đối Tập Kích'];
eq(bot.vanduBuffRarities(shot28Text, shot28Btns), [4, 4, 1, 2], 'V28: do hiem kieu moi trong [Vận Mệnh - Vàng]');
eq(bot.vanduBuffSects(shot28Text, shot28Btns), ['Vận', 'Ma', 'Kiếm', 'Ma'], 'V28: tong theo mo ta bang anh');
eq(bot.vanduChooseBuff(shot28Btns, {}, {}, false, 'Ma', bot.vanduBuffRarities(shot28Text, shot28Btns), 0, bot.vanduBuffSects(shot28Text, shot28Btns)).buttonText, '[Ma] Ma Tôn Giáng Thế', 'V28: khac che Ma -> Ma Vang, khong phai Ma Lam');
eq(bot.vanduChooseBuff(shot28Btns, {}, {}, false, 'Ma', bot.vanduBuffRarities(shot28Text, shot28Btns), 0, bot.vanduBuffSects(shot28Text, shot28Btns)).reason, 'counter', 'V28: ly do la counter');
// Lam dung truoc Vang trong cung tong Ma: cu chi doc "• mau" thi ca 2 ve 0,
// lay theo thu tu nut se lay nham Lam.
const shot28bText = '1. [Ma] Tuyệt Đối Tập Kích [Ma Tông - 🔵 Lam (Hiếm)]\n• Hiệu ứng: Đòn đánh 100% trúng đích.\n2. [Ma] Ma Tôn Giáng Thế [Ma Tông - 🟡 Vàng (Thần Thoại)]\n• Hiệu ứng: Mỗi đòn cướp 5% Công/Thủ của địch.\n3. [Vận] Đại Đạo Đồng Quy [Vận Mệnh - 🟡 Vàng (Thần Thoại)]\n• Hiệu ứng: Tăng toàn bộ thuộc tính.\n4. [Kiếm] Bạt Kiếm Thuật [Kiếm Tông - 🟢 Lục (Phổ Thông)]\n• Hiệu ứng: Tăng 12% Tỉ Lệ Bạo Kích.';
const shot28bBtns = ['[Ma] Tuyệt Đối Tập Kích', '[Ma] Ma Tôn Giáng Thế', '[Vận] Đại Đạo Đồng Quy', '[Kiếm] Bạt Kiếm Thuật'];
eq(bot.vanduBuffRarities(shot28bText, shot28bBtns), [2, 4, 4, 1], 'V28: do hiem khi Lam dung truoc Vang');
eq(bot.vanduChooseBuff(shot28bBtns, {}, {}, false, 'Ma', bot.vanduBuffRarities(shot28bText, shot28bBtns), 0, bot.vanduBuffSects(shot28bText, shot28bBtns)).buttonText, '[Ma] Ma Tôn Giáng Thế', 'V28: Ma Vang thang Ma Lam du dung sau');
// Khong co the khac che: lay Van Vang.
eq(bot.vanduChooseBuff(shot28Btns, {}, {}, false, 'Thuật', bot.vanduBuffRarities(shot28Text, shot28Btns), 0, bot.vanduBuffSects(shot28Text, shot28Btns)).buttonText, '[Vận] Đại Đạo Đồng Quy', 'V28: khong co khac che -> Van Vang');
eq(bot.vanduChooseBuff(shot28Btns, {}, {}, false, 'Thuật', bot.vanduBuffRarities(shot28Text, shot28Btns), 0, bot.vanduBuffSects(shot28Text, shot28Btns)).reason, 'van', 'V28: ly do la van');
console.log('ALL VANDU TESTS PASSED (V28)');

// V29 (2026-11-05, lỗi "Không phải lượt của bạn!" 15:11): đã nhập User ID
// thì chỉ quét/bấm màn của mình — không rơi xuống lượt "mọi article" nữa.
(async () => {
  const mk = (userId) => {
    const seen = [];
    const b = new NpcBot({ executeJavaScript: (code) => { seen.push(String(code)); return null; } }, 1);
    b.userId = userId || '';
    b.isRunning = true; b.delay = async () => {}; b.log = () => {};
    return { b, seen };
  };
  const s1 = mk('1477145807366131744');
  await s1.b.vanduScanLatest();
  const scanJs = s1.seen.join('\n');
  eq(scanJs.includes('passes = userId ? [true] : [false]'), true, 'V29: scan co ID chi quet owned');
  eq(scanJs.includes('[true, false]'), false, 'V29: scan co ID khong con luot moi article');
  const s2 = mk('');
  await s2.b.vanduScanLatest();
  eq(s2.seen.join('\n').includes('passes = userId ? [true] : [false]'), true, 'V29: scan khong ID giu fallback cu');
  const c1 = mk('1477145807366131744');
  await c1.b.vanduClickButton('Khai Môn');
  const clickJs = c1.seen.join('\n');
  eq(clickJs.includes('passes = userId ? [true] : [false]'), true, 'V29: click co ID chi bam owned');
  eq(clickJs.includes('[true, false]'), false, 'V29: click co ID khong con luot moi article');
  eq(clickJs.includes("closest('[role=\"article\"]')"), true, 'V29: Anywhere co guard article');
  const e1 = mk('1477145807366131744');
  await e1.b.vanduClickExactText('Trở Về Giang Hồ');
  eq(e1.seen.join('\n').includes("closest('[role=\"article\"]')"), true, 'V29: ExactText co guard article');
  console.log('V29 ownership guards: OK');
})().catch(e => { console.error(e); process.exit(1); });
console.log('ALL VANDU TESTS PASSED (V29)');

// V31 (anh 2026-11-05, bang Tiet 8/36 Ky Ngo Cuong Nhan Doan Dinh):
// gap bang cuoc thi bam "Bỏ qua", khong cuoc 50k/tat tay.
eq(bot.vanduKyNgoSkipButton('tiet diem 8 36 ky ngo cuong nhan doan dinh', ['dat 50k thap', 'dat cuoc tat tay 150k', 'bo qua']), 'Bỏ qua', 'V31: bang cuoc Ky Ngo -> Bo qua');
eq(bot.vanduKyNgoSkipButton('tiet diem 10 36 ky duyen mon cua vang sang ruc', ['ca do tat tay x2 5 hoac mat sach', 'bo qua di tiep an toan']), null, 'V31: Ky Duyen dung nut "Bo qua di tiep an toan", khong cuop luot');
eq(bot.vanduKyNgoSkipButton('tiet diem 11 36 ky ngo ho phap phong thap co', ['dang huong']), null, 'V31: Ho Phap khong co nut Bo qua');
eq(bot.vanduKyNgoSkipButton('tiet diem 5 36 cua canh mon tien thuong hac thi', ['bo qua', 'mua cuu chuyen hoan hon dan']), null, 'V31: man khong phai Ky Ngo thi khong bam Bo qua');
console.log('ALL VANDU TESTS PASSED (V31)');

// V32 (log 2026-11-05 15:30:37-59, Tiet 16/36): bot bam Tu Mon (Tho)
// nhung cu bam khong vao game — man khong doi, game van ghi Khac 1/5
// [Moc] — ma bot tu tien len [Moc, Tho] roi ket "can Thuy" trong khi
// Tu Mon van con tren man. Gio quet lai cung man ma tien do game ngan
// hon thi tra mach ve theo game de bam lai cua do.
const botV32 = new NpcBot({ executeJavaScript() {} }, 1);
botV32.vanduCircuitMsgId = 'M1';
botV32.vanduLastCircuitClick = { msgId: 'M1', element: 'Thổ', count: 1 };
eq(botV32.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M1'), { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'V32: cung man, bam Tho chua vao -> tra ve Moc de bam lai');
botV32.vanduLastCircuitClick = null;
eq(botV32.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M1'), { type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, 'V32: khong co ban ghi bam thi giu luat v22 (man cu khong tut)');
botV32.vanduLastCircuitClick = { msgId: 'M1', element: 'Kim', count: 1 };
eq(botV32.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M1'), { type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, 'V32: buoc thua khong phai hanh vua bam thi khong tra');
botV32.vanduLastCircuitClick = { msgId: 'M9', element: 'Thổ', count: 1 };
eq(botV32.vanduMergeCircuit({ type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, { type: 'khac', elements: ['Mộc'], last: 'Mộc', fromProgress: true }, 'M1'), { type: 'khac', elements: ['Mộc', 'Thổ'], last: 'Thổ' }, 'V32: bam tren man khac thi khong tra');
console.log('ALL VANDU TESTS PASSED (V32)');

// V33 (anh 2026-11-05): buff nang max khong hien lai tren bang — khong
// con truong hop "ca bang toan la max" de bam tam 1 la cho qua bang.
const botV33 = new NpcBot({ executeJavaScript() {} }, 1);
eq(botV33.vanduChooseBuff(['[Ma] Ma Tôn Giáng Thế [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] Bạt Kiếm Thuật [Kiếm Tông - Lục (Phổ Thông)]'], {}, { 'Ma Tôn Giáng Thế': 5, 'Bạt Kiếm Thuật': 5 }, false, null), null, 'V33: ca bang da max theo so bot -> null, khong bam tam');
eq(botV33.vanduChooseBuff(['[Ma] Ma Tôn Giáng Thế [Ma Tông - Vàng (Thần Thoại)]', '[Kiếm] Bạt Kiếm Thuật [Kiếm Tông - Lục (Phổ Thông)]'], {}, { 'Ma Tôn Giáng Thế': 5 }, false, null).buttonText, '[Kiếm] Bạt Kiếm Thuật [Kiếm Tông - Lục (Phổ Thông)]', 'V33: la max bi loai khoi con lai, chon la chua max');
console.log('ALL VANDU TESTS PASSED (V33)');

// V34 (anh 2026-11-05, bang Tiet 11/36 Ky Ngo Doc Kiem Tien Tan hon):
// chon o xanh "Cuu mang tien boi", khong doat kiem, khong roi di.
eq(bot.vanduKyNgoRescueButton('tiet diem 11 36 ky ngo doc kiem tien tan hon', ['cuu mang tien boi', 'thua co doat kiem', 'tram mac roi di']), 'Cứu mạng tiền bối', 'V34: bang Doc Kiem Tien -> Cuu mang tien boi');
eq(bot.vanduKyNgoRescueButton('tiet diem 11 36 ky ngo ho phap phong thap co', ['dang huong']), null, 'V34: Ho Phap khong co nut Cuu mang');
eq(bot.vanduKyNgoRescueButton('tiet diem 8 36 ky ngo cuong nhan doan dinh', ['dat 50k thap', 'dat cuoc tat tay 150k', 'bo qua']), null, 'V34: bang cuoc khong co nut Cuu mang');
eq(bot.vanduKyNgoRescueButton('tiet diem 5 36 cua canh mon tien thuong hac thi', ['cuu mang tien boi', 'mua cuu chuyen hoan hon dan']), null, 'V34: man khong phai Ky Ngo thi khong bam');
console.log('ALL VANDU TESTS PASSED (V34)');

// V36 (anh 2026-11-06, log 22:33:14): cau do chua doc duoc dap an thi
// chon ngau nhien 1 cua thay vi dung — can loc dung cac nut cua que.
eq(bot.vanduPuzzleDoorButtons(['Cửa Càn', 'Cửa Khôn', 'Cửa Tốn', 'Bắt Đầu Xuất Phát']), ['Cửa Càn', 'Cửa Khôn', 'Cửa Tốn'], 'V36: loc nut cua que, loai nut khac');
eq(bot.vanduPuzzleDoorButtons(['Cửa Ly', 'Cửa Chấn']), ['Cửa Ly', 'Cửa Chấn'], 'V36: loc Ly/Chan');
eq(bot.vanduPuzzleDoorButtons(['Mua Cửu Chuyển', 'Rời đi']), [], 'V36: khong co nut cua que');
console.log('ALL VANDU TESTS PASSED (V36)');

// V38 (anh 2026-11-06, log 08:51:50): man Khoi Dau Tiet 1/36 khong nhac
// gi toi mach — mach bot dang giu la mach cu da reset; phai xoa mach
// va chon theo thu tu uu tien luc chua co mach (Sinh trong [Canh, Sinh, Do]).
eq(bot.vanduParseCircuit('Khởi Đầu Hành Trình: Tiết Điểm 1/36 — Thiên Sơn Tuyết Lãnh\nHãy chọn 1 cửa để dần bước vào hành trình 36 Tiết Điểm:\nBản Đồ Thiên Cơ (Tầm Nhìn 3 Bước)\n[Vị Trí Hiện Tại: Tiết Điểm 1/36]'), null, 'V38: man Khoi Dau khong nhac mach -> parse null');
eq(bot.vanduChooseDoor(['🏺 Cảnh Môn', '🌿 Sinh Môn', '🌀 Đỗ Môn'], null), '🌿 Sinh Môn', 'V38: chua co mach, trong [Canh, Sinh, Do] thi chon Sinh');
console.log('ALL VANDU TESTS PASSED (V38)');

// V39 (anh chot 2026-11-06): 3 case trong vanduShopAction giu nguyen —
// test cu (dong 67-70) da khoa san; reset co mua shop khi thay man cua
// la logic vong lap, khong test truc tiep o day.
console.log('ALL VANDU TESTS PASSED (V39)');

// V40 (anh 2026-11-06): khoang nghi giua cac cu bam skill trong tran
// Van Du +1s (1s -> 2s, skillGapMs), chi Van Du — skillClickDelayMs
// chung cho ca Luan Hoi/Bicanh nen khong doi mac dinh chung. La logic
// vong lap nen khong test truc tiep o day, can test tay tren Discord.
console.log('ALL VANDU TESTS PASSED (V40)');

// V41 (anh 2026-11-06): tran moi bam lai skill tu dau theo config
// (reset vanduSkillIdx o dau vanduBattleLoop) — truoc day chi reset
// dau chuyen nen tran sau bam tiep dien. La logic vong lap nen khong
// test truc tiep o day, can test tay: qua Tiet moi, skill dau tien
// bam phai la skill dau trong config.
console.log('ALL VANDU TESTS PASSED (V41)');

// V42 (anh 2026-11-06): so dan dong bo theo so nut vat pham tren man
// battle (1 nut = 1 dan dang co) — xai roi so dan tut, shop sau mua
// tiep. La logic vong tran nen khong test truc tiep o day; test tay:
// xai dan trong tran (log dong bo), vao shop sau thay bot mua lai.
console.log('ALL VANDU TESTS PASSED (V42)');

// V43 (anh 2026-11-06, bang Tiet 16/36 Ky Ngo Tien Tu Tra Huu):
eq(bot.vanduKyNgoTeaButton('tiet diem 16 36 ky ngo tien tu tra huu', ['thuong tra', 'khong uong', 'doat am tra']), 'Thưởng trà', 'V43: bang tra Ky Ngo -> Thuong tra');
eq(bot.vanduKyNgoTeaButton('tiet diem 16 36 ky ngo tien tu tra huu', ['khong uong', 'doat am tra']), null, 'V43: khong co nut Thuong tra');
eq(bot.vanduKyNgoTeaButton('tiet diem 10 36 ky duyen mon cua vang sang ruc', ['thuong tra']), null, 'V43: man khong phai Ky Ngo thi khong bam Thuong tra');
// V43 (anh 2026-11-06): Ky Ngo chua biet cu bam o xanh la — handler
// chung v19 da lam vay: man Ky Ngo nhan dien theo tieu de thi roi
// vao nut xanh (thu lai moi vong quet), nen bang Tien Tu nay du khong
// co luat rieng van trung nut xanh; luat rieng chi de chac hon.
eq(bot.vanduIsKyNgoScreen('tiet diem 16 36 ky ngo tien tu tra huu', ['thuong tra', 'khong uong', 'doat am tra']), true, 'V43: Ky Ngo Tien Tu Tra Huu nhan dien theo tieu de');
console.log('ALL VANDU TESTS PASSED (V43)');

// V44 (anh chot 2026-11-06): du 3 dan thi cu bam Bi Tich toi khi man
// tu doi, KHONG bam roi — Bi Tich bam duoc vo han. Anh noi them: moi
// lan chi bam duoc 1 cai thoi la doi man hinh roi, nen thuong chi bam
// 1 lan; bam lap chi la du phong khi man chua doi sau cu bam. Case
// mua 1 cai roi roi (danCount < 3, boughtThisVisit) giu nguyen.
console.log('ALL VANDU TESTS PASSED (V44)');

// V45 (anh 2026-11-06, bang Tiet 21/36 Ky Ngo Hac Thi Thuong Nhan Vo Dien):
eq(bot.vanduKyNgoMerchantButton('tiet diem 21 36 ky ngo hac thi thuong nhan vo dien', ['mua thai son lac dan 50k', 'mua bich hoa bi thuat 80k', 'lo di']), 'Mua Bích Họa Bí Thuật', 'V45: bang thuong nhan Ky Ngo -> Mua Bich Hoa Bi Thuat');
eq(bot.vanduKyNgoMerchantButton('tiet diem 21 36 ky ngo hac thi thuong nhan vo dien', ['mua thai son lac dan 50k', 'lo di']), null, 'V45: khong co nut Bich Hoa');
eq(bot.vanduKyNgoMerchantButton('tiet diem 10 36 ky duyen mon cua vang sang ruc', ['mua bich hoa bi thuat 80k']), null, 'V45: man khong phai Ky Ngo thi khong mua Bich Hoa');
eq(bot.vanduIsKyNgoScreen('tiet diem 21 36 ky ngo hac thi thuong nhan vo dien', ['mua thai son lac dan 50k', 'mua bich hoa bi thuat 80k', 'lo di']), true, 'V45: Ky Ngo Thuong Nhan nhan dien theo tieu de');
console.log('ALL VANDU TESTS PASSED (V45)');

// V46 (anh 2026-11-06): hoi mau khong gioi han 1 lan/tran nua — mau
// <= 50% thi xai dan, danh tiep ma tut duoi 50% nua thi xai tiep;
// gioi han la so dan dang co (toi da 3, dong bo v42). La logic vong
// tran nen khong test truc tiep o day; test tay: tran kho, mau tut
// duoi 50% 2 lan thi thay 2 dong hoi mau (neu con dan).
console.log('ALL VANDU TESTS PASSED (V46)');

// V47 (anh 2026-11-06, bang Tiet 8/36 Ky Ngo Tieng Khoc Tre Tho Trong Suong Mu):
eq(bot.vanduKyNgoBowButton('tiet diem 8 36 ky ngo tieng khoc tre tho trong suong mu', ['cui dau thi le']), 'Cúi đầu thi lễ', 'V47: bang tre tho Ky Ngo -> Cui dau thi le');
eq(bot.vanduKyNgoBowButton('tiet diem 8 36 ky ngo tieng khoc tre tho trong suong mu', ['dang huong']), null, 'V47: khong co nut Cui dau thi le');
eq(bot.vanduKyNgoBowButton('tiet diem 10 36 ky duyen mon cua vang sang ruc', ['cui dau thi le']), null, 'V47: man khong phai Ky Ngo thi khong bam Cui dau thi le');
eq(bot.vanduIsKyNgoScreen('tiet diem 8 36 ky ngo tieng khoc tre tho trong suong mu', ['cui dau thi le']), true, 'V47: Ky Ngo Tieng Khoc Tre Tho nhan dien theo tieu de');
// V47 (anh 2026-11-06, bang Tiet 7/36 Ky Ngo Tho San Kho Bau Trong Thuong):
eq(bot.vanduKyNgoHealHunterButton('tiet diem 7 36 ky ngo tho san kho bau trong thuong', ['cuu chua ton 50 hp', 'doat ban do', 'bo mac']), 'Cứu chữa', 'V47: bang tho san Ky Ngo -> Cuu chua');
eq(bot.vanduKyNgoHealHunterButton('tiet diem 7 36 ky ngo tho san kho bau trong thuong', ['doat ban do', 'bo mac']), null, 'V47: khong co nut Cuu chua');
eq(bot.vanduKyNgoHealHunterButton('tiet diem 10 36 ky duyen mon cua vang sang ruc', ['cuu chua ton 50 hp']), null, 'V47: man khong phai Ky Ngo thi khong bam Cuu chua');
eq(bot.vanduIsKyNgoScreen('tiet diem 7 36 ky ngo tho san kho bau trong thuong', ['cuu chua ton 50 hp', 'doat ban do', 'bo mac']), true, 'V47: Ky Ngo Tho San Kho Bau nhan dien theo tieu de');
console.log('ALL VANDU TESTS PASSED (V47)');

