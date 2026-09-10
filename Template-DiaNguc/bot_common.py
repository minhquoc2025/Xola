"""
bot_common.py
=================================================================
Module dùng chung cho npc_bot.py và boss_bot.py.

QUAN TRỌNG (đọc trước khi sửa):
- Đây là nơi giữ cơ chế click ĐÃ CHỨNG MINH HOẠT ĐỘNG (lấy nguyên từ
  workbuttonclick.txt): find_and_click_skill(), get_latest_battle_message(),
  get_latest_boss_message(), find_and_click_dismiss(). KHÔNG đổi cơ chế
  click ở đây nếu chưa xác định rõ lý do (theo đúng yêu cầu BA spec Phần D/M).
- File này KHÔNG bao giờ gọi "taskkill msedge.exe" trên toàn hệ thống.
  Lý do 2 bot NPC/Boss (và quiz bot) phải chạy song song ở 3 cửa sổ Edge
  khác nhau mà không tắt lẫn nhau. Đây là fix cho lỗi gốc khiến 2 tiến
  trình không thể chạy cùng lúc trước đây (v7 cũ gọi kill_edge_processes()
  ngay trong init_driver()/close_driver(), tắt luôn cả cửa sổ kia).
- NPC và Boss dùng chung 1 Edge profile đã đăng nhập (GAME profile) để
  không phải đăng nhập lại nhiều lần. Vì Chromium/Edge KHÔNG cho 2 tiến
  trình mở cùng một user-data-dir cùng lúc (bị khoá bởi SingletonLock),
  cách duy nhất để 2 process Python riêng biệt dùng chung 1 phiên đăng
  nhập là: mở Edge MỘT LẦN với --remote-debugging-port cố định, sau đó
  cả 2 script CÙNG "attach" (Selenium debuggerAddress) vào chính cửa sổ
  Edge đó, mỗi bot tự mở một tab riêng. Bot nào chạy trước sẽ tự bật Edge;
  bot chạy sau chỉ việc attach vào, không mở cửa sổ mới, không cần đăng
  nhập lại.
"""

import os
import re
import time
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "config.txt")

# ============================================================
# DEFAULT CONFIG (dùng chung cho NPC + BOSS)
# ============================================================

DEFAULT_CONFIG = {
    "DEFAULT_NPC_ID": "25",
    "LOOP_INTERVAL": "120",
    "BATTLE_DURATION": "120",
    "SKILL_INTERVAL": "0.5",

    "TEXTBOX_SELECTOR": 'div[role="textbox"]',
    "MESSAGE_SELECTOR": 'li[id^="chat-messages-"]',

    # Profile Edge dùng chung cho NPC + Boss (KHÔNG dùng chung với Quiz).
    "GAME_EDGE_USER_DATA_DIR": os.path.join(BASE_DIR, "edge_game_profile"),
    "GAME_PROFILE_DIR": "Default",
    # Cổng remote debugging cố định để 2 process NPC/Boss cùng attach.
    "GAME_DEBUG_PORT": "9333",
    # Đường dẫn msedge.exe. Để trống sẽ tự dò các đường dẫn cài đặt phổ biến.
    "EDGE_BINARY_PATH": "",

    "PLAYER_NAME": "Thích Bơm Đểu",
    "BOSS_USER_NAME": "Xỏ lá ba que",
    "MAX_LOOK_BACK": "20",

    "NPC_MESSAGE_WAIT": "10",
    "NPC_COOLDOWN_BUFFER": "1",

    "BOSS_MESSAGE_WAIT": "10",
    "BOSS_CLICK_RETRY": "3",

    "DISMISS_TEXT": "Dissmiss message",
    "BOSS_DEAD_TEXT": "Đang chết, hồi sinh sau",
    "BOSS_ONLY_YOU_TEXT": "Only you can see this",
    "BOSS_END_TEXT": "Trận Boss Kết Thúc!",

    "DEBUG_LOG": "0",
}

CONFIG = {}

