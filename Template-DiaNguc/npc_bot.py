"""
npc_bot.py
=================================================================
Bot đánh NPC — ĐỘC LẬP hoàn toàn với boss_bot.py.

- Không có logic Boss ở đây. Gõ 'boss' sẽ báo lỗi lệnh không hợp lệ.
- Dùng chung GAME profile Edge với boss_bot.py qua remote-debugging-port
  (xem bot_common.attach_or_launch_game_edge) -> chạy song song 2 cửa sổ
  mà không cần đăng nhập lại, và không tắt lẫn nhau.
- Chờ ENTER trước khi bắt đầu vòng lặp tự động (yêu cầu Lần 3).
- 1 message battle cho mỗi !npc: Discord tự edit message đó qua từng lượt
  skill, nên bot luôn bám theo CÙNG message (refresh khi stale) thay vì
  tìm "message mới" mỗi lần click.
"""

import os
import time
import threading
from datetime import datetime

import bot_common as bc

NPC_SKILL_FILE = os.path.join(bc.BASE_DIR, "skill.txt")
DEFAULT_NPC_SKILLS = ["Phá Giáp", "Kịch Độc"]

# ============================================================
# STATE
# ============================================================

should_stop = False
should_pause = False
reset_requested = False

npc_to_change = None
current_npc_id = "25"

total_battles = 0
total_wins = 0
total_losses = 0
start_time = datetime.now()

battle_in_progress = False
skills_used_in_battle = []

NPC_SKILLS = []


def log(*args):
    print(*args)


# ============================================================
# SPAM SKILLS (NPC only)
# ============================================================

def spam_all_skills(driver, skills_list, battle_duration, target_msg):
    global skills_used_in_battle

    skills_used_in_battle = []
    start_time_battle = time.time()
    skill_index = 0
    total_skills = len(skills_list)

    if total_skills == 0:
        print("❌ Không có skill để spam! Kiểm tra skill.txt")
        return "FAILED"

    print(f"\n🔥 SPAM {total_skills} kỹ năng | interval ~{bc.SKILL_INTERVAL}s | tối đa {battle_duration}s")

    while time.time() - start_time_battle < battle_duration:
        if should_stop:
            return "STOP"
        if reset_requested:
            return "RESET"
        if npc_to_change is not None:
            return "SWITCH_NPC"
        if should_pause:
            time.sleep(0.2)
            continue

        if bc.check_battle_ended(driver, target_msg):
            print("\n🛑 NPC đã có kết quả!")
            result = bc.get_battle_result(driver)
            if result == "win":
                print("🏆 THẮNG!")
            elif result == "lose":
                print("💀 THUA!")
            else:
                print("❓ Không xác định được kết quả.")
            return ("ENDED", result)

        current_skill = skills_list[skill_index % total_skills]

        success = bc.find_and_click_skill(
            driver, current_skill, max_retries=3, target_msg=target_msg, mode="NPC"
        )

        if not success:
            # Không vội kết luận battle đã kết thúc. Kiểm tra message mới
            # nhất của PLAYER_NAME để phân biệt: đã có kết quả / đang
            # cooldown / hay chỉ là click tạm thời lỗi (DOM re-render).
            state = bc.check_npc_post_skill_state(driver)
            if state is not None:
                kind, value = state
                if kind == "ENDED":
                    result = bc.get_battle_result(driver)
                    if result == "win":
                        print("🏆 THẮNG!")
                    elif result == "lose":
                        print("💀 THUA!")
                    return ("ENDED", result)
                if kind == "COOLDOWN":
                    return ("COOLDOWN", value)
        else:
            skills_used_in_battle.append(current_skill)

        # KHÔNG skip skill trùng liên tiếp.
        skill_index += 1
        if skill_index >= total_skills:
            skill_index = 0

        if npc_to_change is not None or reset_requested:
            continue

        time.sleep(bc.SKILL_INTERVAL)

    # TIMEOUT
    print(f"\n⏰ Hết {battle_duration}s.")
    if bc.check_battle_ended(driver, target_msg):
        result = bc.get_battle_result(driver)
        return ("ENDED", result)

    return "TIMEOUT"


# ============================================================
# NPC BATTLE FLOW
# ============================================================

