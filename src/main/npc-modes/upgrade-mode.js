const SELLALL_STAR_CMDS = [
  '/sellall star:🔵 1 Sao',
  '/sellall star:🟢 2 Sao',
  '/sellall star:🟡 3 Sao',
];

module.exports = {
  async upgradeLoop(runId) {
    if (!this.isRunning || this.runId !== runId) return;
    this.log('\n=== 💀 SPAM MODE ===');
    const maxCount = this.spamCount || 10;
    while (this.isRunning && this.runId === runId) {
      if (this.upgradeCount >= maxCount) break;
      try {
        if (this.spamType === 'waifu_roll') {
          await this.sendSlashChat('/waifu roll 10');
        } else {
          await this.sendSlashChat(this.upgradeCmd);
        }
        this.upgradeCount++;
        if (this.upgradeCount % 10 === 0 || this.upgradeCount === maxCount) {
          this.log(`💀 Đã gửi ${this.upgradeCount}x: ${this.spamType === 'waifu_roll' ? 'waifu roll count: 10' : this.upgradeCmd}`);
        }
      } catch (e) {
        this.log('⚠️ Gửi lệnh spam lỗi:', e.message);
      }
      if (this.upgradeCount >= maxCount) break;
      await this.delay(this.upgradeDelayMs);
    }
    const doneTarget = this.upgradeCount >= maxCount;
    this.log(`⏹ SPAM MODE đã dừng sau ${this.upgradeCount} lần gửi.`);
    // Chỉ dọn túi khi người dùng chọn spam /roll_x10 và đã đạt target.
    if (doneTarget && this.isRollX10Spam()) {
      await this.sellAllStars();
    }
    this.isRunning = false;
    this.runId = null;
  },

  // Người dùng có chọn spam /roll_x10 không (theo loại spam hoặc lệnh đã gửi).
  isRollX10Spam() {
    return this.spamType === 'roll_x10' || this.upgradeCmd === '/roll_x10';
  },

  // Dọn túi: bán hết sao 1-3 sao bằng /sellall.
  async sellAllStars() {
    this.log(`🧹 Dọn túi: gửi ${SELLALL_STAR_CMDS.length} lệnh /sellall...`);
    for (const cmd of SELLALL_STAR_CMDS) {
      try {
        await this.sendSlashChat(cmd);
        this.log(`🧹 Đã gửi: ${cmd}`);
      } catch (e) {
        this.log('⚠️ Dọn túi lỗi:', e.message);
      }
      await this.delay(Math.max(500, this.upgradeDelayMs));
    }
    this.log('🧹 Dọn túi xong.');
  },
};