# Biến runtime — được nạp bởi load_config_file().
DEFAULT_NPC_ID = "25"
LOOP_INTERVAL = 120
BATTLE_DURATION = 120
SKILL_INTERVAL = 0.5
TEXTBOX_SELECTOR = 'div[role="textbox"]'
MESSAGE_SELECTOR = 'li[id^="chat-messages-"]'
GAME_EDGE_USER_DATA_DIR = ""
GAME_PROFILE_DIR = "Default"
GAME_DEBUG_PORT = 9333
EDGE_BINARY_PATH = ""
PLAYER_NAME = "Thích Bơm Đểu"
BOSS_USER_NAME = "Xỏ lá ba que"
MAX_LOOK_BACK = 20
NPC_MESSAGE_WAIT = 10
NPC_COOLDOWN_BUFFER = 1
BOSS_MESSAGE_WAIT = 10
BOSS_CLICK_RETRY = 3
DISMISS_TEXT = "Dissmiss message"
BOSS_DEAD_TEXT = "Đang chết, hồi sinh sau"
BOSS_ONLY_YOU_TEXT = "Only you can see this"
BOSS_END_TEXT = "Trận Boss Kết Thúc!"
DEBUG_LOG = False


def dprint(*args, **kwargs):
    if DEBUG_LOG:
        print(*args, **kwargs)


# ============================================================
# CONFIG LOADER
# ============================================================