def process_npc_battle(driver, npc_id, battle_num):
    global battle_in_progress, total_wins, total_losses

    battle_in_progress = True
    command = f"!npc {npc_id}"

    try:
        while True:
            before_keys = set(bc.get_message_key(m) for m in bc.get_all_messages(driver))

            print(f"\n{'=' * 55}")
            print(f"⏰ {datetime.now().strftime('%H:%M:%S')} | Lần {battle_num} | NPC {npc_id}")
            print(f"{'=' * 55}")

            if not bc.send_command(driver, command):
                return "FAILED"
            time.sleep(2)
            battle_msg = None
            deadline = time.time() + bc.NPC_MESSAGE_WAIT

            while time.time() < deadline:
                if should_stop:
                    return "STOP"
                if reset_requested:
                    return "RESET"
                if npc_to_change is not None:
                    return "SWITCH_NPC"

                cooldown_msg, cooldown_seconds = bc.get_new_npc_cooldown_message(driver, before_keys)

                if cooldown_seconds is not None:
                    print(f"⚠️ !npc đang hồi chiêu: còn khoảng {cooldown_seconds}s")
                    wait_seconds = cooldown_seconds + bc.NPC_COOLDOWN_BUFFER

                    ok = bc.interruptible_sleep(
                        wait_seconds,
                        lambda: should_stop or reset_requested or npc_to_change is not None,
                    )
                    if not ok:
                        if should_stop:
                            return "STOP"
                        if reset_requested:
                            return "RESET"
                        if npc_to_change is not None:
                            return "SWITCH_NPC"
                        return "FAILED"

                    before_keys = set(bc.get_message_key(m) for m in bc.get_all_messages(driver))
                    if not bc.send_command(driver, command):
                        return "FAILED"
                    print("🔁 Đã hết cooldown -> gửi lại !npc.")
                    deadline = time.time() + bc.NPC_MESSAGE_WAIT
                    continue

                battle_msg = bc.get_latest_battle_message(driver, known_message_keys=before_keys)
                if battle_msg is not None:
                    break

                time.sleep(0.25)

            if battle_msg is None:
                print("⚠️ Không tìm thấy message battle mới sau khi chờ. Thử lại.")
                return "FAILED"

            result = spam_all_skills(driver, NPC_SKILLS, bc.BATTLE_DURATION, target_msg=battle_msg)

            if isinstance(result, tuple) and result[0] == "COOLDOWN":
                cooldown_seconds = result[1]
                wait_seconds = cooldown_seconds + bc.NPC_COOLDOWN_BUFFER
                print(f"⚠️ NPC báo cooldown giữa trận: còn khoảng {cooldown_seconds}s")

                ok = bc.interruptible_sleep(
                    wait_seconds,
                    lambda: should_stop or reset_requested or npc_to_change is not None,
                )
                if not ok:
                    if should_stop:
                        return "STOP"
                    if reset_requested:
                        return "RESET"
                    if npc_to_change is not None:
                        return "SWITCH_NPC"
                    return "FAILED"
                # Quay lại vòng while True: gửi lại !npc.
                continue

            if isinstance(result, tuple) and result[0] == "ENDED":
                battle_result = result[1]
                if battle_result == "win":
                    total_wins += 1
                elif battle_result == "lose":
                    total_losses += 1
                return "ENDED"

            return result

    finally:
        battle_in_progress = False


# ============================================================
# INPUT / MENU (NPC ONLY — không có lệnh 'boss')
# ============================================================

def display_menu():
    print(f"\n{'=' * 60}")
    print("🎮 NPC BOT — ĐỘC LẬP (không đánh Boss)")
    print(f"{'=' * 60}")
    print("  🔢 [Số]     - Đổi NPC")
    print("  📊 status   - Xem trạng thái")
    print("  ⏸️  pause    - Tạm dừng")
    print("  ▶️  resume   - Tiếp tục")
    print("  🔄 reset    - Nạp lại config.txt/skill.txt")
    print("  🛑 stop     - Dừng bot")
    print("  🧹 clear    - Xoá màn hình")
    print("  ❓ help     - Hiển thị menu")
    print(f"{'=' * 60}")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"🎯 NPC hiện tại: {current_npc_id}")
    print(f"⚔️ Skills: {', '.join(NPC_SKILLS)}")
    print(f"📊 Trận: {total_battles} | 🏆 {total_wins} | 💀 {total_losses}")
    print(f"{'=' * 60}\n")


