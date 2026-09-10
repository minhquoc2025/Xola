"""
boss_bot.py
=================================================================
Bot đánh Boss — ĐỘC LẬP hoàn toàn với npc_bot.py.

- Không có logic NPC ở đây. Boss chỉ kết thúc khi có đúng text
  BOSS_END_TEXT ("Trận Boss Kết Thúc!"). Chết/hồi sinh KHÔNG phải kết thúc.
- Dùng chung GAME profile Edge với npc_bot.py qua remote-debugging-port
  (bot_common.attach_or_launch_game_edge) -> chạy song song, không cần
  đăng nhập lại, không tắt lẫn nhau.
- Chờ ENTER trước khi bắt đầu vòng lặp tự động.
"""

import os
import time
import threading
from datetime import datetime

import bot_common as bc

BOSS_SKILL_FILE = os.path.join(bc.BASE_DIR, "boss_skill.txt")
DEFAULT_BOSS_SKILLS = ["Phá Giáp", "Kịch Độc"]

should_stop = False
should_pause = False
reset_requested = False

total_battles = 0
start_time = datetime.now()

battle_in_progress = False
skills_used_in_battle = []

BOSS_SKILLS = []


# ============================================================
# SPAM SKILLS (BOSS only)
# ============================================================

def spam_all_skills(driver, skills_list, battle_duration):
    global skills_used_in_battle

    skills_used_in_battle = []
    start_time_battle = time.time()
    skill_index = 0
    total_skills = len(skills_list)

    if total_skills == 0:
        print("❌ Không có skill để spam! Kiểm tra boss_skill.txt")
        return "FAILED"

    print(f"\n🔥 SPAM {total_skills} kỹ năng Boss | interval ~{bc.SKILL_INTERVAL}s | tối đa {battle_duration}s")

    while time.time() - start_time_battle < battle_duration:
        if should_stop:
            return "STOP"
        if reset_requested:
            return "RESET"
        if should_pause:
            time.sleep(0.2)
            continue

        # Luôn kiểm tra message mới nhất TRƯỚC mỗi skill (chết/hồi sinh/
        # only-you-can-see-this/kết thúc có thể xuất hiện giữa các skill).
        special = bc.handle_latest_boss_special_message(driver)
        if special == "END":
            print("\n🏁 Trận Boss Kết Thúc!")
            return "ENDED"
        if special in ("RESURRECT_WAIT", "ONLY_YOU_DISMISSED"):
            continue

        current_skill = skills_list[skill_index % total_skills]

        success = False
        for attempt in range(1, bc.BOSS_CLICK_RETRY + 1):
            if should_stop:
                return "STOP"
            if reset_requested:
                return "RESET"

            special = bc.handle_latest_boss_special_message(driver)
            if special == "END":
                print("\n🏁 Trận Boss Kết Thúc!")
                return "ENDED"
            if special in ("RESURRECT_WAIT", "ONLY_YOU_DISMISSED"):
                success = False
                break

            current_target = bc.get_latest_boss_message(driver)
            if current_target is None:
                print(f"⚠️ Không tìm thấy message Boss ({bc.BOSS_USER_NAME}). Thử lại...")
            else:
                success = bc.find_and_click_skill(
                    driver, current_skill, max_retries=1, target_msg=current_target, mode="BOSS"
                )

            if success:
                break

            if attempt < bc.BOSS_CLICK_RETRY:
                print(f"⚠️ Click Boss thất bại (lần {attempt}/{bc.BOSS_CLICK_RETRY}) -> chờ {bc.BOSS_MESSAGE_WAIT}s rồi thử lại.")
                time.sleep(bc.BOSS_MESSAGE_WAIT)

        if not success:
            # Không kết luận Boss đã kết thúc chỉ vì click fail hết retry.
            # Vòng kế tiếp sẽ đọc lại latest message (có thể đã chết/hồi
            # sinh/only-you trong lúc đó).
            continue

        skills_used_in_battle.append(current_skill)

        skill_index += 1
        if skill_index >= total_skills:
            skill_index = 0

        if reset_requested:
            continue

        time.sleep(bc.SKILL_INTERVAL)

    print(f"\n⏰ Hết {battle_duration}s mà chưa có '{bc.BOSS_END_TEXT}'.")
    return "TIMEOUT"


# ============================================================
# BOSS BATTLE FLOW
# ============================================================

def process_boss_battle(driver, battle_num):
    global battle_in_progress

    battle_in_progress = True
    print(f"\n{'=' * 60}")
    print(f"👹 BOSS BATTLE #{battle_num} | Boss user: {bc.BOSS_USER_NAME}")
    print(f"🏁 Boss CHỈ kết thúc khi có: '{bc.BOSS_END_TEXT}'")
    print(f"{'=' * 60}")

    try:
        boss_msg = bc.get_latest_boss_message(driver)
        if boss_msg is None:
            print(f"❌ Không tìm thấy message boss của {bc.BOSS_USER_NAME}.")
            return "FAILED"

        result = spam_all_skills(driver, BOSS_SKILLS, bc.BATTLE_DURATION)
        return result

    except Exception as e:
        print(f"❌ Lỗi đánh boss: {e}")
        return "FAILED"

    finally:
        battle_in_progress = False


# ============================================================
# INPUT / MENU (BOSS ONLY — không có lệnh đổi NPC)
# ============================================================