def _strip_config_value(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return value.strip()


def create_default_config_file():
    lines = ["# ============================================================",
             "# GAME BOT CONFIG (dùng chung cho npc_bot.py và boss_bot.py)",
             "# ============================================================",
             "# Mỗi dòng dạng KEY=VALUE. Không cần dấu ngoặc kép.",
             ""]
    for k, v in DEFAULT_CONFIG.items():
        lines.append(f"{k}={v}")
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def load_config_file():
    global CONFIG
    global DEFAULT_NPC_ID, LOOP_INTERVAL, BATTLE_DURATION, SKILL_INTERVAL
    global TEXTBOX_SELECTOR, MESSAGE_SELECTOR
    global GAME_EDGE_USER_DATA_DIR, GAME_PROFILE_DIR, GAME_DEBUG_PORT, EDGE_BINARY_PATH
    global PLAYER_NAME, BOSS_USER_NAME, MAX_LOOK_BACK
    global NPC_MESSAGE_WAIT, NPC_COOLDOWN_BUFFER, BOSS_MESSAGE_WAIT, BOSS_CLICK_RETRY
    global DISMISS_TEXT, BOSS_DEAD_TEXT, BOSS_ONLY_YOU_TEXT, BOSS_END_TEXT
    global DEBUG_LOG

    config = DEFAULT_CONFIG.copy()

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or line.startswith(";"):
                        continue
                    if "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip().upper()
                    value = _strip_config_value(value)
                    if key in config:
                        config[key] = value
        except Exception as e:
            print(f"⚠️ Lỗi đọc {CONFIG_FILE}: {e}")
    else:
        try:
            create_default_config_file()
            print(f"📝 Đã tạo file cấu hình mặc định: {CONFIG_FILE}")
        except Exception as e:
            print(f"⚠️ Không thể tạo {CONFIG_FILE}: {e}")

    CONFIG = config

    DEFAULT_NPC_ID = config["DEFAULT_NPC_ID"]
    LOOP_INTERVAL = max(0, int(float(config["LOOP_INTERVAL"])))
    BATTLE_DURATION = max(1, int(float(config["BATTLE_DURATION"])))
    SKILL_INTERVAL = max(0.05, float(config["SKILL_INTERVAL"]))

    TEXTBOX_SELECTOR = config["TEXTBOX_SELECTOR"]
    MESSAGE_SELECTOR = config["MESSAGE_SELECTOR"]

    GAME_EDGE_USER_DATA_DIR = config["GAME_EDGE_USER_DATA_DIR"]
    if GAME_EDGE_USER_DATA_DIR and not os.path.isabs(GAME_EDGE_USER_DATA_DIR):
        # Tương đối -> luôn resolve theo BASE_DIR (thư mục chứa .py), không
        # phụ thuộc CWD lúc chạy (double-click / chạy từ thư mục khác).
        GAME_EDGE_USER_DATA_DIR = os.path.join(BASE_DIR, GAME_EDGE_USER_DATA_DIR)
    GAME_PROFILE_DIR = config["GAME_PROFILE_DIR"]
    GAME_DEBUG_PORT = max(1, int(float(config["GAME_DEBUG_PORT"])))
    EDGE_BINARY_PATH = config["EDGE_BINARY_PATH"]

    PLAYER_NAME = config["PLAYER_NAME"]
    BOSS_USER_NAME = config["BOSS_USER_NAME"]
    MAX_LOOK_BACK = max(1, int(float(config["MAX_LOOK_BACK"])))

    NPC_MESSAGE_WAIT = max(1, int(float(config["NPC_MESSAGE_WAIT"])))
    NPC_COOLDOWN_BUFFER = max(0, int(float(config["NPC_COOLDOWN_BUFFER"])))
    BOSS_MESSAGE_WAIT = max(1, int(float(config["BOSS_MESSAGE_WAIT"])))
    BOSS_CLICK_RETRY = max(1, int(float(config["BOSS_CLICK_RETRY"])))

    DISMISS_TEXT = config["DISMISS_TEXT"]
    BOSS_DEAD_TEXT = config["BOSS_DEAD_TEXT"]
    BOSS_ONLY_YOU_TEXT = config["BOSS_ONLY_YOU_TEXT"]
    BOSS_END_TEXT = config["BOSS_END_TEXT"]

    DEBUG_LOG = config["DEBUG_LOG"].strip() in ("1", "true", "True", "yes")

    return config


def load_skill_file(path, fallback):
    try:
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                for skill in fallback:
                    f.write(skill + "\n")
            print(f"📝 Đã tạo file skill: {path}")

        with open(path, "r", encoding="utf-8") as f:
            skills = [line.strip() for line in f if line.strip()]

        return skills if skills else list(fallback)
    except Exception as e:
        print(f"⚠️ Lỗi đọc {path}: {e}")
        return list(fallback)


# ============================================================
# EDGE: ATTACH-OR-LAUNCH (KHÔNG BAO GIỜ TASKKILL TOÀN HỆ THỐNG)
# ============================================================

def _candidate_edge_binaries():
    candidates = []
    if EDGE_BINARY_PATH:
        candidates.append(EDGE_BINARY_PATH)
    candidates += [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    return candidates


def _debug_port_alive(port, timeout=1.5):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=timeout):
            return True
    except Exception:
        return False


def _launch_edge_with_debug_port(user_data_dir, profile_dir, port, label):
    binary = None
    for path in _candidate_edge_binaries():
        if path and os.path.exists(path):
            binary = path
            break

    if binary is None:
        print(f"❌ [{label}] Không tìm thấy msedge.exe. Hãy đặt EDGE_BINARY_PATH trong config.txt.")
        return False

    args = [
        binary,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        f"--profile-directory={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        # NPC và Boss chạy trên 2 TAB của CÙNG 1 cửa sổ Edge (xem
        # attach_or_launch_game_edge). Chromium/Edge mặc định throttle
        # mạnh tab không active (giảm tốc timer, tạm dừng cập nhật
        # DOM/render) để tiết kiệm CPU -> khiến tab đang "đứng sau" ngừng
        # vẽ nút mới dù lệnh vẫn gửi được bình thường (đây chính là bug
        # "gửi lệnh xong không nhấn được nút, F5 lại chạy được"). Các cờ
        # dưới đây tắt hành vi throttle đó cho toàn bộ phiên Edge này.
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-features=CalculateNativeWinOcclusion",
    ]

    print(f"🆕 [{label}] Đang mở Edge (profile game, port {port})...")
    try:
        subprocess.Popen(args, close_fds=True)
    except Exception as e:
        print(f"❌ [{label}] Không thể mở Edge: {e}")
        return False

    return True


def attach_or_launch_game_edge(label):
    """
    1. Nếu đã có Edge đang mở với remote-debugging-port=GAME_DEBUG_PORT (do
       npc_bot.py hoặc boss_bot.py chạy trước), attach thẳng vào -> KHÔNG
       mở cửa sổ mới, KHÔNG đăng nhập lại.
    2. Nếu chưa có, tự mở Edge mới bằng GAME profile + port đó, đợi port
       sẵn sàng rồi attach.
    3. Sau khi attach, luôn mở TAB riêng cho bot này (NPC và Boss không
       dùng chung 1 tab) rồi driver.switch_to tab đó.

    Trả về (driver, is_first_launcher) hoặc (None, False) nếu thất bại.
    """
    port = GAME_DEBUG_PORT
    is_first_launcher = False

    if not _debug_port_alive(port):
        is_first_launcher = True
        user_data_dir = GAME_EDGE_USER_DATA_DIR
        profile_dir = GAME_PROFILE_DIR

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            ok = _launch_edge_with_debug_port(user_data_dir, profile_dir, port, label)
            if not ok:
                print(f"❌ [{label}] Không tìm thấy msedge.exe. Hãy đặt EDGE_BINARY_PATH trong config.txt.")
                return None, False

            # Đợi debug port sẵn sàng (Edge cần vài giây để khởi động).
            deadline = time.time() + 25
            while time.time() < deadline:
                if _debug_port_alive(port):
                    break
                time.sleep(0.5)

            if _debug_port_alive(port):
                break  # thành công

            print(f"⚠️ [{label}] Lần thử {attempt}/{max_attempts}: Edge không mở được remote-debugging-port {port}.")
            print("   Có thể do profile đang bị khoá (SingletonLock) bởi một Edge khác.")
            if attempt < max_attempts:
                print("👉 Vui lòng đóng tất cả cửa sổ Edge đang dùng profile này, rồi nhấn ENTER để thử lại.")
                input()
            else:
                print("❌ Hết số lần thử. Hãy đóng Edge và chạy lại script.")
                return None, False
    else:
        print(f"🔗 [{label}] Đã phát hiện Edge đang chạy sẵn (port {port}) -> attach vào, không mở cửa sổ mới.")

    try:
        opt = Options()
        opt.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
        driver = webdriver.Edge(options=opt)
    except Exception as e:
        print(f"❌ [{label}] Không attach được vào Edge (port {port}): {e}")
        return None, False

    # Mỗi bot làm việc trên 1 tab riêng để không tranh chấp DOM/scroll.
    try:
        driver.switch_to.new_window("tab")
    except Exception:
        pass

    # QUAN TRỌNG: ép tab NÀY luôn được Chromium coi là "đang focus", bất
    # kể thực tế bạn có đang xem tab này hay không. Nếu không có dòng
    # này, khi bạn chuyển sang xem tab Boss (hoặc cửa sổ khác), tab NPC
    # sẽ bị throttle -> Discord ngừng vẽ nút mới dù !npc vẫn gửi được
    # bình thường (đúng bug đã gặp: gửi lệnh xong không nhấn được nút,
    # F5 mới chạy lại được vì reload buộc vẽ lại ngay). Cờ khởi động Edge
    # ở _launch_edge_with_debug_port() giảm throttle ở mức trình duyệt,
    # còn dòng này ép cụ thể tab/target hiện tại của driver này - nên áp
    # dụng đúng dù Edge được người khác mở trước (nhánh "attach vào Edge
    # có sẵn") mà không có các cờ khởi động ở trên.
    try:
        driver.execute_cdp_cmd("Emulation.setFocusEmulationEnabled", {"enabled": True})
    except Exception as e:
        print(f"⚠️ [{label}] Không bật được focus emulation (không nghiêm trọng, vẫn tiếp tục): {e}")

    return driver, is_first_launcher


def close_driver_only(driver):
    """
    Chỉ đóng session Selenium (rời khỏi tab của CHÍNH bot này).
    KHÔNG quit() toàn bộ Edge vì Edge được attach dùng chung với bot kia.
    KHÔNG bao giờ taskkill msedge.exe toàn hệ thống.
    """
    if driver is None:
        return
    try:
        driver.close()
    except Exception:
        pass
    try:
        driver.quit()
    except Exception:
        # driver.quit() trên session attach có thể lỗi vô hại nếu tab đã đóng.
        pass


# ============================================================
# DISCORD
# ============================================================

def open_discord(driver, label):
    def reapply_focus_emulation():
        # driver.get()/refresh() điều hướng trang có thể làm mất thiết
        # lập CDP đã set trước đó (ở attach_or_launch_game_edge) -> gọi
        # lại ngay trước khi coi như "sẵn sàng" để chắc chắn tab này
        # không bị Chromium throttle khi mất focus về sau.
        try:
            driver.execute_cdp_cmd("Emulation.setFocusEmulationEnabled", {"enabled": True})
        except Exception:
            pass

    try:
        driver.get("https://discord.com/app")
        time.sleep(6)

        current_url = driver.current_url
        if "login" in current_url.lower():
            print(f"🔐 [{label}] Đang ở trang đăng nhập Discord.")
            print(f"👉 [{label}] Vui lòng đăng nhập thủ công trên tab này rồi quay lại đây.")
            input(f"⏳ [{label}] Nhấn ENTER sau khi đã đăng nhập xong...")
            driver.refresh()
            time.sleep(5)

        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, TEXTBOX_SELECTOR))
            )
            reapply_focus_emulation()
            return True
        except Exception:
            print(f"⚠️ [{label}] Không tìm thấy textbox. Vui lòng chọn kênh chat.")
            input(f"⏳ [{label}] Nhấn ENTER sau khi đã chọn kênh...")
            try:
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, TEXTBOX_SELECTOR))
                )
                reapply_focus_emulation()
                return True
            except Exception:
                print(f"❌ [{label}] Vẫn không tìm thấy textbox.")
                return False

    except Exception as e:
        print(f"❌ [{label}] Lỗi mở Discord: {e}")
        return False


