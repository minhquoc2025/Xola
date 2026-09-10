"""
luanhoi_bot.py
=================================================================
Bot leo "Luân Hồi Tháp" (!luanhoi) — ĐỘC LẬP với npc_bot.py/boss_bot.py.

KHÁC BIỆT CỐT LÕI so với npc_bot.py:
- Mỗi !npc là 1 message MỚI. Nhưng !luanhoi chỉ tạo ĐÚNG 1 message duy
  nhất cho CẢ MỘT LẦN CHẠY (có thể xuyên suốt hàng chục tầng + nhiều
  trận Boss) — Discord liên tục edit message đó qua từng bước (chọn
  buff -> đánh -> chọn buff -> ... -> Boss -> tiếp tục/kết thúc -> chọn
  hướng -> ...) cho tới khi bấm "Kết Thúc" hoặc thua.
- Vì vậy bot PHẢI bám chết theo đúng message_id đã bắt được ngay từ đầu
  (dùng driver.find_element(By.ID, message_id) mỗi lần đọc lại), TUYỆT
  ĐỐI KHÔNG được tìm lại "message mới nhất của PLAYER_NAME" như npc_bot,
  vì nếu có người khác cũng đang tương tác bot cùng lúc, cách tìm theo
  "mới nhất" rất dễ nhảy nhầm sang message của người khác hoặc bị cuốn
  trôi do kênh có nhiều người chat.
- Không có khái niệm "thắng/thua" kiểu PLAYER_NAME chiến thắng/thua như
  NPC. Thắng 1 tầng = message tự chuyển sang màn chọn buff kế tiếp (hoặc
  màn Boss nếu tới tầng chia hết 10). Thua = xuất hiện marker "Ngã Xuống
  Luân Hồi Tháp!" (edit tại chỗ cùng message đang theo dõi).
- MỌI thao tác (spam skill, chọn buff, chọn hướng, bấm Tiếp Tục/Kết
  Thúc) đều dùng chung 1 nhịp nghỉ CLICK_DELAY=1.5s giữa các lần click
  (chức năng này có độ trễ phản hồi cao hơn NPC thường).
- Dùng chung skill.txt/NPC_SKILLS với npc_bot.py để spam đánh quái/Boss
  trong tháp, nhưng có file cấu hình RIÊNG (luanhoi_config.txt) cho các
  tham số đặc thù (marker nhận diện màn hình, nhịp click, thời gian
  chờ...).
"""

import os
import re
import time
import threading
from datetime import datetime

from selenium.webdriver.common.by import By

import bot_common as bc

CONFIG_FILE = os.path.join(bc.BASE_DIR, "luanhoi_config.txt")
LUANHOI_SKILL_FILE = os.path.join(bc.BASE_DIR, "skill_luanhoi.txt")
DEFAULT_LUANHOI_SKILLS = ["Phá Giáp", "Kịch Độc"]


# ============================================================
# CONFIG RIÊNG CHO LUÂN HỒI THÁP
# ============================================================

DEFAULT_CONFIG = {
    "LUANHOI_COMMAND": "!luanhoi",
    "CLICK_DELAY": "1.5",
    "INITIAL_WAIT_AFTER_COMMAND": "2",
    "INTER_RUN_WAIT": "3",
    "LUANHOI_MESSAGE_WAIT": "15",
    "TRACK_RETRY_COUNT": "3",
    "TRACK_RETRY_DELAY": "1.0",
    "MAX_LOST_TRACK_ROUNDS": "5",
    "BUFF_SELECT_MARKER": "Chọn 1 cổng!",
    "DIRECTION_MARKER": "Chọn 1 trong 4 hướng",
    "CONTINUE_BUTTON_TEXT": "Tiếp Tục Leo Tháp",
    "END_BUTTON_TEXT": "Kết Thúc",
    "RETREAT_BUTTON_TEXT": "Rút Lui",
    "BOSS_MAX_TIME_MINUTES": "10",
    "LOSE_MARKER": "Ngã Xuống Luân Hồi Tháp",
    "STAMINA_MARKER": "hết stamina",
    "FLOOR_REGEX_PATTERN": r"Tầng\s*(\d+)",
    "BUFF_PRIORITY": "Thiên,Huyền,Linh,Phàm",
}

