import os
import re
import time
import threading
import queue
import unicodedata
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import StaleElementReferenceException, WebDriverException

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "quiz_config.txt")
QUIZ_FILE = os.path.join(BASE_DIR, "quiz.txt")

DEFAULT_CONFIG = {
    "DISCORD_URL": "https://discord.com/channels/@me",
    "EDGE_USER_DATA_DIR": "edge_quiz_profile",
    "EDGE_PROFILE_DIR": "Default",
    "TEXTBOX_SELECTOR": 'div[role="textbox"]',
    "MESSAGE_SELECTOR": 'li[id^="chat-messages-"]',
    "BOT_NAME": "Xỏ lá ba que",
    "PLAYER_NAME": "Thích Gáy Đểu",
    "QUESTION_MARKER": "CÂU HỎI NHANH!",
    "CORRECT_MARKER": "CHÍNH XÁC!",
    "TIMEOUT_MARKER": "HẾT GIỜ!",
    "ANSWER_MARKER": "Đáp án:",
    "UNKNOWN_ANSWER": "khầy chùa",
    "SCAN_INTERVAL": "0.1",
    "MAX_MESSAGES": "30",
    "ACTIVE_QUESTION_TTL": "180",
    "RENDER_SETTLE_MS": "20",
    "SEND_MODE": "selenium",
    "CRAWL_SCROLL_WAIT": "0.6",
    "CRAWL_STABLE_ROUNDS": "1.5",
    "CRAWL_DEBUG": "true",
}

CONFIG = {}
DISCORD_URL = ""
EDGE_USER_DATA_DIR = ""
EDGE_PROFILE_DIR = ""
TEXTBOX_SELECTOR = ""
MESSAGE_SELECTOR = ""
BOT_NAME = ""
PLAYER_NAME = ""
QUESTION_MARKER = ""
CORRECT_MARKER = ""
TIMEOUT_MARKER = ""
ANSWER_MARKER = ""
UNKNOWN_ANSWER = ""
SCAN_INTERVAL = 0.1
MAX_MESSAGES = 30
ACTIVE_QUESTION_TTL = 180
RENDER_SETTLE_MS = 20
SEND_MODE = "selenium"
CRAWL_SCROLL_WAIT = 0.6
CRAWL_STABLE_ROUNDS = 1.5
CRAWL_DEBUG = True

should_stop = False
active_questions = {}          # message_id -> temporary question state
processed_message_ids = set()  # result/new-message dedupe
message_snapshots = {}         # message_id -> last text, detects edited timeout messages
quiz_answers = {}              # normalized question -> answer

command_queue = queue.Queue()
crawl_stop_event = threading.Event()
crawl_running = False
startup_action = None
recent_user_answers = {}   # message_id -> {id,text,author,reply_text,timestamp}