def send_command(driver, message):
    try:
        textbox = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, TEXTBOX_SELECTOR))
        )
        textbox.click()
        time.sleep(0.2)
        textbox.send_keys(Keys.CONTROL + "a")
        textbox.send_keys(Keys.DELETE)
        time.sleep(0.1)
        textbox.send_keys(message)
        time.sleep(0.2)
        textbox.send_keys(Keys.RETURN)
        return True
    except Exception as e:
        print(f"❌ Lỗi gửi lệnh: {e}")
        return False


# ============================================================
# MESSAGE HELPERS (giữ nguyên logic workbuttonclick)
# ============================================================

def get_all_messages(driver):
    try:
        return driver.find_elements(By.CSS_SELECTOR, MESSAGE_SELECTOR)
    except Exception:
        return []


def get_latest_message(driver):
    try:
        messages = get_all_messages(driver)
        if messages:
            return messages[-1]
    except Exception:
        pass
    return None


def message_has_buttons(msg):
    try:
        return len(msg.find_elements(By.CSS_SELECTOR, 'button[role="button"]')) > 0
    except Exception:
        return False


def get_message_key(msg):
    try:
        return msg.get_attribute("id") or ""
    except Exception:
        return ""


def get_latest_battle_message(driver, known_message_keys=None, max_look_back=None):
    """NPC: phải chứa PLAYER_NAME + có button. Ưu tiên message mới sau !npc."""
    known_message_keys = known_message_keys or set()
    look_back = max_look_back or MAX_LOOK_BACK

    try:
        messages = get_all_messages(driver)
        if not messages:
            return None

        recent = messages[-look_back:]

        for msg in reversed(recent):
            try:
                key = get_message_key(msg)
                if key in known_message_keys:
                    continue
                msg_text = msg.text.strip()
                if not msg_text:
                    continue
                if PLAYER_NAME.lower() not in msg_text.lower():
                    continue
                if message_has_buttons(msg):
                    return msg
            except Exception:
                continue

        # Fallback sau re-render DOM: vẫn bắt buộc đúng PLAYER_NAME.
        for msg in reversed(recent):
            try:
                msg_text = msg.text.strip()
                if not msg_text:
                    continue
                if PLAYER_NAME.lower() not in msg_text.lower():
                    continue
                if message_has_buttons(msg):
                    return msg
            except Exception:
                continue

        return None
    except Exception as e:
        print(f"⚠️ Lỗi tìm battle message NPC: {e}")
        return None