def input_handler():
    global should_stop, should_pause, npc_to_change, reset_requested

    display_menu()

    while not should_stop:
        try:
            command = input("🔹 [NPC] Nhập lệnh > ").strip()
            command_lower = command.lower()

            if command_lower == "stop":
                should_stop = True
                print("🛑 Đã nhận lệnh dừng.")
                break

            elif command_lower == "pause":
                should_pause = True
                print("⏸️ Đã tạm dừng.")

            elif command_lower == "resume":
                should_pause = False
                print("▶️ Đã tiếp tục.")

            elif command_lower == "reset":
                reset_requested = True
                print("🔄 Đã nhận lệnh reset -> sẽ nạp lại config/skill sau trận hiện tại.")

            elif command_lower == "status":
                display_menu()

            elif command_lower == "clear":
                os.system("cls" if os.name == "nt" else "clear")
                display_menu()

            elif command_lower == "help":
                display_menu()

            elif command_lower == "boss":
                print("❌ npc_bot.py không đánh Boss. Hãy chạy boss_bot.py (cửa sổ riêng).")

            elif command_lower.isdigit():
                npc_to_change = command_lower
                print(f"🔄 Sẽ chuyển sang NPC {command_lower} ngay khi có thể.")

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


# ============================================================
# RESET
# ============================================================

def apply_reset():
    global reset_requested, NPC_SKILLS, current_npc_id
    print("🔄 Đang nạp lại config.txt và skill.txt ...")
    bc.load_config_file()
    NPC_SKILLS = bc.load_skill_file(NPC_SKILL_FILE, DEFAULT_NPC_SKILLS)
    reset_requested = False
    print(f"✅ Reset xong. Skills: {', '.join(NPC_SKILLS)}")


# ============================================================
# MAIN
# ============================================================

def main():
    global should_stop, should_pause, npc_to_change, current_npc_id
    global total_battles, reset_requested, NPC_SKILLS

    bc.load_config_file()
    NPC_SKILLS = bc.load_skill_file(NPC_SKILL_FILE, DEFAULT_NPC_SKILLS)
    current_npc_id = bc.DEFAULT_NPC_ID

    print("=" * 60)
    print("🎮 NPC BOT (độc lập với Boss)")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"⚔️ Skills: {', '.join(NPC_SKILLS)}")
    print("=" * 60)

    driver, _ = bc.attach_or_launch_game_edge("NPC")
    if driver is None:
        input("\n👉 Nhấn ENTER để thoát...")
        return

    if not bc.open_discord(driver, "NPC"):
        bc.close_driver_only(driver)
        return

    choice = input(f"👉 Nhập ID NPC (Enter để dùng {current_npc_id}): ").strip()
    if choice:
        current_npc_id = choice

    bc.wait_for_enter_to_start(
        "NPC",
        extra_lines=[
            f"🎯 NPC sẽ đánh: {current_npc_id}",
            "🔁 Skill trùng liên tiếp vẫn click bình thường (không skip).",
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

                if npc_to_change is not None:
                    current_npc_id = npc_to_change
                    npc_to_change = None

                total_battles += 1
                result = process_npc_battle(driver, current_npc_id, total_battles)

                if result == "RESET":
                    reset_requested = True
                    continue
                if result == "SWITCH_NPC":
                    continue
                if result == "STOP":
                    break

                if should_stop:
                    break

                print(f"\n⏳ Chờ {bc.LOOP_INTERVAL}s trước trận NPC tiếp theo...")
                interrupted = False
                for _ in range(bc.LOOP_INTERVAL, 0, -5):
                    if should_stop or reset_requested or should_pause or npc_to_change is not None:
                        interrupted = True
                        break
                    time.sleep(5)
                if interrupted:
                    continue

            except Exception as e:
                print(f"❌ Lỗi main loop NPC: {e}")
                time.sleep(3)

    except KeyboardInterrupt:
        should_stop = True

    finally:
        should_stop = True
        if input_thread.is_alive():
            input_thread.join(timeout=2)

        print(f"\n{'=' * 50}")
        print("📊 TỔNG KẾT NPC")
        print(f"⏱️ Thời gian chạy: {datetime.now() - start_time}")
        print(f"⚔️ Tổng số trận: {total_battles}")
        print(f"🏆 Thắng: {total_wins} | Thua: {total_losses}")
        print(f"{'=' * 50}")

        bc.close_driver_only(driver)
        print("👋 NPC bot đã dừng (tab của boss_bot.py, nếu đang chạy, KHÔNG bị ảnh hưởng).")


if __name__ == "__main__":
    main()
