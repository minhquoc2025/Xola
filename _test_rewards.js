const { NpcBot } = require('./src/main/npc-bot.js');

const REAL_MSG = `🏆 KẾT QUẢ TRẬN ĐẤU
🔱 XUYÊN 53% DEF!
⚡ Thích Anh Hiệp v2 (Lv.97) áp đảo +150% DMG!
🛡️ 🐲 Hắc Kỳ Lân Bất Khuất! Khiên 1360HP (3 lượt)!
💎 🐲 Hắc Kỳ Lân kích hoạt CHƯA CHẾT ĐÃ SỐNG LẠI! Thoát chết + hồi 4352HP!
🌊 🌊 Băng Phong
💥 5439 dmg! 💥CHÍ MẠNG!
🗡️ Kiếm Khí Hút +130 HP! (Thanh Phong Kiếm)
🌑 Choáng! 🐲 Hắc Kỳ Lân mất lượt!
🐾 Buzzwole (Buzzwole) → Pet của 🐲 Hắc Kỳ Lân (1290 dmg)
🐾 Linh Thú Hầu (Swablu) → Waifu của Thích Anh Hiệp v2 (62 dmg)

🌑 🐲 Hắc Kỳ Lân bị choáng, mất lượt!
🔱 XUYÊN 53% DEF!
⚡ Thích Anh Hiệp v2 (Lv.97) áp đảo +150% DMG!
🛡️ Khiên vỡ! Tràn 80524! +816HP hồi!
🗡️ Kiếm Khí Hút +2,898 HP! (Thanh Phong Kiếm)
💀 Thích Anh Hiệp v2 SÁT KHÍ! Hồi 55394HP + ×2 ATK 2 turn!

💀 🐲 Hắc Kỳ Lân bị xỏ lá đến chết!
🏆 Thích Anh Hiệp v2 CHIẾN THẮNG! 🎉

--------------------
🏆 Quất thắng NPC 🐲 Hắc Kỳ Lân! 🎉
💰 Quất: +350🪙 +159XP
💕 🗡️ Ác Quỷ: +318XP
🐾 Buzzwole (Buzzwole): +318XP
📖 Codex: +182🪙 (+52%)
📖 Codex: +76XP (+48%)

⚒️ Rơi: 🟡 Giày Lính Đánh Thuê!
✅ Thắng
🥇 Quất CHIẾN THẮNG!
💰 +532 🪙 ✨ +235 XP
❌ Thua
🐲 Hắc Kỳ Lân — 💀 Thất bại!
🎁 Chiến Lợi Phẩm
⚒️ Rơi: 🟡 Giày Lính Đánh Thuê!
💕 Vợ Tăng Kinh Nghiệm
💕 🗡️ Ác Quỷ: +318XP`;

const bot = new NpcBot(null, 0);
bot.log = () => {};
bot.parseBattleRewards(REAL_MSG);

console.log(JSON.stringify({
  coins: bot.stats.coins,
  exp: bot.stats.exp,
  items: bot.stats.items,
  itemCounts: bot.stats.itemCounts,
  targetNpc: bot.stats.targetNpc ? null : bot.parseTargetNpc(REAL_MSG),
}, null, 2));

console.log('--- Battle 2 (drop lan 2, khac tran) ---');
bot.parseBattleRewards(REAL_MSG);
console.log(JSON.stringify({ itemCounts: bot.stats.itemCounts }, null, 2));