def get_my_battle_message(driver):
    return get_latest_battle_message(driver)


def get_latest_boss_message(driver):
    try:
        messages = get_all_messages(driver)
        if not messages:
            return None

        for msg in reversed(messages):
            try:
                msg_text = msg.text.strip()
                if not msg_text:
                    continue
                if BOSS_USER_NAME.lower() not in msg_text.lower():
                    continue
                if message_has_buttons(msg):
                    return msg
            except Exception:
                continue

        return None
    except Exception as e:
        print(f"⚠️ Lỗi tìm message boss: {e}")
        return None


def get_latest_player_message(driver):
    try:
        messages = get_all_messages(driver)
        if not messages:
            return None
        for msg in reversed(messages[-MAX_LOOK_BACK:]):
            try:
                text = (msg.text or "").strip()
                if not text:
                    continue
                if PLAYER_NAME.lower() in text.lower():
                    return msg
            except Exception:
                continue
    except Exception:
        pass
    return None


# ============================================================
# CLICK (KHÔNG ĐƯỢC ĐỔI CƠ CHẾ - nguồn chuẩn: workbuttonclick.txt)
# ============================================================

def find_and_click_skill(driver, skill_name, max_retries=3, target_msg=None, mode="NPC"):
    for retry in range(max_retries):
        try:
            if retry > 0:
                time.sleep(0.15)

            if target_msg is not None:
                try:
                    _ = target_msg.tag_name
                    battle_msg = target_msg
                except Exception:
                    if mode == "BOSS":
                        battle_msg = get_latest_boss_message(driver)
                    else:
                        battle_msg = get_my_battle_message(driver)
            else:
                if mode == "BOSS":
                    battle_msg = get_latest_boss_message(driver)
                else:
                    battle_msg = get_my_battle_message(driver)

            if battle_msg is None:
                time.sleep(0.15)
                continue

            buttons = battle_msg.find_elements(By.CSS_SELECTOR, 'button[role="button"]')
            if not buttons:
                time.sleep(0.15)
                continue

            for btn in buttons:
                try:
                    btn_text = btn.text.strip()
                    if btn_text and skill_name.lower() in btn_text.lower():
                        btn.click()
                        dprint(f"   ✅ Đã click: {btn_text}")
                        return True

                    imgs = btn.find_elements(By.CSS_SELECTOR, "img")
                    for img in imgs:
                        alt = img.get_attribute("alt")
                        if alt and skill_name.lower() in alt.lower():
                            btn.click()
                            dprint(f"   ✅ Đã click: {alt}")
                            return True
                except (StaleElementReferenceException, Exception):
                    continue

            time.sleep(0.15)

        except Exception as e:
            dprint(f"   ⚠️ Lỗi tìm kỹ năng: {e}")
            time.sleep(0.15)

    print(f"   ❌ Không tìm thấy/click được kỹ năng: {skill_name}")
    return False