def display_menu():
    print(f"\n{'=' * 60}")
    print("👹 BOSS BOT — ĐỘC LẬP (không đánh NPC)")
    print(f"{'=' * 60}")
    print("  ▶️  start    - Bắt đầu / đánh lại Boss ngay")
    print("  📊 status   - Xem trạng thái")
    print("  ⏸️  pause    - Tạm dừng")
    print("  ▶️  resume   - Tiếp tục")
    print("  🔄 reset    - Nạp lại config.txt/boss_skill.txt")
    print("  🛑 stop     - Dừng bot")
    print("  🧹 clear    - Xoá màn hình")
    print("  ❓ help     - Hiển thị menu")
    print(f"{'=' * 60}")
    print(f"👹 Boss: {bc.BOSS_USER_NAME}")
    print(f"⚔️ Skills: {', '.join(BOSS_SKILLS)}")
    print(f"📊 Trận: {total_battles}")
    print(f"{'=' * 60}\n")


def input_handler():
    global should_stop, should_pause, reset_requested

    display_menu()

    while not should_stop:
        try:
            command = input("🔹 [BOSS] Nhập lệnh > ").strip().lower()

            if command == "stop":
                should_stop = True
                print("🛑 Đã nhận lệnh dừng.")
                break

            elif command == "pause":
                should_pause = True
                print("⏸️ Đã tạm dừng.")

            elif command == "resume":
                should_pause = False
                print("▶️ Đã tiếp tục.")

            elif command == "reset":
                reset_requested = True
                print("🔄 Đã nhận lệnh reset -> sẽ nạp lại config/skill sau trận hiện tại.")

            elif command == "status":
                display_menu()

            elif command == "clear":
                os.system("cls" if os.name == "nt" else "clear")
                display_menu()

            elif command == "help":
                display_menu()

            elif command.isdigit() or command == "npc":
                print("❌ boss_bot.py không đánh NPC. Hãy chạy npc_bot.py (cửa sổ riêng).")

            elif command == "start":
                print("ℹ️ Bot sẽ tự đánh boss lại ở vòng lặp tiếp theo (thường ngay lập tức).")

            elif command == "":
                pass

            else:
                print(f"❌ Lệnh không hợp lệ: {command}. Gõ 'help'.")

        except KeyboardInterrupt:
            should_stop = True
            break
        except Exception as e:
            print(f"⚠️ Lỗi input: {e}")
            time.sleep(1)


def apply_reset():
    global reset_requested, BOSS_SKILLS
    print("🔄 Đang nạp lại config.txt và boss_skill.txt ...")
    bc.load_config_file()
    BOSS_SKILLS = bc.load_skill_file(BOSS_SKILL_FILE, DEFAULT_BOSS_SKILLS)
    reset_requested = False
    print(f"✅ Reset xong. Skills: {', '.join(BOSS_SKILLS)}")


# ============================================================
# MAIN
# ============================================================

def main():
    global should_stop, should_pause, total_battles, reset_requested, BOSS_SKILLS

    bc.load_config_file()
    BOSS_SKILLS = bc.load_skill_file(BOSS_SKILL_FILE, DEFAULT_BOSS_SKILLS)

    print("=" * 60)
    print("👹 BOSS BOT (độc lập với NPC)")
    print(f"👹 Boss: {bc.BOSS_USER_NAME}")
    print(f"⚔️ Skills: {', '.join(BOSS_SKILLS)}")
    print("=" * 60)

    driver, _ = bc.attach_or_launch_game_edge("BOSS")
    if driver is None:
        input("\n👉 Nhấn ENTER để thoát...")
        return

    if not bc.open_discord(driver, "BOSS"):
        bc.close_driver_only(driver)
        return

    bc.wait_for_enter_to_start(
        "BOSS",
        extra_lines=[
            "🏁 Boss chỉ kết thúc khi có 'Trận Boss Kết Thúc!'.",
            "💀 Chết/hồi sinh KHÔNG phải kết thúc — bot sẽ tự dismiss và chờ.",
        ],
    )

    input_thread = threading.Thread(target=input_handler, daemon=True)
    input_thread.start()

    try:
        while not should_stop:
            try:
                if reset_requested:
                    apply_reset()
                    continue

                if should_pause:
                    time.sleep(0.2)
                    continue

                total_battles += 1
                result = process_boss_battle(driver, total_battles)

                if result == "RESET":
                    reset_requested = True
                    continue
                if result == "STOP":
                    break

                if should_stop:
                    break

                if result == "ENDED":
                    print("\n🏁 Boss đã kết thúc (đúng text xác nhận).")
                    print("ℹ️ Boss bot sẽ tự tìm/đánh trận boss tiếp theo nếu có.")
                    time.sleep(2)
                elif result == "TIMEOUT":
                    print("⚠️ Boss timeout nhưng CHƯA có text kết thúc -> tiếp tục đánh ngay.")
                    time.sleep(1)
                else:
                    print("⚠️ Boss battle lỗi tạm thời -> thử lại.")
                    time.sleep(2)

            except Exception as e:
                print(f"❌ Lỗi main loop Boss: {e}")
                time.sleep(3)

    except KeyboardInterrupt:
        should_stop = True

    finally:
        should_stop = True
        if input_thread.is_alive():
            input_thread.join(timeout=2)

        print(f"\n{'=' * 50}")
        print("📊 TỔNG KẾT BOSS")
        print(f"⏱️ Thời gian chạy: {datetime.now() - start_time}")
        print(f"⚔️ Tổng số trận: {total_battles}")
        print(f"{'=' * 50}")

        bc.close_driver_only(driver)
        print("👋 Boss bot đã dừng (tab của npc_bot.py, nếu đang chạy, KHÔNG bị ảnh hưởng).")


if __name__ == "__main__":
    main()