CONFIG = {}
LUANHOI_COMMAND = "!luanhoi"
CLICK_DELAY = 1.5
INITIAL_WAIT_AFTER_COMMAND = 2.0
INTER_RUN_WAIT = 3.0
LUANHOI_MESSAGE_WAIT = 15
TRACK_RETRY_COUNT = 3
TRACK_RETRY_DELAY = 1.0
MAX_LOST_TRACK_ROUNDS = 5
BUFF_SELECT_MARKER = "Chọn 1 cổng!"
DIRECTION_MARKER = "Chọn 1 trong 4 hướng"
CONTINUE_BUTTON_TEXT = "Tiếp Tục Leo Tháp"
END_BUTTON_TEXT = "Kết Thúc"
RETREAT_BUTTON_TEXT = "Rút Lui"
BOSS_MAX_TIME_MINUTES = 10.0
LOSE_MARKER = "Ngã Xuống Luân Hồi Tháp"
STAMINA_MARKER = "hết stamina"
FLOOR_REGEX = re.compile(r"Tầng\s*(\d+)", re.IGNORECASE)
BUFF_PRIORITY = ["Thiên", "Huyền", "Linh", "Phàm"]

LUANHOI_SKILLS = []


def _strip_value(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return value.strip()


def create_default_config_file():
    lines = [
        "# ============================================================",
        "# LUANHOI_BOT CONFIG - tách riêng khỏi config.txt của npc/boss",
        "# ============================================================",
        "# Mỗi dòng KEY=VALUE. Sửa marker ở đây nếu game đổi wording,",
        "# không cần sửa code.",
        "",
    ]
    for k, v in DEFAULT_CONFIG.items():
        lines.append(f"{k}={v}")
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def load_luanhoi_config():
    global CONFIG, LUANHOI_COMMAND, CLICK_DELAY, INITIAL_WAIT_AFTER_COMMAND
    global INTER_RUN_WAIT, LUANHOI_MESSAGE_WAIT, TRACK_RETRY_COUNT
    global TRACK_RETRY_DELAY, MAX_LOST_TRACK_ROUNDS
    global BUFF_SELECT_MARKER, DIRECTION_MARKER, CONTINUE_BUTTON_TEXT
    global END_BUTTON_TEXT, RETREAT_BUTTON_TEXT, LOSE_MARKER, STAMINA_MARKER
    global BOSS_MAX_TIME_MINUTES
    global FLOOR_REGEX, BUFF_PRIORITY, LUANHOI_SKILLS

    config = DEFAULT_CONFIG.copy()

    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or line.startswith(";"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip().upper()
                value = _strip_value(value)
                if key in config:
                    config[key] = value
    else:
        create_default_config_file()
        print(f"📝 Đã tạo file cấu hình mặc định: {CONFIG_FILE}")

    CONFIG = config
    LUANHOI_COMMAND = config["LUANHOI_COMMAND"]
    CLICK_DELAY = max(0.2, float(config["CLICK_DELAY"]))
    INITIAL_WAIT_AFTER_COMMAND = max(0.0, float(config["INITIAL_WAIT_AFTER_COMMAND"]))
    INTER_RUN_WAIT = max(0.0, float(config["INTER_RUN_WAIT"]))
    LUANHOI_MESSAGE_WAIT = max(3, int(float(config["LUANHOI_MESSAGE_WAIT"])))
    TRACK_RETRY_COUNT = max(1, int(float(config["TRACK_RETRY_COUNT"])))
    TRACK_RETRY_DELAY = max(0.1, float(config["TRACK_RETRY_DELAY"]))
    MAX_LOST_TRACK_ROUNDS = max(1, int(float(config["MAX_LOST_TRACK_ROUNDS"])))

    BUFF_SELECT_MARKER = config["BUFF_SELECT_MARKER"]
    DIRECTION_MARKER = config["DIRECTION_MARKER"]
    CONTINUE_BUTTON_TEXT = config["CONTINUE_BUTTON_TEXT"]
    END_BUTTON_TEXT = config["END_BUTTON_TEXT"]
    RETREAT_BUTTON_TEXT = config["RETREAT_BUTTON_TEXT"]
    LOSE_MARKER = config["LOSE_MARKER"]
    STAMINA_MARKER = config["STAMINA_MARKER"]
    BOSS_MAX_TIME_MINUTES = max(0.1, float(config["BOSS_MAX_TIME_MINUTES"]))

    try:
        FLOOR_REGEX = re.compile(config["FLOOR_REGEX_PATTERN"], re.IGNORECASE)
    except Exception as e:
        print(f"⚠️ FLOOR_REGEX_PATTERN lỗi ({e}) -> dùng mặc định.")
        FLOOR_REGEX = re.compile(r"Tầng\s*(\d+)", re.IGNORECASE)

    BUFF_PRIORITY = [p.strip() for p in config["BUFF_PRIORITY"].split(",") if p.strip()]

    LUANHOI_SKILLS = bc.load_skill_file(LUANHOI_SKILL_FILE, DEFAULT_LUANHOI_SKILLS)


# ============================================================
# STATE
# ============================================================

should_stop = False
should_pause = False
reset_requested = False

target_floor = 60
total_runs_requested = 1

total_runs_done = 0
runs_reached_target = 0
runs_lost = 0
runs_failed = 0
highest_floor_ever = 0

start_time = datetime.now()


# ============================================================
# MESSAGE TRACKING — bám chết 1 message_id, KHÔNG bao giờ tìm lại
# "message mới nhất" (tránh nhảy nhầm sang message của người khác).
# ============================================================

def get_message_by_id(driver, message_id):
    try:
        return driver.find_element(By.ID, message_id)
    except Exception:
        return None


def get_tracked_message(driver, message_id):
    for _ in range(TRACK_RETRY_COUNT):
        elem = get_message_by_id(driver, message_id)
        if elem is not None:
            try:
                _ = elem.text
                return elem
            except Exception:
                pass
        time.sleep(TRACK_RETRY_DELAY)
    return None


# ============================================================
# GIỮ MESSAGE ĐANG THEO DÕI Ở GIỮA MÀN HÌNH
# ------------------------------------------------------------
# Vấn đề: khi user khác nhắn tin vào kênh, Discord tự đẩy message
# đang theo dõi lên trên, khiến các button trong message bị trôi khỏi
# viewport -> click thất bại (đặc biệt trong virtualized list của Discord).
# Giải pháp: trước MỌI lần click, chủ động cuộn scroll-container gần nhất
# sao cho message nằm giữa viewport; nếu click thường fail thì fallback
# sang JS click.
# ============================================================

_SCROLL_TO_CENTER_SCRIPT = """
const el = arguments[0];
if (!el) return false;

// Tìm scroll container gần nhất (Discord dùng overflow-y: auto/scroll)
let container = el.parentElement;
while (container) {
    const style = window.getComputedStyle(container);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && container.scrollHeight > container.clientHeight + 4) {
        break;
    }
    container = container.parentElement;
}

if (container) {
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    // Đặt tâm message trùng tâm container
    const targetTop = container.scrollTop
        + (eRect.top - cRect.top)
        - (cRect.height / 2)
        + (eRect.height / 2);
    container.scrollTo({ top: targetTop, behavior: 'auto' });
    return true;
}

// Fallback: scrollIntoView
el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
return true;
"""


def scroll_message_to_center(driver, msg_elem):
    """Cuộn message đang theo dõi về giữa viewport Discord."""
    if msg_elem is None:
        return False
    try:
        return bool(driver.execute_script(_SCROLL_TO_CENTER_SCRIPT, msg_elem))
    except Exception:
        return False


def click_button_safe(driver, msg_elem, btn):
    """Cuộn message về giữa màn hình rồi click. Nếu click thường fail
    (do button bị che/ngoài viewport), fallback sang JS click."""
    scroll_message_to_center(driver, msg_elem)
    try:
        btn.click()
        return True
    except Exception:
        pass
    try:
        driver.execute_script("arguments[0].click();", btn)
        return True
    except Exception:
        return False


def get_buttons(msg_elem):
    try:
        return msg_elem.find_elements(By.CSS_SELECTOR, 'button[role="button"]')
    except Exception:
        return []


def button_text(btn):
    try:
        text = (btn.text or "").strip()
        if text:
            return text
        imgs = btn.find_elements(By.CSS_SELECTOR, "img")
        for img in imgs:
            alt = img.get_attribute("alt")
            if alt and alt.strip():
                return alt.strip()
    except Exception:
        pass
    return ""


def parse_floor(text):
    m = FLOOR_REGEX.search(text)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None


# ============================================================
# CHỌN NÚT THEO TỪNG MÀN HÌNH
# ============================================================

def pick_buff_button(buttons):
    texts = [button_text(b) for b in buttons]
    for tier in BUFF_PRIORITY:
        for btn, text in zip(buttons, texts):
            if tier.lower() in text.lower():
                return btn, text
    return None, None


def pick_button_by_text(buttons, wanted_text):
    for btn in buttons:
        text = button_text(btn)
        if wanted_text.lower() in text.lower():
            return btn, text
    return None, None


def pick_direction_button(buttons):
    for btn in buttons:
        text = button_text(btn)
        if RETREAT_BUTTON_TEXT.lower() in text.lower():
            continue
        return btn, text
    return None, None


def pick_skill_button(buttons, skill_name):
    for btn in buttons:
        text = button_text(btn)
        if skill_name.lower() in text.lower():
            return btn, text
    return None, None


def classify_phase(text, button_texts):
    lower = text.lower()

    if STAMINA_MARKER.lower() in lower:
        return "STAMINA"

    if LOSE_MARKER.lower() in lower:
        return "LOSE"

    joined_buttons = " ".join(button_texts).lower()
    if CONTINUE_BUTTON_TEXT.lower() in joined_buttons and END_BUTTON_TEXT.lower() in joined_buttons:
        return "CONTINUE_OR_END"

    if BUFF_SELECT_MARKER.lower() in lower:
        return "BUFF_SELECT"

    if DIRECTION_MARKER.lower() in lower:
        return "DIRECTION"

    for t in button_texts:
        for skill in LUANHOI_SKILLS:
            if skill.lower() in t.lower():
                return "BATTLE"

    return "UNKNOWN"


# ============================================================
# 1 LẦN CHẠY (!luanhoi -> ... -> Kết Thúc / Thua / mất dấu)
# ============================================================

def process_luanhoi_run(driver, run_num):
    global highest_floor_ever

    print(f"\n{'=' * 55}")
    print(f"⏰ {datetime.now().strftime('%H:%M:%S')} | Lần chạy {run_num}/{total_runs_requested} | Mục tiêu tầng {target_floor}")
    print(f"{'=' * 55}")

    before_keys = set(bc.get_message_key(m) for m in bc.get_all_messages(driver))

    if not bc.send_command(driver, LUANHOI_COMMAND):
        return "FAILED"

    time.sleep(INITIAL_WAIT_AFTER_COMMAND)

    tracked_id = None
    deadline = time.time() + LUANHOI_MESSAGE_WAIT

    while time.time() < deadline:
        if should_stop:
            return "STOP"
        if reset_requested:
            return "RESET"

        for m in bc.get_all_messages(driver):
            try:
                key = bc.get_message_key(m)
                if not key or key in before_keys:
                    continue
                text = m.text or ""
                if not text or bc.PLAYER_NAME not in text:
                    continue
                if not get_buttons(m):
                    continue
                tracked_id = key
                break
            except Exception:
                continue

        if tracked_id:
            break
        time.sleep(0.3)

    if tracked_id is None:
        print("⚠️ Không tìm thấy message phản hồi sau !luanhoi.")
        return "FAILED"

    print(f"📌 Đang bám theo message_id: {tracked_id} (cố định tới hết lần chạy này)")

    last_floor_seen = 0
    lost_track_rounds = 0
    skill_index = 0
    last_skill_floor = None
    boss_floor_active = None
    boss_started_at = None

    while True:
        if should_stop:
            return "STOP"
        if reset_requested:
            return "RESET"
        if should_pause:
            time.sleep(0.3)
            continue

        elem = get_tracked_message(driver, tracked_id)
        if elem is None:
            lost_track_rounds += 1
            print(f"⚠️ Mất dấu message đang theo dõi (vòng {lost_track_rounds}/{MAX_LOST_TRACK_ROUNDS}).")
            if lost_track_rounds >= MAX_LOST_TRACK_ROUNDS:
                print("❌ Mất dấu message quá lâu -> dừng lần chạy này.")
                return "FAILED"
            time.sleep(CLICK_DELAY)
            continue
        lost_track_rounds = 0

        # >>> QUAN TRỌNG: kéo message đang theo dõi về GIỮA màn hình ngay
        # khi vừa lấy được. Điều này giữ cho message không bị đẩy lên khỏi
        # viewport khi user khác nhắn tin, và giúp cả text lẫn button luôn
        # ở trạng thái ổn định để đọc/click.
        scroll_message_to_center(driver, elem)

        try:
            text = elem.text or ""
        except Exception:
            time.sleep(CLICK_DELAY)
            continue

        buttons = get_buttons(elem)
        button_texts = [button_text(b) for b in buttons]

        floor = parse_floor(text)
        if floor:
            last_floor_seen = floor
            highest_floor_ever = max(highest_floor_ever, floor)

            if floor != last_skill_floor:
                skill_index = 0
                last_skill_floor = floor
                print(f"🔄 Sang tầng {floor} -> reset skill queue.")

        phase = classify_phase(text, button_texts)

        # ========================================================
        # BOSS TIMEOUT
        # ========================================================
        if phase == "BATTLE" and floor and floor % 10 == 0:
            if boss_floor_active != floor:
                boss_floor_active = floor
                boss_started_at = time.time()
                print(
                    f"👹 BOSS Tầng {floor}: bắt đầu tính giờ "
                    f"(giới hạn {BOSS_MAX_TIME_MINUTES:g} phút)."
                )

            if boss_started_at is not None:
                boss_elapsed = time.time() - boss_started_at
                boss_limit = BOSS_MAX_TIME_MINUTES * 60

                if boss_elapsed >= boss_limit:
                    btn, btxt = pick_button_by_text(buttons, RETREAT_BUTTON_TEXT)

                    if btn is not None:
                        print(
                            f"⏱️ BOSS Tầng {floor} đã đánh "
                            f"{boss_elapsed / 60:.1f} phút -> "
                            f"bấm [Rút Lui] và tính là HOÀN THÀNH 1 LẦN."
                        )
                        if not click_button_safe(driver, elem, btn):
                            print("⚠️ Click Rút Lui lỗi.")
                        time.sleep(CLICK_DELAY)
                        return ("DONE", last_floor_seen or floor)

                    print(
                        f"⚠️ BOSS Tầng {floor} đã quá "
                        f"{BOSS_MAX_TIME_MINUTES:g} phút nhưng chưa thấy nút "
                        f"'{RETREAT_BUTTON_TEXT}'. Sẽ thử lại sau {CLICK_DELAY}s."
                    )
                    time.sleep(CLICK_DELAY)
                    continue

        elif phase != "BATTLE" or not floor or floor % 10 != 0:
            boss_floor_active = None
            boss_started_at = None

        if phase == "STAMINA":
            print("⛔ Phát hiện 'không đủ stamina' trong message -> THOÁT CHƯƠNG TRÌNH.")
            return "EXIT_PROGRAM"

        if phase == "LOSE":
            print(f"💀 Ngã xuống Luân Hồi Tháp ở tầng ~{last_floor_seen}. Kết thúc lần chạy này.")
            return ("LOSE", last_floor_seen)

        if phase == "CONTINUE_OR_END":
            if last_floor_seen and last_floor_seen >= target_floor:
                btn, btxt = pick_button_by_text(buttons, END_BUTTON_TEXT)
                action = "KẾT THÚC"
            else:
                btn, btxt = pick_button_by_text(buttons, CONTINUE_BUTTON_TEXT)
                action = "TIẾP TỤC"

            if btn is None:
                print(f"⚠️ Không tìm thấy nút '{action}'. Thử lại sau {CLICK_DELAY}s.")
                time.sleep(CLICK_DELAY)
                continue

            print(f"🏁 Tầng {last_floor_seen}: bấm [{action}] ({btxt})")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click lỗi.")

            time.sleep(CLICK_DELAY)

            if action == "KẾT THÚC":
                return ("DONE", last_floor_seen)
            continue

        if phase == "BUFF_SELECT":
            btn, btxt = pick_buff_button(buttons)
            if btn is None:
                print(f"⚠️ Không xác định được nút buff trong: {button_texts}")
                time.sleep(CLICK_DELAY)
                continue
            print(f"✨ Tầng {last_floor_seen}: chọn buff [{btxt}]")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click buff lỗi.")
            time.sleep(CLICK_DELAY)
            continue

        if phase == "DIRECTION":
            btn, btxt = pick_direction_button(buttons)
            if btn is None:
                print("⚠️ Không tìm thấy nút hướng khả dụng.")
                time.sleep(CLICK_DELAY)
                continue
            print(f"🧭 Chọn hướng: {btxt or '(icon, mặc định nút đầu)'}")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click hướng lỗi.")
            time.sleep(CLICK_DELAY)
            continue

        if phase == "BATTLE":
            if not LUANHOI_SKILLS:
                print("❌ Không có skill trong skill.txt để spam!")
                time.sleep(CLICK_DELAY)
                continue

            skill = LUANHOI_SKILLS[skill_index % len(LUANHOI_SKILLS)]
            btn, btxt = pick_skill_button(buttons, skill)

            if btn is not None:
                if click_button_safe(driver, elem, btn):
                    print(f"   ⚔️ Tầng {last_floor_seen}: đã dùng [{btxt}]")
                else:
                    print(f"   ⚠️ Click skill lỗi: [{btxt}]")
            else:
                print(f"   ❌ Không thấy nút skill '{skill}' trong: {button_texts}")

            skill_index += 1
            time.sleep(CLICK_DELAY)
            continue

        print(f"❓ Chưa nhận diện được màn hình hiện tại. Buttons: {button_texts}")
        time.sleep(CLICK_DELAY)


# ============================================================
# MENU / INPUT
# ============================================================

def display_menu():
    print(f"\n{'=' * 60}")
    print("🌀 LUANHOI BOT — leo Luân Hồi Tháp (độc lập)")
    print(f"{'=' * 60}")
    print("  📊 status   - Xem trạng thái")
    print("  ⏸️  pause    - Tạm dừng")
    print("  ▶️  resume   - Tiếp tục")
    print("  🔄 reset    - Nạp lại config.txt/luanhoi_config.txt/skill.txt")
    print("  🛑 stop     - Dừng bot")
    print("  🧹 clear    - Xoá màn hình")
    print("  ❓ help     - Hiển thị menu")
    print(f"{'=' * 60}")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"🎯 Mục tiêu: {target_floor} tầng / lần | Tổng số lần: {total_runs_requested}")
    print(f"⚔️ Skills: {', '.join(LUANHOI_SKILLS)}")
    print(f"📊 Đã chạy: {total_runs_done}/{total_runs_requested} | "
          f"🏆 Đạt mục tiêu: {runs_reached_target} | 💀 Thua: {runs_lost} | ⚠️ Lỗi: {runs_failed}")
    print(f"⬆️ Tầng cao nhất từng đạt: {highest_floor_ever}")
    print(f"{'=' * 60}\n")


def input_handler():
    global should_stop, should_pause, reset_requested

    display_menu()

    while not should_stop:
        try:
            command = input("🔹 [LUANHOI] Nhập lệnh > ").strip().lower()

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
                print("🔄 Đã nhận lệnh reset -> sẽ nạp lại config/skill sau lần chạy hiện tại.")
            elif command == "status":
                display_menu()
            elif command == "clear":
                os.system("cls" if os.name == "nt" else "clear")
                display_menu()
            elif command == "help":
                display_menu()
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
    global reset_requested
    print("🔄 Đang nạp lại config.txt, luanhoi_config.txt và skill.txt ...")
    bc.load_config_file()
    load_luanhoi_config()
    reset_requested = False
    print(f"✅ Reset xong. Skills: {', '.join(LUANHOI_SKILLS)}")


# ============================================================
# MAIN
# ============================================================

def main():
    global should_stop, should_pause, reset_requested
    global target_floor, total_runs_requested
    global total_runs_done, runs_reached_target, runs_lost, runs_failed

    bc.load_config_file()
    load_luanhoi_config()

    print("=" * 60)
    print("🌀 LUANHOI BOT (độc lập với NPC/Boss)")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"⚔️ Skills (dùng chung skill.txt với NPC): {', '.join(LUANHOI_SKILLS)}")
    print("=" * 60)

    driver, _ = bc.attach_or_launch_game_edge("LUANHOI")
    if driver is None:
        input("\n👉 Nhấn ENTER để thoát...")
        return

    if not bc.open_discord(driver, "LUANHOI"):
        bc.close_driver_only(driver)
        return

    while True:
        raw = input("👉 Nhập số TẦNG mục tiêu mỗi lần chạy (VD 60): ").strip()
        try:
            target_floor = int(raw)
            if target_floor <= 0:
                raise ValueError
            break
        except ValueError:
            print("❌ Vui lòng nhập số nguyên dương.")

    while True:
        raw = input("👉 Nhập SỐ LẦN chạy muốn thực hiện (VD 5): ").strip()
        try:
            total_runs_requested = int(raw)
            if total_runs_requested <= 0:
                raise ValueError
            break
        except ValueError:
            print("❌ Vui lòng nhập số nguyên dương.")

    bc.wait_for_enter_to_start(
        "LUANHOI",
        extra_lines=[
            f"🎯 Mục tiêu: {target_floor} tầng / lần, tổng {total_runs_requested} lần chạy",
            f"⏱️ Nhịp click: {CLICK_DELAY}s (spam skill/chọn buff/chọn hướng/xác nhận đều dùng chung nhịp này)",
            "💀 Thua giữa chừng vẫn tính là đã dùng 1 lần chạy.",
            f"👹 Boss: quá {BOSS_MAX_TIME_MINUTES:g} phút sẽ tự Rút Lui và tính hoàn thành 1 lần.",
            "⛔ Gặp 'không đủ stamina' sẽ tự thoát chương trình.",
            "📌 Message đang chạy sẽ được giữ ở giữa màn hình Discord để không bị user khác đẩy trôi.",
        ],
    )

    input_thread = threading.Thread(target=input_handler, daemon=True)
    input_thread.start()

    exit_program = False

    try:
        while not should_stop and total_runs_done < total_runs_requested:
            try:
                if reset_requested:
                    apply_reset()
                    continue

                if should_pause:
                    time.sleep(0.3)
                    continue

                run_num = total_runs_done + 1
                result = process_luanhoi_run(driver, run_num)

                if result == "STOP":
                    break
                if result == "RESET":
                    reset_requested = True
                    continue
                if result == "EXIT_PROGRAM":
                    exit_program = True
                    should_stop = True
                    break
                if result == "FAILED":
                    runs_failed += 1
                    total_runs_done += 1
                elif isinstance(result, tuple) and result[0] == "LOSE":
                    runs_lost += 1
                    total_runs_done += 1
                elif isinstance(result, tuple) and result[0] == "DONE":
                    runs_reached_target += 1
                    total_runs_done += 1
                    print(f"🎉 Lần {run_num} hoàn thành mục tiêu {target_floor} tầng!")

                if should_stop or total_runs_done >= total_runs_requested:
                    break

                print(f"\n⏳ Chờ {INTER_RUN_WAIT}s trước lần chạy tiếp theo...")
                waited = 0.0
                while waited < INTER_RUN_WAIT:
                    if should_stop or reset_requested:
                        break
                    time.sleep(0.2)
                    waited += 0.2

            except Exception as e:
                print(f"❌ Lỗi main loop LUANHOI: {e}")
                time.sleep(3)

    except KeyboardInterrupt:
        should_stop = True

    finally:
        should_stop = True
        if input_thread.is_alive():
            input_thread.join(timeout=2)

        print(f"\n{'=' * 50}")
        print("📊 TỔNG KẾT LUANHOI")
        print(f"⏱️ Thời gian chạy: {datetime.now() - start_time}")
        print(f"🔁 Tổng số lần đã chạy: {total_runs_done}/{total_runs_requested}")
        print(f"🏆 Đạt mục tiêu {target_floor} tầng: {runs_reached_target}")
        print(f"💀 Thua giữa chừng: {runs_lost}")
        print(f"⚠️ Lỗi/mất dấu message: {runs_failed}")
        print(f"⬆️ Tầng cao nhất từng đạt: {highest_floor_ever}")
        if exit_program:
            print("⛔ Đã thoát do phát hiện 'không đủ stamina'.")
        print(f"{'=' * 50}")

        bc.close_driver_only(driver)
        print("👋 LUANHOI bot đã dừng (npc_bot.py/boss_bot.py, nếu đang chạy, KHÔNG bị ảnh hưởng).")


if __name__ == "__main__":
    main()