# ============================================================
# DISMISS / BOSS SPECIAL MESSAGE (giữ nguyên logic v7, đã đúng theo spec)
# ============================================================

def find_and_click_dismiss(msg, driver=None):
    if msg is None:
        return False

    wanted = DISMISS_TEXT.strip().lower()
    wanted_variants = {wanted, "dismiss message"}

    def has_wanted_text(element):
        try:
            values = [
                (element.text or "").strip(),
                element.get_attribute("aria-label") or "",
                element.get_attribute("title") or "",
                element.get_attribute("data-label") or "",
            ]
            return any(
                any(v.lower().strip() == w or w in v.lower() for w in wanted_variants)
                for v in values if v
            )
        except Exception:
            return False

    def js_click(element):
        try:
            driver_ref = driver
            if driver_ref is None:
                driver_ref = getattr(msg, "_parent", None)
            if driver_ref is not None and hasattr(driver_ref, "execute_script"):
                driver_ref.execute_script(
                    "arguments[0].scrollIntoView({block:'center', inline:'center'});"
                    "arguments[0].click();",
                    element,
                )
                return True
        except Exception:
            pass
        return False

    def try_click(element):
        try:
            if not element.is_displayed():
                return False
        except Exception:
            pass
        try:
            element.click()
            return True
        except Exception:
            return js_click(element)

    def click_matching_candidates(root):
        if root is None:
            return False
        try:
            candidates = root.find_elements(By.CSS_SELECTOR, 'button, [role="button"], a')
        except Exception:
            candidates = []

        for candidate in candidates:
            try:
                if not has_wanted_text(candidate):
                    continue
                if try_click(candidate):
                    return True
            except Exception:
                continue

        xpath = (
            "//*[contains(translate(normalize-space(.), "
            "'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "
            f"'{wanted}')]"
        )
        xpath2 = (
            "//*[contains(translate(normalize-space(.), "
            "'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "
            "'dismiss message')]"
        )

        found = []
        for xp in (xpath, xpath2):
            try:
                found.extend(root.find_elements(By.XPATH, xp))
            except Exception:
                continue

        for element in reversed(found):
            try:
                if try_click(element):
                    return True
                ancestors = element.find_elements(
                    By.XPATH, "ancestor::*[self::button or self::a or @role='button']"
                )
                for ancestor in ancestors:
                    if try_click(ancestor):
                        return True
            except Exception:
                continue

        return False

    try:
        if click_matching_candidates(msg):
            return True

        try:
            wrappers = msg.find_elements(
                By.XPATH,
                "ancestor::*[self::li or @role='article' or contains(@class,'message')][1]"
            )
            for wrapper in wrappers:
                if click_matching_candidates(wrapper):
                    return True
        except Exception:
            pass

        if driver is not None:
            try:
                global_elements = driver.find_elements(
                    By.XPATH,
                    "//*[contains(translate(normalize-space(.), "
                    "'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "
                    "'dissmiss message') or "
                    "contains(translate(normalize-space(.), "
                    "'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "
                    "'dismiss message')]"
                )
                for element in reversed(global_elements):
                    try:
                        if not element.is_displayed():
                            continue
                        clickable = element.find_elements(
                            By.XPATH, "ancestor::*[self::button or self::a or @role='button'][1]"
                        )
                        for ancestor in clickable:
                            if try_click(ancestor):
                                return True
                        if try_click(element):
                            return True
                    except Exception:
                        continue
            except Exception:
                pass

    except Exception as e:
        print(f"   ⚠️ Lỗi click dismiss: {e}")

    return False