def strip_value(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return value.strip()


def create_default_config():
    content = '''# ============================================================
# QUIZ BOT CONFIGURATION
# ============================================================
# Chạy song song với bot NPC/Boss bằng user-data-dir riêng.
# Lần đầu chạy, đăng nhập Discord vào profile này.

DISCORD_URL=https://discord.com/channels/@me
EDGE_USER_DATA_DIR=edge_quiz_profile
EDGE_PROFILE_DIR=Default

TEXTBOX_SELECTOR=div[role="textbox"]
MESSAGE_SELECTOR=li[id^="chat-messages-"]

BOT_NAME=Xỏ lá ba que
PLAYER_NAME=Thích Gáy Đểu

QUESTION_MARKER=CÂU HỎI NHANH!
CORRECT_MARKER=CHÍNH XÁC!
TIMEOUT_MARKER=HẾT GIỜ!
ANSWER_MARKER=Đáp án:
UNKNOWN_ANSWER=khầy chùa

SCAN_INTERVAL=0.1
MAX_MESSAGES=80
ACTIVE_QUESTION_TTL=180

# LƯU Ý (bản tối ưu tốc độ):
# Bot dùng MutationObserver để phát hiện message mới GẦN NHƯ TỨC THÌ
# (không còn polling cố định theo SCAN_INTERVAL nữa). SCAN_INTERVAL giờ
# chỉ còn 2 vai trò:
#   1. Ngưỡng "thức dậy" tối đa để kiểm tra lệnh (stop/reload/crawl...)
#      ngay cả khi không có message mới.
#   2. Chu kỳ polling DỰ PHÒNG - chỉ dùng khi MutationObserver bị lỗi.

# Thời gian (mili-giây) chờ thêm SAU KHI phát hiện DOM thay đổi, TRƯỚC
# KHI đọc nội dung message. Cần thiết vì Discord (React) thường dựng
# khung message trước rồi mới đổ chữ vào sau qua nhiều bước - đọc quá
# sớm có thể bắt phải nội dung chưa đầy đủ. Giảm số này -> phản hồi
# nhanh hơn nhưng tăng rủi ro đọc thiếu chữ; tăng lên -> an toàn hơn
# nhưng chậm hơn. 20ms là mức cân bằng hợp lý, không nên đặt dưới 10.
RENDER_SETTLE_MS=20

# CHẾ ĐỘ GỬI ĐÁP ÁN - đánh đổi TỐC ĐỘ vs ĐỘ TIN CẬY:
#   selenium (mặc định, AN TOÀN) - gõ phím thật qua Selenium (click +
#       send_keys). Đáng tin cậy 100%, đã dùng ổn định từ trước.
#   js (NHANH HƠN, có rủi ro) - "bơm" chữ trực tiếp vào ô chat bằng
#       JavaScript (execCommand insertText + bắn sự kiện Enter), bỏ qua
#       việc gõ phím thật -> nhanh hơn vì gộp hết vào 1 round-trip. CÓ
#       XÁC MINH: sau khi bắn Enter, code tự kiểm tra ô chat đã trống
#       chưa (dấu hiệu Discord đã nhận); nếu không xác nhận được trong
#       300ms, sẽ TỰ ĐỘNG rơi về cách "selenium" để đảm bảo không mất
#       câu trả lời. Rủi ro còn lại: editor của Discord dựa trên React,
#       một số phiên bản/trạng thái trình duyệt có thể khiến JS không
#       kích hoạt đúng sự kiện input như gõ phím thật - dù đã có xác minh
#       + fallback, vẫn khuyến nghị theo dõi log vài chục câu đầu sau khi
#       bật để chắc chắn ổn định trên máy bạn trước khi tin tưởng hoàn toàn.
SEND_MODE=selenium

# Crawl
CRAWL_SCROLL_WAIT=0.6
CRAWL_STABLE_ROUNDS=3
CRAWL_DEBUG=true
'''
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write(content)


def load_config():
    global CONFIG, DISCORD_URL, EDGE_USER_DATA_DIR, EDGE_PROFILE_DIR
    global TEXTBOX_SELECTOR, MESSAGE_SELECTOR, BOT_NAME, PLAYER_NAME
    global QUESTION_MARKER, CORRECT_MARKER, TIMEOUT_MARKER, ANSWER_MARKER
    global UNKNOWN_ANSWER, SCAN_INTERVAL, MAX_MESSAGES, ACTIVE_QUESTION_TTL
    global RENDER_SETTLE_MS
    global SEND_MODE
    global CRAWL_SCROLL_WAIT, CRAWL_STABLE_ROUNDS, CRAWL_DEBUG

    config = DEFAULT_CONFIG.copy()
    if not os.path.exists(CONFIG_FILE):
        create_default_config()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or line.startswith(";") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip().upper()
                if key in config:
                    config[key] = strip_value(value)
    except Exception as e:
        print(f"⚠️ Lỗi đọc config: {e}")

    CONFIG = config
    DISCORD_URL = config["DISCORD_URL"]
    EDGE_USER_DATA_DIR = config["EDGE_USER_DATA_DIR"]
    if EDGE_USER_DATA_DIR and not os.path.isabs(EDGE_USER_DATA_DIR):
        EDGE_USER_DATA_DIR = os.path.join(BASE_DIR, EDGE_USER_DATA_DIR)
    EDGE_PROFILE_DIR = config["EDGE_PROFILE_DIR"]
    TEXTBOX_SELECTOR = config["TEXTBOX_SELECTOR"]
    MESSAGE_SELECTOR = config["MESSAGE_SELECTOR"]
    BOT_NAME = config["BOT_NAME"]
    PLAYER_NAME = config["PLAYER_NAME"]
    QUESTION_MARKER = config["QUESTION_MARKER"]
    CORRECT_MARKER = config["CORRECT_MARKER"]
    TIMEOUT_MARKER = config["TIMEOUT_MARKER"]
    ANSWER_MARKER = config["ANSWER_MARKER"]
    UNKNOWN_ANSWER = config["UNKNOWN_ANSWER"]
    SCAN_INTERVAL = max(0.05, float(config["SCAN_INTERVAL"]))
    MAX_MESSAGES = max(20, int(float(config["MAX_MESSAGES"])))
    ACTIVE_QUESTION_TTL = max(30, int(float(config["ACTIVE_QUESTION_TTL"])))
    RENDER_SETTLE_MS = max(0, int(float(config["RENDER_SETTLE_MS"])))
    SEND_MODE = strip_value(config["SEND_MODE"]).lower()
    if SEND_MODE not in ("selenium", "js"):
        print(f"⚠️ SEND_MODE='{SEND_MODE}' không hợp lệ -> dùng 'selenium' (an toàn).")
        SEND_MODE = "selenium"
    CRAWL_SCROLL_WAIT = max(0.1, float(config["CRAWL_SCROLL_WAIT"]))
    CRAWL_STABLE_ROUNDS = max(1, int(float(config["CRAWL_STABLE_ROUNDS"])))
    CRAWL_DEBUG = strip_value(config["CRAWL_DEBUG"]).lower() in ("1", "true", "yes", "on")


def normalize_text(text):
    text = (text or "").replace("\u200b", " ").replace("\xa0", " ")
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def normalize_question(text):
    text = normalize_text(text)
    text = re.sub(r"^[\s\W]*câu hỏi nhanh[!:\-\s]*", "", text, flags=re.I)
    text = re.sub(r"\s*trả lời đúng đầu tiên.*$", "", text, flags=re.I)
    text = re.sub(r"\s*gõ đáp án vào chat.*$", "", text, flags=re.I)
    text = re.sub(r"\s*\|\s*\d+\s*s?\s*để trả lời.*$", "", text, flags=re.I)
    return re.sub(r"[?？]+$", "", text).strip()


def load_quiz_file():
    global quiz_answers
    quiz_answers = {}
    if not os.path.exists(QUIZ_FILE):
        with open(QUIZ_FILE, "w", encoding="utf-8") as f:
            f.write("# Mỗi dòng: CÂU HỎI|CÂU TRẢ LỜI\n")
        return

    try:
        with open(QUIZ_FILE, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.rstrip("\n")
                if not line.strip() or line.lstrip().startswith("#") or "|" not in line:
                    continue
                question, answer = line.split("|", 1)
                if question.strip() and answer.strip():
                    quiz_answers[normalize_question(question)] = answer.strip()
    except Exception as e:
        print(f"⚠️ Lỗi đọc quiz.txt: {e}")


def save_quiz_answer(question, answer):
    question = re.sub(r"\s+", " ", (question or "")).strip()
    answer = re.sub(r"\s+", " ", (answer or "")).strip()
    key = normalize_question(question)
    if not key or not answer:
        return False

    if key in quiz_answers:
        return quiz_answers[key].strip() == answer.strip()

    try:
        with open(QUIZ_FILE, "a", encoding="utf-8") as f:
            f.write(f"{question}|{answer}\n")
        quiz_answers[key] = answer
        print(f"💾 Đã thêm quiz mới: {question} -> {answer}")
        return True
    except Exception as e:
        print(f"❌ Không thể ghi quiz.txt: {e}")
        return False


def init_driver():
    os.makedirs(EDGE_USER_DATA_DIR, exist_ok=True)
    options = webdriver.EdgeOptions()
    options.add_argument(f"--user-data-dir={os.path.abspath(EDGE_USER_DATA_DIR)}")
    options.add_argument(f"--profile-directory={EDGE_PROFILE_DIR}")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-notifications")
    try:
        driver = webdriver.Edge(options=options)
        driver.set_page_load_timeout(30)
        # execute_async_script (dùng cho wait_for_message_events) cần
        # script timeout đủ lớn để KHÔNG bao giờ là nguyên nhân timeout
        # sớm hơn logic chờ bên trong JS (vốn chỉ chờ tối đa vài trăm ms).
        driver.set_script_timeout(15)
        return driver
    except Exception as e:
        print(f"❌ Không khởi động được Edge Quiz: {e}")
        return None


def open_discord(driver):
    try:
        driver.get(DISCORD_URL)
        time.sleep(5)
        return True
    except Exception as e:
        print(f"❌ Không mở được Discord: {e}")
        return False


def close_driver(driver):
    if driver is not None:
        try:
            driver.quit()
        except Exception:
            pass


def get_all_messages(driver):
    try:
        return driver.find_elements(By.CSS_SELECTOR, MESSAGE_SELECTOR)
    except Exception:
        return []


class MsgSnap:
    """Đại diện nhẹ cho 1 message, dữ liệu đã lấy sẵn từ JS batch scan
    (fetch_message_snapshots) thay vì gọi driver.find_elements() nhiều lần.

    Có .text và .get_attribute('id') để tương thích ngược 100% với
    message_id()/message_text() vốn được viết cho Selenium WebElement -
    không cần sửa 2 hàm đó."""
    __slots__ = ("id", "text", "author", "reply_text", "timestamp")

    def __init__(self, id, text, author, reply_text, timestamp):
        self.id = id
        self.text = text
        self.author = author
        self.reply_text = reply_text
        self.timestamp = timestamp

    def get_attribute(self, name):
        return self.id if name == "id" else None


# JS này chạy 1 LẦN trong browser, tự duyệt DOM và trả về toàn bộ dữ liệu
# cần thiết (id, text, author, reply_text, timestamp) cho N message gần
# nhất. Thay thế cho việc Selenium gọi find_elements() lặp lại nhiều lần
# (id, text, rồi author dò 3 selector, rồi reply dò 4 selector, rồi
# timestamp...) - MỖI lần gọi từ Python sang browser là 1 round-trip qua
# lại tốn hàng chục-hàng trăm ms cộng dồn. Gộp thành 1 round-trip duy
# nhất là tối ưu quan trọng nhất cho tốc độ phản hồi.
JS_SCAN_MESSAGES = """
const sel = arguments[0];
const limit = arguments[1];
const nodes = document.querySelectorAll(sel);
const start = Math.max(0, nodes.length - limit);
const authorSelectors = ['[class*="username"]', '[class*="headerText"] [class*="username"]', 'h3 span'];
const replySelectors = ['[class*="repliedMessage"]', '[class*="replyingTo"]', '[id*="message-reply"]', '[class*="messageReply"]'];
const out = [];
for (let i = start; i < nodes.length; i++) {
    const el = nodes[i];
    const id = el.id || "";
    if (!id) continue;

    const text = (el.innerText || "").trim();

    let author = "";
    for (const s of authorSelectors) {
        const n = el.querySelector(s);
        if (n) {
            const t = (n.innerText || "").trim();
            if (t) { author = t; break; }
        }
    }

    let replyText = "";
    for (const s of replySelectors) {
        const n = el.querySelector(s);
        if (n) {
            const t = (n.innerText || "").trim();
            if (t) { replyText = t; break; }
        }
    }

    let ts = 0;
    const timeNode = el.querySelector('time[datetime], [datetime]');
    if (timeNode) {
        const dtStr = timeNode.getAttribute('datetime');
        if (dtStr) {
            const parsed = Date.parse(dtStr);
            if (!isNaN(parsed)) ts = parsed / 1000;
        }
    }

    out.push({id: id, text: text, author: author, reply_text: replyText, timestamp: ts});
}
return out;
"""


def fetch_message_snapshots(driver, limit):
    """Lấy snapshot của tối đa `limit` message gần nhất bằng 1 round-trip
    JS duy nhất. Dùng cho vòng lặp chính (scan_messages/update_candidate_answers)
    - KHÔNG dùng cho crawl (crawl vẫn dùng get_all_messages() + WebElement
    thật như cũ, vì crawl không nhạy cảm về tốc độ và code crawl đã ổn định)."""
    try:
        raw = driver.execute_script(JS_SCAN_MESSAGES, MESSAGE_SELECTOR, limit)
    except Exception:
        return []

    result = []
    for item in raw or []:
        ts = item.get("timestamp") or 0
        msg_id = item.get("id") or ""
        if not ts:
            ts = snowflake_timestamp(msg_id)
        result.append(MsgSnap(
            id=msg_id,
            text=item.get("text") or "",
            author=item.get("author") or "",
            reply_text=item.get("reply_text") or "",
            timestamp=ts,
        ))
    return result


def _parse_snapshot_items(raw_items):
    result = []
    for item in raw_items or []:
        ts = item.get("timestamp") or 0
        msg_id = item.get("id") or ""
        if not ts:
            ts = snowflake_timestamp(msg_id)
        result.append(MsgSnap(
            id=msg_id,
            text=item.get("text") or "",
            author=item.get("author") or "",
            reply_text=item.get("reply_text") or "",
            timestamp=ts,
        ))
    return result


# execute_async_script GỘP 3 việc trước đây là 2 round-trip riêng
# (wait_for_dom_signal rồi fetch_message_snapshots) thành ĐÚNG 1
# round-trip duy nhất:
#   1. Chờ cờ __quizDirty (như JS_WAIT_FOR_SIGNAL cũ).
#   2. Đợi thêm settleMs (rất ngắn, mặc định ~20ms) để React kịp render
#      xong nội dung trước khi đọc - giữ nguyên mức an toàn như thiết kế
#      "luôn đọc lại đầy đủ" trước đó, KHÔNG đọc dữ liệu ngay trong
#      callback mutation nữa.
#   3. Scan toàn bộ (giống hệt JS_SCAN_MESSAGES) và trả kết quả về LUÔN
#      trong cùng round-trip, thay vì Python phải gọi thêm 1 lệnh riêng.
JS_WAIT_AND_SCAN = r"""
const timeoutMs = arguments[0];
const settleMs = arguments[1];
const sel = arguments[2];
const limit = arguments[3];
const callback = arguments[arguments.length - 1];
const startTime = Date.now();

const authorSelectors = ['[class*="username"]', '[class*="headerText"] [class*="username"]', 'h3 span'];
const replySelectors = ['[class*="repliedMessage"]', '[class*="replyingTo"]', '[id*="message-reply"]', '[class*="messageReply"]'];

function doScan() {
    const nodes = document.querySelectorAll(sel);
    const start = Math.max(0, nodes.length - limit);
    const out = [];
    for (let i = start; i < nodes.length; i++) {
        const el = nodes[i];
        const id = el.id || "";
        if (!id) continue;

        const text = (el.innerText || "").trim();

        let author = "";
        for (const s of authorSelectors) {
            const n = el.querySelector(s);
            if (n) { const t = (n.innerText || "").trim(); if (t) { author = t; break; } }
        }

        let replyText = "";
        for (const s of replySelectors) {
            const n = el.querySelector(s);
            if (n) { const t = (n.innerText || "").trim(); if (t) { replyText = t; break; } }
        }

        let ts = 0;
        const timeNode = el.querySelector('time[datetime], [datetime]');
        if (timeNode) {
            const dtStr = timeNode.getAttribute('datetime');
            if (dtStr) { const p = Date.parse(dtStr); if (!isNaN(p)) ts = p / 1000; }
        }

        out.push({id: id, text: text, author: author, reply_text: replyText, timestamp: ts});
    }
    callback({changed: true, messages: out});
}

function check() {
    if (window.__quizDirty) {
        window.__quizDirty = false;
        if (settleMs > 0) {
            setTimeout(doScan, settleMs);
        } else {
            doScan();
        }
        return;
    }
    if (Date.now() - startTime >= timeoutMs) {
        callback({changed: false, messages: []});
        return;
    }
    setTimeout(check, 6);
}
check();
"""


def wait_and_scan(driver, timeout_ms, settle_ms, limit):
    """Gộp wait_for_dom_signal() + fetch_message_snapshots() thành 1
    round-trip. Trả về:
      (True, messages)  -> có thay đổi, messages là dữ liệu ĐẦY ĐỦ đã sẵn
                            sàng dùng ngay (không cần fetch thêm)
      (False, [])       -> hết timeout, không có gì mới
      None              -> execute_async_script lỗi, cần fallback"""
    try:
        raw = driver.execute_async_script(
            JS_WAIT_AND_SCAN, timeout_ms, settle_ms, MESSAGE_SELECTOR, limit
        )
    except Exception:
        return None

    if not raw:
        return (False, [])

    changed = bool(raw.get("changed"))
    if not changed:
        return (False, [])

    return (True, _parse_snapshot_items(raw.get("messages")))


# ============================================================
# EVENT-DRIVEN DETECTION (MutationObserver) — tối ưu độ trễ lớn nhất còn
# lại. Trước đây Python phải "hỏi lại" mỗi SCAN_INTERVAL (polling): dù
# message mới xuất hiện ngay sau khi vừa hỏi xong, vẫn phải chờ tới lượt
# hỏi kế tiếp mới biết. Giờ cài 1 MutationObserver TRONG trình duyệt,
# theo dõi đúng khung chat - nó tự đẩy dữ liệu vào hàng đợi NGAY khi
# DOM đổi (message mới HOẶC message cũ bị edit tại chỗ, ví dụ CHÍNH
# XÁC!/HẾT GIỜ! ghi đè lên message câu hỏi). Python dùng
# execute_async_script để "ngủ và được đánh thức ngay" thay vì ngủ cố
# định rồi tự hỏi lại - độ trễ phát hiện giảm từ ~SCAN_INTERVAL xuống
# ~15ms (chu kỳ kiểm tra hàng đợi bên trong JS, cực rẻ vì không qua lại
# Python).
# ============================================================

# ============================================================
# EVENT-DRIVEN DETECTION (MutationObserver) — tối ưu độ trễ lớn nhất còn
# lại. Trước đây Python phải "hỏi lại" mỗi SCAN_INTERVAL (polling): dù
# message mới xuất hiện ngay sau khi vừa hỏi xong, vẫn phải chờ tới lượt
# hỏi kế tiếp mới biết.
#
# QUAN TRỌNG (đã sửa sau khi phát hiện bug): observer KHÔNG tự đọc/trích
# text ngay trong callback nữa. Lý do: khi Discord (React) chèn 1 message
# mới, nó thường dựng khung DOM trước rồi mới đổ nội dung chữ vào sau qua
# NHIỀU lần cập nhật liên tiếp. Nếu đọc text ngay ở lần mutation ĐẦU
# TIÊN, có thể bắt phải bản chưa có đủ chữ "CÂU HỎI NHANH!" -> bỏ sót
# câu hỏi, không gửi "khầy chùa" ngay như mong đợi.
#
# Thiết kế mới: observer CHỈ báo hiệu "vừa có gì đó đổi trong khung chat"
# (đặt 1 cờ dirty=true, không đọc text). Khi Python được đánh thức, luôn
# đọc lại TOÀN BỘ, ĐẦY ĐỦ, CHÍNH XÁC bằng fetch_message_snapshots() (JS
# batch scan 1 round-trip, cùng cơ chế đã dùng trước khi có observer) -
# đảm bảo không bao giờ xử lý dữ liệu nửa vời, chỉ đổi mỗi chỗ: được
# đánh thức GẦN NHƯ NGAY LẬP TỨC thay vì phải chờ hết 1 chu kỳ cố định.
# ============================================================

JS_INSTALL_OBSERVER = r"""
const sel = arguments[0];

function quizFindScroller(messageSelector) {
    const first = document.querySelector(messageSelector);
    if (!first) return document.body;
    let el = first;
    while (el) {
        const style = window.getComputedStyle(el);
        const scrollable = el.scrollHeight > el.clientHeight + 10 &&
                           (style.overflowY === 'auto' || style.overflowY === 'scroll');
        if (scrollable) return el;
        el = el.parentElement;
    }
    const candidates = Array.from(document.querySelectorAll('div, main, ol, ul'));
    for (const node of candidates) {
        if (node.scrollHeight > node.clientHeight + 100) {
            const style = window.getComputedStyle(node);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                if (node.querySelector(messageSelector)) return node;
            }
        }
    }
    return document.body;
}

// Nếu container chat bị Discord thay thế hoàn toàn (chuyển kênh...),
// observer cũ có thể "chết" âm thầm. Luôn kiểm tra lại target hiện tại
// mỗi lần install được gọi, và cài lại nếu target đã đổi.
const currentTarget = quizFindScroller(sel);

if (!window.__quizObserverInstalled || window.__quizObserverTarget !== currentTarget) {
    if (window.__quizObserver) {
        try { window.__quizObserver.disconnect(); } catch (e) {}
    }
    window.__quizObserverTarget = currentTarget;
    // true ngay từ đầu -> đảm bảo lần chờ đầu tiên sau khi cài luôn có
    // 1 lượt đọc đầy đủ ngay, không bỏ lỡ message đã có sẵn từ trước.
    window.__quizDirty = true;

    // Observer CHỈ đặt cờ, KHÔNG đọc/trích bất kỳ dữ liệu nào ở đây -
    // callback cực rẻ, và tránh hoàn toàn rủi ro đọc text chưa render
    // xong (React có thể cập nhật DOM nhiều lần liên tiếp cho 1 message).
    const observer = new MutationObserver(() => {
        window.__quizDirty = true;
    });

    observer.observe(currentTarget, {childList: true, subtree: true, characterData: true});
    window.__quizObserver = observer;
    window.__quizObserverInstalled = true;
}

return true;
"""

# execute_async_script: JS tự kiểm tra cờ __quizDirty mỗi ~15ms (rẻ,
# không qua lại Python) và CHỈ trả lời Python khi cờ được bật HOẶC hết
# timeout. Python "thức dậy" gần như ngay khi observer phát hiện thay
# đổi, rồi TỰ đọc lại đầy đủ bằng fetch_message_snapshots() (không dùng
# dữ liệu từ observer) để đảm bảo luôn chính xác.
JS_WAIT_FOR_SIGNAL = r"""
const timeoutMs = arguments[0];
const callback = arguments[arguments.length - 1];
const startTime = Date.now();

function check() {
    if (window.__quizDirty) {
        window.__quizDirty = false;
        callback(true);
        return;
    }
    if (Date.now() - startTime >= timeoutMs) {
        callback(false);
        return;
    }
    setTimeout(check, 15);
}
check();
"""


def install_message_observer(driver):
    """Cài (hoặc xác nhận đã cài) MutationObserver. Gọi lại an toàn nhiều
    lần - JS tự kiểm tra idempotent, chỉ cài lại nếu target đổi."""
    try:
        driver.execute_script(JS_INSTALL_OBSERVER, MESSAGE_SELECTOR)
        return True
    except Exception as e:
        print(f"⚠️ Không cài được observer (sẽ dùng polling thường): {e}")
        return False


def wait_for_dom_signal(driver, timeout_ms):
    """Chờ tới khi observer báo 'có gì đó vừa đổi' trong khung chat, hoặc
    hết timeout_ms. Trả về:
      True  -> có tín hiệu thay đổi, nên đọc lại đầy đủ ngay
      False -> hết timeout, không có gì mới (vẫn nên đọc lại định kỳ để
               dự phòng, xem vòng lặp chính)
      None  -> execute_async_script lỗi, cần fallback sang polling thường
    KHÔNG trả về dữ liệu message trực tiếp từ JS (tránh đọc phải nội dung
    message chưa render xong) - luôn phải gọi fetch_message_snapshots()
    riêng sau khi có tín hiệu."""
    try:
        triggered = driver.execute_async_script(JS_WAIT_FOR_SIGNAL, timeout_ms)
        return bool(triggered)
    except Exception:
        return None


def message_id(msg):
    try:
        return msg.get_attribute("id") or ""
    except Exception:
        return ""


def message_text(msg):
    try:
        return (msg.text or "").strip()
    except Exception:
        return ""

def message_author(msg):
    # MsgSnap (vòng lặp chính) đã có sẵn author từ JS batch scan -> dùng
    # luôn, khỏi gọi lại find_elements(). WebElement thật (crawl) không có
    # thuộc tính này -> getattr trả None -> rơi xuống cách cũ như trước.
    cached = getattr(msg, "author", None)
    if cached is not None:
        return cached
    try:
        selectors = [
            '[class*="username"]',
            '[class*="headerText"] [class*="username"]',
            'h3 span',
        ]
        for selector in selectors:
            nodes = msg.find_elements(By.CSS_SELECTOR, selector)
            for node in nodes:
                value = (node.text or "").strip()
                if value:
                    return value
    except Exception:
        pass
    return ""

def message_reply_text(msg):
    cached = getattr(msg, "reply_text", None)
    if cached is not None:
        return cached
    try:
        selectors = [
            '[class*="repliedMessage"]',
            '[class*="replyingTo"]',
            '[id*="message-reply"]',
            '[class*="messageReply"]',
        ]
        for selector in selectors:
            nodes = msg.find_elements(By.CSS_SELECTOR, selector)
            for node in nodes:
                value = (node.text or "").strip()
                if value:
                    return value
    except Exception:
        pass
    return ""

def snowflake_timestamp(message_id_value):
    if message_id_value is None:
        return 0.0
    matches = re.findall(r"(\d{15,20})", str(message_id_value))
    if not matches:
        return 0.0
    try:
        value = int(matches[-1])
        return ((value >> 22) + 1420070400000) / 1000.0
    except Exception:
        return 0.0

def message_timestamp(msg):
    cached = getattr(msg, "timestamp", None)
    if cached is not None:
        return cached
    try:
        nodes = msg.find_elements(By.CSS_SELECTOR, 'time[datetime], [datetime]')
        for node in nodes:
            value = (node.get_attribute("datetime") or "").strip()
            if not value:
                continue
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if dt.tzinfo is not None:
                    return dt.timestamp()
                return dt.timestamp()
            except Exception:
                pass
    except Exception:
        pass
    return 0.0


def get_message_time(msg):
    ts = message_timestamp(msg)
    if ts:
        return ts
    return snowflake_timestamp(message_id(msg))


def is_current_minute_message(msg, tolerance_seconds=0):
    ts = get_message_time(msg)
    if not ts:
        return False

    now = time.time()
    message_minute = time.localtime(ts)[:5]
    current_minute = time.localtime(now)[:5]
    if message_minute == current_minute:
        return True

    if tolerance_seconds > 0 and abs(now - ts) <= tolerance_seconds:
        return True
    return False


def clean_person_name(name):
    name = re.sub(r"^[\s@]+|[\s:]+$", "", name or "")
    name = re.sub(r"\s+", " ", name).strip()
    return name

def extract_correct_user(text):
    search_text = text or ""
    marker_pos = search_text.lower().find(CORRECT_MARKER.lower())
    if marker_pos >= 0:
        search_text = search_text[marker_pos:]
    pattern = re.compile(r"^\s*(.+?)\s+trả\s+lời\s+đúng", re.I | re.M)
    match = pattern.search(search_text)
    if not match:
        return ""
    name = match.group(1)
    name = re.sub(r"^[\s🎉🎊🟢🟩🟨🟧🟥]+", "", name).strip()
    return clean_person_name(name)

def same_person(a, b):
    a = normalize_text(clean_person_name(a))
    b = normalize_text(clean_person_name(b))
    if not a or not b:
        return False
    return a == b or a.endswith(b) or b.endswith(a)


def is_bot_message(msg):
    # Trước đây check "BOT_NAME in text" (nội dung), nghĩa là 1 tin nhắn của
    # USER vô tình nhắc tới tên bot (ví dụ đáp án quiz trùng tên) sẽ bị loại
    # nhầm khỏi danh sách candidate answer. Phải kiểm tra ĐÚNG theo tác giả.
    author = message_author(msg)
    if not author:
        return False
    normalized_author = " ".join(author.strip().split()).casefold()
    normalized_bot_name = " ".join(BOT_NAME.strip().split()).casefold()
    return normalized_author == normalized_bot_name


def extract_question_from_question_message(text):
    if QUESTION_MARKER.lower() not in text.lower():
        return ""
    pattern = re.compile(
        re.escape(QUESTION_MARKER) +
        r"\s*(.*?)(?=(?:Trả lời đúng đầu tiên|Gõ đáp án vào chat|\|\s*\d+\s*s)|$)",
        re.I | re.S,
    )
    match = pattern.search(text)
    question = match.group(1).strip() if match else re.sub(
        re.escape(QUESTION_MARKER), "", text, flags=re.I
    ).strip()
    return re.sub(r"\s+", " ", question).strip(" |\n\r")


def extract_answer_from_result(text):
    match = re.search(
        re.escape(ANSWER_MARKER) + r"\s*(.+?)(?=\n|$)", text, flags=re.I
    )
    if not match:
        return ""
    answer = match.group(1).strip()
    return re.split(r"\s+\+\s*\d+", answer, maxsplit=1)[0].strip()


def extract_question_from_result(text):
    patterns = [
        r"(?:câu hỏi|question)\s*[:：]\s*(.+?)(?=(?:đáp án|answer)\s*[:：]|$)",
        r"(?:câu hỏi)\s*\n\s*(.+?)(?=\n\s*(?:đáp án|answer)\s*[:：]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I | re.S)
        if match:
            question = re.sub(r"\s+", " ", match.group(1)).strip()
            if question:
                return question

    if QUESTION_MARKER.lower() in text.lower():
        q = extract_question_from_question_message(text)
        if q:
            return q

    answer_pos = text.lower().find(ANSWER_MARKER.lower())
    before_answer = text if answer_pos < 0 else text[:answer_pos]
    lines = [re.sub(r"\s+", " ", x).strip() for x in before_answer.splitlines()]
    for line in reversed(lines):
        if line.endswith(("?", "？")) and len(line) > 2:
            line = re.sub(r"^(?:🧠|🎉|⏰)\s*", "", line).strip()
            return line

    return ""


def find_existing_answer(question):
    return quiz_answers.get(normalize_question(question))


_cached_textbox = {"element": None}


# ============================================================
# TURBO SEND (SEND_MODE=js) — tùy chọn, MẶC ĐỊNH TẮT.
# Thay vì gõ phím thật qua Selenium (click + send_keys = 2 round-trip),
# "bơm" chữ trực tiếp vào ô chat bằng JS (execCommand insertText) rồi tự
# bắn sự kiện Enter - GỘP thành 1 round-trip execute_async_script duy
# nhất. Có XÁC MINH: sau khi bắn Enter, tự kiểm tra ô chat đã trống
# chưa (dấu hiệu Discord đã nhận và gửi tin) trong tối đa 300ms; nếu
# không xác nhận được, trả về false để Python tự động rơi về cách gõ
# phím thật (an toàn), KHÔNG bao giờ âm thầm mất câu trả lời.
# ============================================================

JS_SEND_ANSWER = r"""
const answer = arguments[0];
const selector = arguments[1];
const callback = arguments[arguments.length - 1];

const box = document.querySelector(selector);
if (!box) { callback(false); return; }

box.focus();

let inserted = false;
try {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    inserted = document.execCommand('insertText', false, answer);
} catch (e) {
    inserted = false;
}

if (!inserted) { callback(false); return; }

setTimeout(() => {
    try {
        const enterDown = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
        });
        box.dispatchEvent(enterDown);
        const enterUp = new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
        });
        box.dispatchEvent(enterUp);
    } catch (e) {
        callback(false);
        return;
    }

    // Xác minh: Discord thường xóa sạch ô chat sau khi gửi thành công.
    const start = Date.now();
    function verify() {
        const stillHasText = (box.innerText || "").trim().length > 0;
        if (!stillHasText) { callback(true); return; }
        if (Date.now() - start > 300) { callback(false); return; }
        setTimeout(verify, 20);
    }
    verify();
}, 10);
"""


def send_answer_via_js(driver, answer):
    """Trả True nếu ĐÃ XÁC MINH gửi thành công; False nếu không chắc
    chắn (kể cả lỗi execute_async_script) -> nơi gọi PHẢI fallback sang
    send_answer_via_selenium() khi nhận False, không được coi False là
    "đã gửi rồi thôi"."""
    try:
        ok = driver.execute_async_script(JS_SEND_ANSWER, answer, TEXTBOX_SELECTOR)
        return bool(ok)
    except Exception:
        return False


def send_answer_via_selenium(driver, answer):
    # Cache lại ô nhập chat sau lần tìm đầu tiên -> các lần gửi sau bỏ
    # qua round-trip find_element(), chỉ còn click() + send_keys() (2
    # round-trip thay vì 3). Nếu element bị stale (Discord re-render ô
    # nhập, hiếm khi xảy ra), tự tìm lại 1 lần rồi thử lại.
    box = _cached_textbox["element"]

    if box is not None:
        try:
            box.click()
            box.send_keys(answer, Keys.ENTER)
            return True
        except Exception:
            _cached_textbox["element"] = None

    try:
        box = driver.find_element(By.CSS_SELECTOR, TEXTBOX_SELECTOR)
        _cached_textbox["element"] = box
        box.click()
        box.send_keys(answer, Keys.ENTER)
        return True
    except Exception as e:
        print(f"⚠️ Không gửi được câu trả lời: {e}")
        return False


def send_answer(driver, answer):
    if SEND_MODE == "js":
        if send_answer_via_js(driver, answer):
            return True
        print("⚠️ Gửi nhanh (JS) không xác nhận được -> chuyển sang gõ phím thật.")
    return send_answer_via_selenium(driver, answer)


def create_question_state(msg):
    key = message_id(msg)
    text = message_text(msg)
    question = extract_question_from_question_message(text)
    if not key or not question:
        return None

    state = active_questions.get(key)
    if state is not None:
        state["last_text"] = text
        return state

    state = {
        "id": key,
        "question": question,
        "normalized": normalize_question(question),
        "created_at": time.time(),
        "known_answer": find_existing_answer(question),
        "answered": False,
        "unknown_fallback_sent": False,
        "candidate_answers": [],
        "candidate_messages": [],
        "last_text": text,
    }
    active_questions[key] = state
    return state


def process_question(driver, msg):
    author = message_author(msg)
    if not author:
        return

    normalized_author = " ".join(author.strip().split()).casefold()
    normalized_bot_name = " ".join(BOT_NAME.strip().split()).casefold()

    if normalized_author != normalized_bot_name:
        return

    # tolerance_seconds=5: phòng trường hợp message rơi đúng ranh giới
    # phút (VD tạo lúc xx:xx:59, xử lý lúc xx:(xx+1):00) - không có dung
    # sai sẽ bị coi là "không phải bây giờ" và bỏ sót VĨNH VIỄN (message
    # không mutate lại nên không có cơ hội thử lại). 5s vẫn đủ chặt để
    # lọc message lịch sử cũ (vốn thường cách xa hàng phút/giờ).
    if not is_current_minute_message(msg, tolerance_seconds=5):
        return

    state = create_question_state(msg)
    if not state or state["answered"]:
        return

    if state["known_answer"]:
        if send_answer(driver, state["known_answer"]):
            state["answered"] = True
            print(f"⚡ Quiz -> {state['known_answer']}")
        return

    if not state["unknown_fallback_sent"]:
        if send_answer(driver, UNKNOWN_ANSWER):
            state["unknown_fallback_sent"] = True
            print(f"❓ Quiz chưa biết đáp án -> đã gửi ngay '{UNKNOWN_ANSWER}': {state['question']}")


def update_candidate_answers(messages):
    now = time.time()

    for msg in messages:
        try:
            key = message_id(msg)
            text = message_text(msg)
            if not key or not text or is_bot_message(msg):
                continue
            if QUESTION_MARKER.lower() in text.lower():
                continue
            if len(text) > 200:
                continue

            author = message_author(msg)
            reply_text = message_reply_text(msg)
            ts = message_timestamp(msg) or now
            recent_user_answers[key] = {
                "id": key,
                "text": text,
                "author": author,
                "reply_text": reply_text,
                "timestamp": ts,
            }

        except StaleElementReferenceException:
            continue
        except Exception:
            continue

    if len(recent_user_answers) > MAX_MESSAGES * 20:
        items = sorted(recent_user_answers.values(), key=lambda x: x["timestamp"])[-MAX_MESSAGES * 10:]
        recent_user_answers.clear()
        for item in items:
            recent_user_answers[item["id"]] = item

    for state in active_questions.values():
        if state["answered"]:
            continue
        if now - state["created_at"] > ACTIVE_QUESTION_TTL:
            continue
        candidates = []
        for item in recent_user_answers.values():
            if item["timestamp"] < state["created_at"]:
                continue
            if item["timestamp"] > now + 1:
                continue
            candidates.append(item)
        state["candidate_messages"] = candidates[-50:]
        state["candidate_answers"] = [x["text"] for x in candidates[-50:]]


def find_state_for_correct_result(result_msg, result_text, answer):
    result_id = message_id(result_msg)
    result_ts = snowflake_timestamp(result_id) or time.time()
    answer_norm = normalize_text(answer)

    possible = []
    for state in active_questions.values():
        if state["answered"]:
            continue
        if result_ts and result_ts < state["created_at"] - 2:
            continue

        for candidate in state.get("candidate_messages", []):
            candidate_ts = candidate["timestamp"]
            if candidate_ts < state["created_at"] - 2 or candidate_ts > result_ts + 2:
                continue
            cand_norm = normalize_text(candidate["text"])
            if answer_norm and not (answer_norm in cand_norm or cand_norm in answer_norm):
                continue
            possible.append((state, candidate_ts))

    if len(possible) == 1:
        return possible[0][0]
    if possible:
        possible.sort(key=lambda x: abs(result_ts - x[1]))
        return possible[0][0]
    return None


def result_matches_state(state, result_text, answer):
    result_question = extract_question_from_result(result_text)
    if result_question:
        return normalize_question(result_question) == state["normalized"]

    if state["normalized"] in normalize_text(result_text):
        return True

    answer_norm = normalize_text(answer)
    if answer_norm and any(normalize_text(x) == answer_norm for x in state["candidate_answers"]):
        return True

    return False


def finalize_result(driver, msg, is_timeout=False):
    text = message_text(msg)
    lower = text.lower()
    is_correct = CORRECT_MARKER.lower() in lower
    is_timeout = is_timeout or TIMEOUT_MARKER.lower() in lower

    if not (is_correct or is_timeout) or ANSWER_MARKER.lower() not in lower:
        return

    answer = extract_answer_from_result(text)
    if not answer:
        return

    matched = None

    if is_timeout:
        result_id = message_id(msg)
        state = active_questions.get(result_id)
        if state is not None and not state["answered"]:
            matched = state

    elif is_correct:
        # CHÍNH XÁC có thể là edit TẠI CHỖ của chính message câu hỏi (cùng ID),
        # giống hệt trường hợp HẾT GIỜ. Nếu vậy, snowflake_timestamp(result_id)
        # sẽ là thời điểm TẠO câu hỏi (không phải lúc trả lời đúng), khiến cửa
        # sổ thời gian trong find_state_for_correct_result() chỉ chấp nhận câu
        # trả lời đến trong ~2s đầu -> BỎ SÓT câu trả lời đúng đến sau đó (bug
        # đã xác nhận: gửi "khầy chùa" xong, ai đó trả lời đúng trong 60s, bot
        # không nhận ra). Nên PHẢI thử match trực tiếp theo ID trước; chỉ khi
        # đó KHÔNG phải cùng ID (CHÍNH XÁC là message mới tách riêng) mới
        # fallback sang heuristic thời gian/nội dung như cũ.
        result_id = message_id(msg)
        direct_state = active_questions.get(result_id)

        if direct_state is not None and not direct_state["answered"]:
            matched = direct_state
        else:
            matched = find_state_for_correct_result(msg, text, answer)

    if matched is None:
        return

    was_known = bool(matched["known_answer"])
    matched["known_answer"] = answer
    matched["answered"] = True
    save_quiz_answer(matched["question"], answer)

    if not was_known and is_timeout and not matched["unknown_fallback_sent"]:
        if send_answer(driver, UNKNOWN_ANSWER):
            matched["unknown_fallback_sent"] = True

def scan_messages(driver, messages):
    if not messages:
        return

    current_ids = set()

    for msg in messages[-MAX_MESSAGES:]:
        try:
            key = message_id(msg)
            if not key:
                continue
            current_ids.add(key)

            text = message_text(msg)
            if not text:
                continue

            lower = text.lower()
            bot_msg = is_bot_message(msg)

            if bot_msg and QUESTION_MARKER.lower() in lower:
                process_question(driver, msg)

            elif bot_msg and CORRECT_MARKER.lower() in lower and ANSWER_MARKER.lower() in lower:
                if key not in processed_message_ids:
                    finalize_result(driver, msg, is_timeout=False)
                    processed_message_ids.add(key)

            elif bot_msg and TIMEOUT_MARKER.lower() in lower and ANSWER_MARKER.lower() in lower:
                previous_text = message_snapshots.get(key, "")
                if key not in processed_message_ids or previous_text != text:
                    finalize_result(driver, msg, is_timeout=True)
                    processed_message_ids.add(key)

            message_snapshots[key] = text

        except StaleElementReferenceException:
            continue
        except Exception as e:
            print(f"⚠️ Lỗi xử lý quiz message: {e}")

    if len(message_snapshots) > MAX_MESSAGES * 30:
        keep = current_ids
        message_snapshots_keys = list(message_snapshots.keys())
        for old_key in message_snapshots_keys:
            if old_key not in keep:
                message_snapshots.pop(old_key, None)

    if len(processed_message_ids) > MAX_MESSAGES * 30:
        processed_message_ids.intersection_update(current_ids)


def cleanup_active_questions():
    now = time.time()
    expired = [
        key for key, state in active_questions.items()
        if now - state["created_at"] > ACTIVE_QUESTION_TTL
    ]
    for key in expired:
        active_questions.pop(key, None)


def get_chat_scroller(driver):
    script = """
    const messageSelector = arguments[0];
    const first = document.querySelector(messageSelector);
    if (!first) return null;

    let el = first;
    while (el) {
        const style = window.getComputedStyle(el);
        const scrollable = el.scrollHeight > el.clientHeight + 10 &&
                           (style.overflowY === 'auto' || style.overflowY === 'scroll');
        if (scrollable) return el;
        el = el.parentElement;
    }

    const candidates = Array.from(document.querySelectorAll('div, main, ol, ul'));
    for (const node of candidates) {
        if (node.scrollHeight > node.clientHeight + 100) {
            const style = window.getComputedStyle(node);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                if (node.querySelector(messageSelector)) return node;
            }
        }
    }
    return null;
    """
    try:
        return driver.execute_script(script, MESSAGE_SELECTOR)
    except Exception:
        return None


def scroll_chat_to_bottom(driver):
    scroller = get_chat_scroller(driver)
    if scroller is None:
        return False
    try:
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight;", scroller)
        time.sleep(CRAWL_SCROLL_WAIT)
        return True
    except Exception:
        return False


def scroll_chat_up(driver):
    scroller = get_chat_scroller(driver)
    if scroller is None:
        return False, None
    try:
        result = driver.execute_script("""
            const el = arguments[0];
            const before = el.scrollTop;
            const amount = Math.max(500, Math.floor(el.clientHeight * 0.85));
            el.scrollTop = Math.max(0, el.scrollTop - amount);
            return {before: before, after: el.scrollTop, atTop: el.scrollTop <= 2};
        """, scroller)
        time.sleep(CRAWL_SCROLL_WAIT)
        return True, result
    except Exception:
        return False, None


def get_message_identity_and_texts(driver):
    result = []
    for msg in get_all_messages(driver):
        try:
            key = message_id(msg)
            text = message_text(msg)
            if key and text:
                result.append((key, text))
        except StaleElementReferenceException:
            continue
        except Exception:
            continue
    return result


def collect_crawl_message(msg):
    key = message_id(msg)
    if not key:
        return None
    return {
        "id": key,
        "text": message_text(msg),
        "author": message_author(msg),
        "reply_text": message_reply_text(msg),
        "timestamp": snowflake_timestamp(key),
    }

def resolve_crawl_correct(messages_by_id):
    records = sorted(messages_by_id.values(), key=lambda x: x["timestamp"] or 0)

    # Forward-fill author rỗng (Discord group messages)
    last_author = ""
    for rec in records:
        if rec.get("author"):
            last_author = rec["author"]
        elif last_author:
            rec["author"] = last_author

    added = skipped = conflicts = unresolved = 0

    for idx, result in enumerate(records):
        text = result["text"] or ""
        lower = text.lower()

        # Chỉ xử lý tin nhắn chứa CHÍNH XÁC và Đáp án – không cần kiểm tra author
        if CORRECT_MARKER.lower() not in lower or ANSWER_MARKER.lower() not in lower:
            continue

        if CRAWL_DEBUG:
            print(f"🔧 [debug] --- xét CHÍNH XÁC id={result['id'][-25:]} text='{re.sub(chr(10), chr(32), text)[:70]}...'")

        answer = extract_answer_from_result(text)
        if not answer:
            if CRAWL_DEBUG:
                print(f"🔧 [debug]     SKIP: không extract được answer từ text")
            continue

        result_ts = result["timestamp"] or 0
        winner = extract_correct_user(text)
        winner_norm = normalize_text(winner) if winner else ""

        if CRAWL_DEBUG:
            print(f"🔧 [debug]     answer='{answer}' | winner='{winner}' | result_ts={result_ts}")

        # Tìm tin nhắn trả lời của người chơi trước đó
        answer_norm = normalize_text(answer)
        user_candidates = []
        for prev in records[:idx]:
            # Bỏ qua tin nhắn của bot
            if prev.get("author", "") and normalize_text(prev["author"]) == normalize_text(BOT_NAME):
                continue

            prev_text = normalize_text(prev.get("text", ""))
            if not prev_text:
                continue
            if not (answer_norm in prev_text or prev_text in answer_norm):
                continue

            prev_ts = prev.get("timestamp") or 0
            if result_ts and prev_ts and prev_ts > result_ts:
                continue

            if winner_norm and prev.get("author"):
                if not same_person(prev["author"], winner):
                    continue

            user_candidates.append(prev)

        if not user_candidates:
            if CRAWL_DEBUG:
                print(f"🔧 [debug]     UNRESOLVED: không tìm được user_candidate nào khớp answer='{answer_norm}' trước result_ts={result_ts}")
            unresolved += 1
            continue

        user_answer = user_candidates[-1]
        user_ts = user_answer.get("timestamp") or result_ts

        # Tìm câu hỏi của bot ngay trước đó
        question = ""
        for prev in reversed(records[:idx]):
            prev_ts = prev.get("timestamp") or 0
            if user_ts and prev_ts and prev_ts > user_ts:
                continue

            if normalize_text(prev.get("author", "")) != normalize_text(BOT_NAME):
                continue

            prev_text = prev.get("text", "")
            if QUESTION_MARKER.lower() not in prev_text.lower():
                continue

            question = extract_question_from_question_message(prev_text)
            if question:
                break

        if not question:
            if CRAWL_DEBUG:
                print(f"🔧 [debug]     UNRESOLVED: tìm được user_answer id={user_answer['id'][-25:]} nhưng không tìm được CÂU HỎI của bot trước user_ts={user_ts}")
            unresolved += 1
            continue

        qkey = normalize_question(question)
        existing = quiz_answers.get(qkey)

        if existing is None:
            if save_quiz_answer(question, answer):
                added += 1
                if CRAWL_DEBUG:
                    print(f"🔧 [debug]     ADDED: '{question}' -> '{answer}'")
        elif normalize_text(existing) == normalize_text(answer):
            skipped += 1
            if CRAWL_DEBUG:
                print(f"🔧 [debug]     SKIPPED (đã có, trùng): '{question}'")
        else:
            conflicts += 1
            if CRAWL_DEBUG:
                print(f"🔧 [debug]     CONFLICT: '{question}' -> đã có '{existing}', crawl ra '{answer}'")

    return added, skipped, conflicts, unresolved

def crawl_history(driver):
    global crawl_running

    crawl_running = True
    crawl_stop_event.clear()
    messages_by_id = {}
    rounds_without_new = 0

    print("🕷️ Bắt đầu crawl lịch sử quiz...")
    print("   Chỉ đọc + scroll, tuyệt đối không gửi tin nhắn. Nhập 'stop' để dừng.")

    try:
        if not scroll_chat_to_bottom(driver):
            print("⚠️ Không tìm thấy vùng chat để crawl.")
            return

        while not crawl_stop_event.is_set():
            batch = get_all_messages(driver)
            new_in_batch = 0

            for msg in batch:
                if crawl_stop_event.is_set():
                    break
                try:
                    record = collect_crawl_message(msg)
                    if not record or not record["text"]:
                        continue
                    if record["id"] not in messages_by_id:
                        messages_by_id[record["id"]] = record
                        new_in_batch += 1
                except StaleElementReferenceException:
                    continue

            if new_in_batch == 0:
                rounds_without_new += 1
            else:
                rounds_without_new = 0

            ok, info = scroll_chat_up(driver)
            if not ok:
                print("⚠️ Không thể scroll chat lên tiếp.")
                break

            if CRAWL_DEBUG:
                print(f"🔧 [debug] batch mới: {new_in_batch} tin | tổng đã thu: {len(messages_by_id)} | scrollTop: {info}")

            if info and info.get("atTop"):
                break

            if rounds_without_new >= CRAWL_STABLE_ROUNDS:
                ok2, info2 = scroll_chat_up(driver)
                if not ok2 or (info2 and info2.get("atTop")):
                    break
                rounds_without_new = 0

        if crawl_stop_event.is_set():
            print("🛑 Crawl đã dừng theo lệnh stop.")
        else:
            print("✅ Crawl đã chạm tin nhắn đầu tiên.")

        if CRAWL_DEBUG:
            all_records = sorted(messages_by_id.values(), key=lambda x: x["timestamp"] or 0)
            print(f"🔧 [debug] tổng số message thu được: {len(all_records)}")
            if all_records:
                t_first = datetime.fromtimestamp(all_records[0]["timestamp"]) if all_records[0]["timestamp"] else "N/A"
                t_last = datetime.fromtimestamp(all_records[-1]["timestamp"]) if all_records[-1]["timestamp"] else "N/A"
                print(f"🔧 [debug] khoảng thời gian: {t_first}  ->  {t_last}")
                n_correct = sum(1 for r in all_records if CORRECT_MARKER.lower() in (r["text"] or "").lower())
                n_question = sum(1 for r in all_records if QUESTION_MARKER.lower() in (r["text"] or "").lower())
                n_empty_author = sum(1 for r in all_records if not r.get("author"))
                print(f"🔧 [debug] số tin có CHÍNH XÁC: {n_correct} | có CÂU HỎI: {n_question} | author rỗng (trước forward-fill): {n_empty_author}")
                print("🔧 [debug] mẫu 5 message đầu tiên thu được:")
                for r in all_records[:5]:
                    ts_str = datetime.fromtimestamp(r["timestamp"]).strftime("%H:%M:%S") if r["timestamp"] else "N/A"
                    snippet = re.sub(r"\s+", " ", r["text"])[:60]
                    print(f"    [{ts_str}] author='{r.get('author','')}' id={r['id'][-25:]} text='{snippet}...'")

        added, skipped, conflicts, unresolved = resolve_crawl_correct(messages_by_id)
        print(f"📊 Crawl: thêm {added}, đã có {skipped}, conflict {conflicts}, chưa truy được Q {unresolved}.")

        if added > 0:
            load_quiz_file()
            print(f"🔄 Đã reload quiz.txt sau crawl ({len(quiz_answers)} câu hiện có).")

    except WebDriverException as e:
        print(f"⚠️ Crawl gặp lỗi Edge/Discord: {e}")
    except Exception as e:
        print(f"⚠️ Crawl gặp lỗi: {e}")
    finally:
        crawl_running = False
        crawl_stop_event.clear()
        print("🔄 Crawl kết thúc. Tự động quay lại auto quiz...")


def command_reader():
    while not should_stop:
        try:
            command = input("🔹 Nhập lệnh > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            command_queue.put("exit")
            return

        if command:
            command_queue.put(command)


def handle_commands(driver):
    global should_stop

    while True:
        try:
            command = command_queue.get_nowait()
        except queue.Empty:
            break

        if command == "crawl":
            if crawl_running:
                print("⚠️ Crawl đang chạy.")
                continue
            threading.Thread(target=crawl_history, args=(driver,), daemon=True).start()

        elif command == "stop":
            if crawl_running:
                crawl_stop_event.set()
            else:
                should_stop = True

        elif command in ("exit", "quit"):
            should_stop = True
            crawl_stop_event.set()

        elif command == "reload":
            load_config()
            load_quiz_file()
            print(f"🔄 Đã reload config + quiz.txt ({len(quiz_answers)} câu).")

        elif command == "help":
            print("Lệnh: crawl | stop | reload | help | exit")

        else:
            print("❌ Lệnh không hợp lệ. Dùng: crawl | stop | reload | help | exit")


def main():
    global should_stop

    load_config()
    load_quiz_file()

    print("=" * 65)
    print("🧠 QUIZ BOT - BA QUE XỎ LÁ")
    print(f"🤖 Bot: {BOT_NAME}")
    print(f"👤 Player: {PLAYER_NAME}")
    print(f"📚 Quiz DB: {QUIZ_FILE}")
    print(f"🔎 Scan: {SCAN_INTERVAL}s")
    print("=" * 65)

    driver = init_driver()
    if driver is None:
        return

    if not open_discord(driver):
        close_driver(driver)
        return

    print("✅ Edge Quiz đã mở và sẵn sàng.")
    print(f"📚 Đã load {len(quiz_answers)} câu trả lời.")
    print("\nChọn hành động:")
    print("  1. Auto Quiz")
    print("  2. Crawl data")
    print("  3. Thoát")
    print("⚠️ Chương trình CHƯA bắt đầu. Hãy chọn và nhấn ENTER.")

    try:
        first_action = input("🔹 Chọn [1/2/3] > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        first_action = "3"

    if first_action in ("3", "exit", "quit"):
        close_driver(driver)
        print("👋 Quiz bot đã dừng.")
        return

    if first_action in ("2", "crawl"):
        startup_action = "crawl"
    elif first_action in ("1", "quiz", "auto", ""):
        startup_action = "quiz"
    else:
        print("❌ Lựa chọn không hợp lệ. Chương trình chưa thực hiện hành động nào.")
        close_driver(driver)
        return

    print("▶️ Đã xác nhận bằng ENTER. Bắt đầu...")
    threading.Thread(target=command_reader, daemon=True).start()

    # Cài observer ngay từ đầu. Nếu lỗi (trình duyệt không hỗ trợ, hoặc
    # trang chưa sẵn sàng), observer_ok=False -> vòng lặp tự dùng lại
    # polling cũ (fetch_message_snapshots mỗi SCAN_INTERVAL) làm phương án
    # dự phòng an toàn, không mất chức năng.
    observer_ok = install_message_observer(driver)
    if observer_ok:
        print("⚡ Đã bật chế độ phản hồi tức thời (MutationObserver).")
    else:
        print("⚠️ Không bật được chế độ tức thời -> dùng polling thường.")

    # Chờ tối đa bao lâu mỗi lần trước khi tự "thức dậy" kiểm tra lệnh
    # (stop/reload/crawl...) ngay cả khi không có message mới. Không nên
    # quá lớn (giữ command_reader phản hồi nhanh) nhưng lớn hơn nhiều so
    # với SCAN_INTERVAL cũ vì giờ KHÔNG cần polling để bắt message mới nữa
    # - observer báo ngay khi có, timeout này chỉ là lưới an toàn.
    idle_wait_ms = max(200, int(SCAN_INTERVAL * 1000))

    # SAFETY NET: dù observer hoạt động tốt, vẫn chủ động đọc lại đầy đủ
    # định kỳ mỗi vài giây. Phòng trường hợp observer "chết âm thầm"
    # (không báo lỗi nhưng không còn nhận mutation, ví dụ Discord thay
    # thế toàn bộ container theo cách JS không phát hiện được) - đảm bảo
    # KHÔNG BAO GIỜ có tình huống bot im lặng vô thời hạn.
    RECONCILE_INTERVAL = 3.0
    last_reconcile = time.time()

    try:
        if startup_action == "crawl":
            threading.Thread(target=crawl_history, args=(driver,), daemon=True).start()

        while not should_stop:
            try:
                handle_commands(driver)

                if crawl_running:
                    # Trong lúc crawl, DOM bị thao túng mạnh (scroll liên
                    # tục) -> observer không đáng tin, tạm dừng chờ event,
                    # dùng sleep thường; sẽ cài lại observer khi crawl xong.
                    observer_ok = False
                    time.sleep(SCAN_INTERVAL)
                    continue

                if not observer_ok:
                    observer_ok = install_message_observer(driver)

                messages = None
                now = time.time()
                force_reconcile = (now - last_reconcile) >= RECONCILE_INTERVAL

                if observer_ok:
                    # 1 ROUND-TRIP DUY NHẤT: chờ tín hiệu thay đổi VÀ đọc
                    # lại đầy đủ luôn trong cùng 1 execute_async_script,
                    # thay vì 2 lệnh riêng (chờ xong rồi mới gọi thêm 1
                    # lệnh đi đọc). settleMs nhỏ đảm bảo không đọc phải
                    # nội dung message chưa render xong.
                    outcome = wait_and_scan(driver, idle_wait_ms, RENDER_SETTLE_MS, MAX_MESSAGES)

                    if outcome is None:
                        # execute_async_script lỗi (VD trang vừa điều
                        # hướng) -> đọc lại 1 lần cho vòng này bằng đường
                        # dự phòng, đồng thời đánh dấu cần cài lại observer.
                        observer_ok = False
                        messages = fetch_message_snapshots(driver, MAX_MESSAGES)
                        last_reconcile = now
                    else:
                        changed, changed_messages = outcome
                        if changed:
                            messages = changed_messages
                            last_reconcile = now
                        elif force_reconcile:
                            messages = fetch_message_snapshots(driver, MAX_MESSAGES)
                            last_reconcile = now
                else:
                    messages = fetch_message_snapshots(driver, MAX_MESSAGES)
                    last_reconcile = now
                    time.sleep(SCAN_INTERVAL)

                if messages:
                    # scan_messages (gửi đáp án ngay khi có câu hỏi mới)
                    # PHẢI chạy TRƯỚC update_candidate_answers (chỉ phục
                    # vụ việc dò "CHÍNH XÁC" về sau, không khẩn cấp) để
                    # không làm trễ thời điểm bấm Enter trả lời.
                    scan_messages(driver, messages)
                    update_candidate_answers(messages)

                cleanup_active_questions()

            except WebDriverException as e:
                print(f"⚠️ Edge/Discord tạm thời lỗi: {e}")
                observer_ok = False
                time.sleep(2)
            except Exception as e:
                print(f"⚠️ Quiz loop: {e}")
                time.sleep(1)
    except KeyboardInterrupt:
        should_stop = True
        crawl_stop_event.set()
    finally:
        crawl_stop_event.set()
        close_driver(driver)
        print("👋 Quiz bot đã dừng.")


if __name__ == "__main__":
    main()