def handle_latest_boss_special_message(driver):
    try:
        latest = get_latest_message(driver)
        if latest is None:
            return None

        text = (latest.text or "").strip()
        lower = text.lower()

        if BOSS_END_TEXT.lower() in lower:
            return "END"

        if BOSS_DEAD_TEXT.lower() in lower:
            print("💀 Boss: đang chết/hồi sinh -> dismiss.")
            if find_and_click_dismiss(latest, driver):
                print(f"⏳ Đã dismiss -> chờ {BOSS_MESSAGE_WAIT}s hồi sinh...")
                time.sleep(BOSS_MESSAGE_WAIT)
                return "RESURRECT_WAIT"
            print("⚠️ Không click được Dismiss, sẽ thử lại.")
            return None

        if BOSS_ONLY_YOU_TEXT.lower() in lower:
            print("👁️ 'Only you can see this' -> dismiss.")
            if find_and_click_dismiss(latest, driver):
                time.sleep(0.2)
                return "ONLY_YOU_DISMISSED"
            print("⚠️ Không click được Dismiss.")
            return None

        return None

    except StaleElementReferenceException:
        return None
    except Exception as e:
        print(f"⚠️ Lỗi xử lý special boss message: {e}")
        return None


# ============================================================
# BATTLE RESULT (NPC)
# ============================================================

def _battle_result_from_text(msg_text):
    """Trả 'win' / 'lose' / None theo cụm liên tục gắn với PLAYER_NAME,
    dùng CHUNG cho check_battle_ended(), check_npc_post_skill_state() và
    get_battle_result() để tránh 2 nơi có logic lệch nhau (bug đã xác nhận:
    check_battle_ended cũ dùng substring rời rạc "thắng"/"thua" ở bất kỳ
    đâu -> false positive giữa trận, dừng spam skill quá sớm)."""
    if not msg_text:
        return None

    text = msg_text.strip().lower()
    player_name = PLAYER_NAME.strip().lower()
    win_text = f"{player_name} chiến thắng"
    lose_text_variants = (f"{player_name} thua", f"{player_name} thất bại")

    if win_text in text:
        return "win"
    if any(v in text for v in lose_text_variants):
        return "lose"

    # KHÔNG dùng fallback "chiến thắng"/"thất bại" rời rạc không gắn
    # PLAYER_NAME nữa — đã kiểm chứng gây false positive thật (ví dụ text
    # mô tả buff "Cơ hội chiến thắng tăng thêm 5%..." bị hiểu nhầm là kết
    # quả trận). Chỉ còn "cháy chết" là biệt lệ đặc thù của game.
    if "cháy chết" in text:
        return "win"

    return None


def check_battle_ended(driver, target_msg=None):
    try:
        msg = target_msg if target_msg is not None else get_my_battle_message(driver)
        if msg is None:
            return False

        return _battle_result_from_text(msg.text) is not None
    except Exception:
        return False


def get_battle_result(driver):
    """Win/lose phải theo cụm liên tục 'PLAYER_NAME CHIẾN THẮNG/THUA',
    không match rời rạc để tránh false positive (theo BA spec Phần B.7)."""
    try:
        messages = get_all_messages(driver)
        if not messages:
            return "unknown"

        recent = messages[-MAX_LOOK_BACK:]

        for msg in reversed(recent):
            try:
                msg_text = msg.text.strip()
                if not msg_text:
                    continue

                result = _battle_result_from_text(msg_text)
                if result is not None:
                    return result

            except Exception:
                continue

        return "unknown"
    except Exception:
        return "unknown"


# ============================================================
# NPC COOLDOWN DETECTION (ĐÃ SỬA LỖI FALSE-POSITIVE)
# ============================================================
#
# LỖI GỐC (nguyên nhân chính khiến NPC "flow đúng nhưng không click"):
# Regex cũ: r"còn\s*(?:(\d+)\s*p\s*)?(?:(\d+)\s*s)?"
# Cả 2 group đều optional -> chỉ cần chữ "còn" xuất hiện là match, trả
# total=0 (không phải None). Vì code coi "cooldown_seconds is not None"
# là đang cooldown, nên CHỈ CẦN message mới (kể cả chính message battle
# NPC) chứa cả 2 từ "hồi chiêu" và "còn" ở bất kỳ đâu trong nội dung
# (rất dễ xảy ra vì "hồi chiêu" là thuật ngữ chung của skill/trạng thái
# trong log battle) là bot NGHĨ NPC đang cooldown, gửi lại !npc thay vì
# spam skill -> lặp vô hạn, không bao giờ click được button.
#
# FIX: bắt buộc phải có ít nhất 1 chữ số thật sự đi kèm "p"/"s", và
# message đó KHÔNG được có button skill (message cooldown thật của
# Discord không có button; message battle luôn có button).

def extract_npc_cooldown_seconds(text):
    if not text:
        return None

    normalized = " ".join(text.split())
    lower = normalized.lower()

    if "hồi chiêu" not in lower:
        return None

    match = re.search(r"còn\s*(?:(\d+)\s*p)?\s*(?:(\d+)\s*s)", lower)
    if not match:
        match = re.search(r"(?:(\d+)\s*p)?\s*(\d+)\s*s\s*(?:nữa)?", lower)

    if not match:
        return None

    minutes_raw, seconds_raw = match.group(1), match.group(2)
    if minutes_raw is None and seconds_raw is None:
        return None

    minutes = int(minutes_raw or 0)
    seconds = int(seconds_raw or 0)
    total = minutes * 60 + seconds

    return total if total > 0 else None


def get_new_npc_cooldown_message(driver, known_message_keys):
    """Chỉ coi là cooldown khi: message MỚI, có số giây hợp lệ, và
    KHÔNG có nút skill (tránh nhầm với chính message battle)."""
    try:
        messages = get_all_messages(driver)

        for msg in reversed(messages[-MAX_LOOK_BACK:]):
            try:
                key = get_message_key(msg)
                if key in known_message_keys:
                    continue

                if message_has_buttons(msg):
                    # Đây là message battle thật (có nút skill) -> không
                    # phải cooldown notice, kể cả khi nhắc tới "hồi chiêu".
                    continue

                msg_text = msg.text.strip()
                cooldown = extract_npc_cooldown_seconds(msg_text)
                if cooldown is not None:
                    return msg, cooldown
            except Exception:
                continue
    except Exception:
        pass

    return None, None


def check_npc_post_skill_state(driver):
    latest = get_latest_player_message(driver)
    if latest is None:
        return None

    try:
        text = (latest.text or "").strip()

        if _battle_result_from_text(text) is not None:
            return ("ENDED", None)

        if not message_has_buttons(latest):
            cooldown = extract_npc_cooldown_seconds(text)
            if cooldown is not None:
                return ("COOLDOWN", cooldown)

    except Exception:
        return None

    return None


def interruptible_sleep(seconds, should_stop_fn):
    end_time = time.time() + max(0, seconds)
    while time.time() < end_time:
        if should_stop_fn():
            return False
        remaining = end_time - time.time()
        time.sleep(min(0.25, max(0.05, remaining)))
    return True


# ============================================================
# STARTUP GATE — bắt buộc chờ ENTER trước khi bắt đầu bất kỳ vòng lặp
# tự động nào (yêu cầu Lần 3, mục 3).
# ============================================================

def wait_for_enter_to_start(label, extra_lines=None):
    print(f"\n{'=' * 60}")
    print(f"✅ [{label}] Đã sẵn sàng (Edge + Discord đã mở).")
    if extra_lines:
        for line in extra_lines:
            print(line)
    print(f"👉 [{label}] Nhấn ENTER để BẮT ĐẦU chạy tự động...")
    print(f"{'=' * 60}")
    input()
