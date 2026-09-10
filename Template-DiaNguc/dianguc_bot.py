"""
dianguc_bot.py
=================================================================
Bot leo "Địa Ngục" (!dianguc) — ĐỘC LẬP, dựa trên nền tảng
luanhoi_bot.py (tracking 1 message duy nhất bằng message_id cố định,
scroll-to-center, spam skill dùng chung cơ chế click_button_safe).

KHÁC BIỆT SO VỚI luanhoi_bot.py:
1. Có 2 nhánh sau khi chọn hướng:
   - ĐÚNG đường -> được chọn buff -> đánh quái CÓ buff -> lặp lại chọn
     hướng cho bước kế.
   - SAI đường -> phải đánh 1 quái phạt KHÔNG được chọn buff mới -> nếu
     thắng, quay lại đúng bước đó để chọn hướng KHÁC (hướng sai đã loại)
     -> nếu thua thì CHẾT (reset về bước 1 của CÙNG tầng, mất buff,
     nhưng dữ liệu Excel của tầng đó vẫn giữ nguyên vì tầng KHÔNG đổi).
2. Cơ chế chọn buff ưu tiên THEO LOẠI (list_uutien.txt, so khớp cả cụm
   bằng mẫu có "__" đại diện cho số) TRƯỚC, chỉ khi không loại nào khớp
   mới rơi về chọn theo BẬC (Thiên>Huyền>Linh>Phàm) như luanhoi_bot.py.
   Buff chứa chữ "hồi" hoặc khớp anti_pick.txt LUÔN bị loại vô điều kiện.
3. Dữ liệu "hướng nào đúng/sai cho từng bước" được lưu vào file Excel
   (dianguc_data.xlsx) - lưu lại sau mỗi lần chạy (kể cả chết) VÀ xoá
   sạch ngay khi phát hiện đã sang TẦNG MỚI (vì tầng khác thì hướng đúng
   khác hoàn toàn, dữ liệu tầng cũ vô nghĩa với tầng mới). Số bước mỗi
   tầng KHÔNG cố định nên không cần biết trước, chỉ cần theo dõi số Tầng
   đổi hay chưa.
4. Không có khái niệm "tầng mục tiêu" - chỉ cần nhập SỐ LẦN THỬ TỐI ĐA,
   cứ chết là tính 1 lần thử, chạy tới khi hết số lần hoặc gặp
   STAMINA_MARKER (thoát chương trình).
5. Sự kiện bí ẩn ("Sự Kiện Bí Ẩn") xuất hiện ngẫu nhiên sau khi thắng 1
   bước, THAY cho màn chọn hướng -> luôn tự động bấm nút ĐẦU TIÊN, đợi
   1.5s rồi mới quét lại bình thường.

VÁ QUAN TRỌNG (mô tả buff):
Trên Discord, button chỉ hiển thị BẬC ("🟢 Phàm", "🔵 Linh"...), còn MÔ
TẢ buff ("+60% ATK", "Hấp Thu Linh Hồn"...) nằm trong phần BODY của
message. Selenium trả về `elem.text` đã bị NUỐT MẤT emoji phân tách giữa
các option, khiến việc đoán mò "tier label ở đâu" không đáng tin. Thay
vào đó, code dùng chính DÃY BẬC TRÊN BUTTON làm KHUÔN MẪU: biết trước
cần tìm chuỗi [Linh, Linh, Huyền, Huyền] trong text, quét tuần tự từ
trái sang phải để trích mô tả cho từng button. Cách này đúng cho mọi
trường hợp vì Discord luôn render text cùng thứ tự với button.

6. GHI LOG CHI TIẾT (log.txt): console chỉ in các dòng NGẮN GỌN cho mốc
   quan trọng (chọn buff, thử hướng, chết, lỗi...). Toàn bộ chi tiết đầy
   đủ hơn (thời gian từng mốc, số của LẦN THỬ, nguyên văn text message
   của buff, buff đã chọn, hướng đã thử kể cả ĐÚNG lẫn SAI) được gom lại
   trong lúc chạy và ghi APPEND vào file log.txt ngay khi lần thử đó kết
   thúc (dù thành công, chết, lỗi/mất dấu, bị dừng hay reset giữa
   chừng) - mục đích để có thể mở log.txt kiểm tra thủ công sau này nếu
   nghi ngờ có lỗi hoặc mất dấu message giữa chừng.
7. Khi người dùng gõ lệnh "pause" hoặc "stop" trong menu, dữ liệu
   hướng đúng/sai hiện có (nếu có) sẽ được lưu NGAY vào dianguc_data.xlsx
   thay vì chờ tới điểm lưu tiếp theo trong vòng lặp.

Yêu cầu cài thêm (ngoài selenium sẵn có từ trước): pip install openpyxl
"""

import os
import re
import time
import threading
from datetime import datetime

from selenium.webdriver.common.by import By

import openpyxl

import bot_common as bc

CONFIG_FILE = os.path.join(bc.BASE_DIR, "dianguc_config.txt")
DIANGUC_SKILL_FILE = os.path.join(bc.BASE_DIR, "skill.txt")
DEFAULT_DIANGUC_SKILLS = ["Phá Giáp", "Kịch Độc"]

PRIORITY_FILE = os.path.join(bc.BASE_DIR, "list_uutien.txt")
ANTI_PICK_FILE = os.path.join(bc.BASE_DIR, "anti_pick.txt")
EXCEL_FILE = os.path.join(bc.BASE_DIR, "dianguc_data.xlsx")
LOG_FILE = os.path.join(bc.BASE_DIR, "log.txt")

DEFAULT_PRIORITY_LINES = [
    "# Mỗi dòng là 1 MẪU buff theo thứ tự ưu tiên (dòng trên = ưu tiên",
    "# cao hơn). Dùng __ làm placeholder cho SỐ - phải khớp CHÍNH XÁC cả",
    "# cụm (không phải chỉ chứa chữ). VD '+__% HP' khớp '+70% HP' nhưng",
    "# KHÔNG khớp 'Khiên 10% HP' hay '-30% HP Quái'. Sửa/thêm dòng theo",
    "# đúng wording thật của game.",
        "+__% ALL STATS",
        "+__% ATK",
        "+__% DEF",
        "+__% HP",
    "Miễn Tử",
    "-__% HP Quái",
    "Huyết Sát Quyết",
    "Diêm Vương Chi Hỏa",
    "+__% Hút Máu",
]

DEFAULT_ANTI_PICK_LINES = [
    "# Mỗi dòng là 1 MẪU buff LUÔN bị loại (so khớp CHÍNH XÁC cả cụm,",
    "# dùng __ cho số nếu cần). Buff chứa chữ 'hồi' đã bị loại mặc định",
    "# ở code, KHÔNG cần liệt kê lại ở đây trừ khi muốn liệt kê rõ.",
    "Hồi Full HP",
    "Hồi __% HP",
]


# ============================================================
# CONFIG
# ============================================================

DEFAULT_CONFIG = {
    "DIANGUC_COMMAND": "!dianguc",
    "CLICK_DELAY": "1.5",
    "INITIAL_WAIT_AFTER_COMMAND": "2",
    "INTER_RUN_WAIT": "3",
    "DIANGUC_MESSAGE_WAIT": "15",
    "TRACK_RETRY_COUNT": "3",
    "TRACK_RETRY_DELAY": "1.0",
    "MAX_LOST_TRACK_ROUNDS": "5",

    "DIRECTION_MARKER": "Hãy chọn hướng đi tiếp theo",
    "CORRECT_DIRECTION_MARKER": "Đúng đường!",
    "BUFF_SELECT_MARKER": "Chọn 1 buff",
    "WRONG_DIRECTION_MARKER": "SAI ĐƯỜNG",
    "DEATH_MARKER": "ĐÃ CHẾT!",
    "STAMINA_MARKER": "hết stamina",
    "MYSTERY_EVENT_MARKER": "Sự Kiện Bí Ẩn",

    "FLOOR_REGEX_PATTERN": r"Tầng\s*(\d+)",
    "STEP_REGEX_PATTERN": r"Bước\s*(\d+)",

    "BUFF_PRIORITY": "Thiên,Huyền,Linh,Phàm",
}

CONFIG = {}
DIANGUC_COMMAND = "!dianguc"
CLICK_DELAY = 1.5
INITIAL_WAIT_AFTER_COMMAND = 2.0
INTER_RUN_WAIT = 3.0
DIANGUC_MESSAGE_WAIT = 15
TRACK_RETRY_COUNT = 3
TRACK_RETRY_DELAY = 1.0
MAX_LOST_TRACK_ROUNDS = 5

DIRECTION_MARKER = "Hãy chọn hướng đi tiếp theo"
CORRECT_DIRECTION_MARKER = "Đúng đường!"
BUFF_SELECT_MARKER = "Chọn 1 buff"
WRONG_DIRECTION_MARKER = "SAI ĐƯỜNG"
DEATH_MARKER = "ĐÃ CHẾT!"
STAMINA_MARKER = "hết stamina"
MYSTERY_EVENT_MARKER = "Sự Kiện Bí Ẩn"

FLOOR_REGEX = re.compile(r"Tầng\s*(\d+)", re.IGNORECASE)
STEP_REGEX = re.compile(r"Bước\s*(\d+)", re.IGNORECASE)
BUFF_PRIORITY = ["Thiên", "Huyền", "Linh", "Phàm"]

DIANGUC_SKILLS = []
BUFF_PRIORITY_PATTERNS = []   # đã compile, giữ ĐÚNG thứ tự ưu tiên
ANTI_PICK_PATTERNS = []


def _strip_value(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return value.strip()


def create_default_config_file():
    lines = [
        "# ============================================================",
        "# DIANGUC_BOT CONFIG - tách riêng khỏi luanhoi_config.txt/config.txt",
        "# ============================================================",
        "",
    ]
    for k, v in DEFAULT_CONFIG.items():
        lines.append(f"{k}={v}")
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def compile_pattern(raw_pattern):
    """Chuyển 1 mẫu (VD '+__% HP') thành regex FULLMATCH, với __ là
    placeholder cho số (cho phép số thập phân với . hoặc ,).

    Chuẩn hoá khoảng trắng quanh % GIỐNG HỆT parse_buff_button() áp
    dụng cho desc thật - nếu không đồng bộ, mẫu "+__% HP" sẽ không bao
    giờ khớp desc đã bị chuẩn hoá khác đi."""
    normalized = " ".join(raw_pattern.strip().split())
    normalized = re.sub(r"\s*%\s*", "% ", normalized)
    parts = normalized.split("__")
    escaped = [re.escape(p) for p in parts]
    regex_str = r"\d+(?:[.,]\d+)?".join(escaped)
    return re.compile(r"^\s*" + regex_str + r"\s*$", re.IGNORECASE)


def load_pattern_file(path, default_lines):
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(default_lines) + "\n")
        print(f"📝 Đã tạo file mẫu mặc định: {path} - hãy chỉnh lại cho đúng wording thật.")

    raw_patterns = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            raw_patterns.append(line)

    compiled = []
    for p in raw_patterns:
        try:
            compiled.append(compile_pattern(p))
        except Exception as e:
            print(f"⚠️ Mẫu lỗi '{p}' trong {path}: {e} - bỏ qua.")
    return compiled


def load_dianguc_config():
    global CONFIG, DIANGUC_COMMAND, CLICK_DELAY, INITIAL_WAIT_AFTER_COMMAND
    global INTER_RUN_WAIT, DIANGUC_MESSAGE_WAIT, TRACK_RETRY_COUNT
    global TRACK_RETRY_DELAY, MAX_LOST_TRACK_ROUNDS
    global DIRECTION_MARKER, CORRECT_DIRECTION_MARKER, BUFF_SELECT_MARKER
    global WRONG_DIRECTION_MARKER, DEATH_MARKER, STAMINA_MARKER, MYSTERY_EVENT_MARKER
    global FLOOR_REGEX, STEP_REGEX, BUFF_PRIORITY
    global DIANGUC_SKILLS, BUFF_PRIORITY_PATTERNS, ANTI_PICK_PATTERNS

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
    DIANGUC_COMMAND = config["DIANGUC_COMMAND"]
    CLICK_DELAY = max(0.2, float(config["CLICK_DELAY"]))
    INITIAL_WAIT_AFTER_COMMAND = max(0.0, float(config["INITIAL_WAIT_AFTER_COMMAND"]))
    INTER_RUN_WAIT = max(0.0, float(config["INTER_RUN_WAIT"]))
    DIANGUC_MESSAGE_WAIT = max(3, int(float(config["DIANGUC_MESSAGE_WAIT"])))
    TRACK_RETRY_COUNT = max(1, int(float(config["TRACK_RETRY_COUNT"])))
    TRACK_RETRY_DELAY = max(0.1, float(config["TRACK_RETRY_DELAY"]))
    MAX_LOST_TRACK_ROUNDS = max(1, int(float(config["MAX_LOST_TRACK_ROUNDS"])))

    DIRECTION_MARKER = config["DIRECTION_MARKER"]
    CORRECT_DIRECTION_MARKER = config["CORRECT_DIRECTION_MARKER"]
    BUFF_SELECT_MARKER = config["BUFF_SELECT_MARKER"]
    WRONG_DIRECTION_MARKER = config["WRONG_DIRECTION_MARKER"]
    DEATH_MARKER = config["DEATH_MARKER"]
    STAMINA_MARKER = config["STAMINA_MARKER"]
    MYSTERY_EVENT_MARKER = config["MYSTERY_EVENT_MARKER"]

    try:
        FLOOR_REGEX = re.compile(config["FLOOR_REGEX_PATTERN"], re.IGNORECASE)
    except Exception as e:
        print(f"⚠️ FLOOR_REGEX_PATTERN lỗi ({e}) -> dùng mặc định.")
        FLOOR_REGEX = re.compile(r"Tầng\s*(\d+)", re.IGNORECASE)

    try:
        STEP_REGEX = re.compile(config["STEP_REGEX_PATTERN"], re.IGNORECASE)
    except Exception as e:
        print(f"⚠️ STEP_REGEX_PATTERN lỗi ({e}) -> dùng mặc định.")
        STEP_REGEX = re.compile(r"Bước\s*(\d+)", re.IGNORECASE)

    BUFF_PRIORITY = [p.strip() for p in config["BUFF_PRIORITY"].split(",") if p.strip()]

    DIANGUC_SKILLS = bc.load_skill_file(DIANGUC_SKILL_FILE, DEFAULT_DIANGUC_SKILLS)
    BUFF_PRIORITY_PATTERNS = load_pattern_file(PRIORITY_FILE, DEFAULT_PRIORITY_LINES)
    ANTI_PICK_PATTERNS = load_pattern_file(ANTI_PICK_FILE, DEFAULT_ANTI_PICK_LINES)


# ============================================================
# STATE
# ============================================================

should_stop = False
should_pause = False
reset_requested = False

max_attempts = 1

attempts_done = 0
deaths_count = 0
failed_count = 0
highest_floor_ever = 0
highest_step_ever = 0

start_time = datetime.now()


# ============================================================
# LOG CHI TIẾT MỖI LẦN THỬ -> log.txt (riêng, KHÔNG in ra console)
# ============================================================
# Mục tiêu: giảm bớt lượng log in ra console (chỉ giữ dòng ngắn gọn cho
# các mốc quan trọng), còn TOÀN BỘ chi tiết cần để tra cứu thủ công khi
# có lỗi/mất dấu (thời gian, phiên/lần thử, text message buff, buff đã
# chọn, hướng đã chọn kể cả đúng/sai...) được gom lại và ghi 1 lần vào
# log.txt ngay khi lần thử đó KẾT THÚC (dù thành công, chết, lỗi, dừng
# giữa chừng hay bị reset) để không bị mất dữ liệu nếu chương trình gặp
# sự cố giữa chừng.

_attempt_log_lines = []
_attempt_start_dt = None


def log_line(msg):
    """Thêm 1 dòng (có timestamp) vào log của LẦN THỬ hiện tại. Dòng này
    CHƯA được ghi ra file ngay - chỉ gom lại trong bộ nhớ, việc ghi thật
    sự ra log.txt diễn ra ở flush_attempt_log() khi lần thử kết thúc."""
    ts = datetime.now().strftime("%H:%M:%S")
    _attempt_log_lines.append(f"[{ts}] {msg}")


def flush_attempt_log(attempt_num, result_text):
    """Ghi toàn bộ chi tiết của lần thử vừa kết thúc vào log.txt (append
    - KHÔNG ghi đè các lần trước). Luôn được gọi khi 1 lần thử kết thúc,
    bất kể lý do gì, để đảm bảo có dấu vết tra cứu thủ công."""
    end_dt = datetime.now()
    start_dt = _attempt_start_dt or end_dt
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 90}\n")
            f.write(
                f"LẦN THỬ #{attempt_num} | Phiên: {start_dt.strftime('%Y-%m-%d %H:%M:%S')} "
                f"-> {end_dt.strftime('%H:%M:%S')} (thời lượng {end_dt - start_dt})\n"
            )
            f.write(f"Kết quả: {result_text}\n")
            f.write("-" * 90 + "\n")
            if _attempt_log_lines:
                for line in _attempt_log_lines:
                    f.write(line + "\n")
            else:
                f.write("(không có chi tiết buff/hướng nào được ghi nhận trong lần thử này)\n")
            f.write(f"{'=' * 90}\n")
    except Exception as e:
        print(f"⚠️ Không ghi được {LOG_FILE}: {e}")


def describe_result(result):
    """Chuyển giá trị trả về của _process_dianguc_attempt_core() thành
    1 dòng mô tả kết quả dễ đọc, dùng làm dòng 'Kết quả:' trong log.txt."""
    if result == "STOP":
        return "DỪNG THEO LỆNH (stop)"
    if result == "RESET":
        return "DỪNG ĐỂ RESET THEO LỆNH (reset)"
    if result == "FAILED":
        return "LỖI / MẤT DẤU MESSAGE"
    if result == "EXIT_PROGRAM":
        return "THOÁT CHƯƠNG TRÌNH (phát hiện hết stamina)"
    if isinstance(result, tuple) and result and result[0] == "DEATH":
        _, floor, step = result
        return f"CHẾT ở Tầng {floor} - Bước {step}"
    return str(result)


# ============================================================
# EXCEL TRACKING — hướng đúng/sai theo từng bước, xoá khi sang tầng mới
# ============================================================

DIRECTIONS = ["lên", "xuống", "trái", "phải"]
DIRECTION_COL = {"lên": 2, "xuống": 3, "trái": 4, "phải": 5}

step_knowledge = {}      # {step_number: {"lên": "đúng"/"sai"/None, ...}}
excel_floor_tag = 0       # tầng mà dữ liệu hiện tại đang lưu ứng với


def ensure_excel_exists():
    if os.path.exists(EXCEL_FILE):
        return
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.cell(row=1, column=2, value="lên")
    ws.cell(row=1, column=3, value="xuống")
    ws.cell(row=1, column=4, value="trái")
    ws.cell(row=1, column=5, value="phải")
    meta = wb.create_sheet("Meta")
    meta.cell(row=1, column=1, value="current_floor")
    meta.cell(row=1, column=2, value=0)
    wb.save(EXCEL_FILE)
    print(f"📝 Đã tạo file dữ liệu mới: {EXCEL_FILE}")


def load_excel_data():
    global step_knowledge, excel_floor_tag
    ensure_excel_exists()

    try:
        wb = openpyxl.load_workbook(EXCEL_FILE)
    except Exception as e:
        print(f"⚠️ Không đọc được {EXCEL_FILE}: {e} -> bắt đầu với dữ liệu trống.")
        step_knowledge = {}
        excel_floor_tag = 0
        return

    ws = wb["Data"] if "Data" in wb.sheetnames else wb.active
    step_knowledge = {}

    for row_cells in ws.iter_rows(min_row=2):
        step_cell = row_cells[0]
        if step_cell.value is None:
            continue
        try:
            step_num = int(step_cell.value)
        except Exception:
            continue

        entry = {}
        for d in DIRECTIONS:
            col_idx = DIRECTION_COL[d] - 1  # row_cells là 0-indexed theo min_col=1
            val = row_cells[col_idx].value if col_idx < len(row_cells) else None
            entry[d] = val.strip().lower() if isinstance(val, str) and val.strip() else None
        step_knowledge[step_num] = entry

    if "Meta" in wb.sheetnames:
        meta = wb["Meta"]
        try:
            excel_floor_tag = int(meta.cell(row=1, column=2).value or 0)
        except Exception:
            excel_floor_tag = 0
    else:
        excel_floor_tag = 0

    print(f"📊 Đã nạp Excel: tầng đã lưu = {excel_floor_tag}, {len(step_knowledge)} bước có dữ liệu.")


def save_excel_data():
    try:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Data"
        ws.cell(row=1, column=2, value="lên")
        ws.cell(row=1, column=3, value="xuống")
        ws.cell(row=1, column=4, value="trái")
        ws.cell(row=1, column=5, value="phải")

        for i, step_num in enumerate(sorted(step_knowledge.keys()), start=2):
            ws.cell(row=i, column=1, value=step_num)
            entry = step_knowledge[step_num]
            for d in DIRECTIONS:
                val = entry.get(d)
                if val:
                    ws.cell(row=i, column=DIRECTION_COL[d], value=val)

        meta = wb.create_sheet("Meta")
        meta.cell(row=1, column=1, value="current_floor")
        meta.cell(row=1, column=2, value=excel_floor_tag)

        wb.save(EXCEL_FILE)
    except Exception as e:
        print(f"⚠️ Không lưu được {EXCEL_FILE}: {e}")


def clear_excel_data_for_new_floor(new_floor):
    global step_knowledge, excel_floor_tag
    print(f"🧹 Phát hiện sang TẦNG MỚI ({excel_floor_tag} -> {new_floor}) -> xoá sạch dữ liệu Excel cũ.")
    step_knowledge = {}
    excel_floor_tag = new_floor
    save_excel_data()


def record_step_result(step_num, direction, is_correct):
    if step_num is None or direction is None or direction == "?":
        return
    entry = step_knowledge.setdefault(step_num, {d: None for d in DIRECTIONS})
    entry[direction] = "đúng" if is_correct else "sai"
    print(f"📝 Bước {step_num}: hướng [{direction}] = {entry[direction]}")
    log_line(f"HƯỚNG - Bước {step_num}: chọn [{direction}] -> {entry[direction].upper()}")


def choose_direction(step_num, buttons):
    entry = step_knowledge.get(step_num, {}) if step_num is not None else {}

    button_by_direction = {}
    for b in buttons:
        text = button_text(b).lower()
        for d in DIRECTIONS:
            if d in text:
                button_by_direction[d] = b
                break

    for d in DIRECTIONS:
        if entry.get(d) == "đúng" and d in button_by_direction:
            return button_by_direction[d], d

    for d in DIRECTIONS:
        if entry.get(d) == "sai":
            continue
        if d in button_by_direction:
            return button_by_direction[d], d

    if buttons:
        return buttons[0], "?"
    return None, None


# ============================================================
# GIỮ MESSAGE Ở GIỮA MÀN HÌNH + CLICK AN TOÀN (giống luanhoi_bot.py)
# ============================================================

_SCROLL_TO_CENTER_SCRIPT = """
const el = arguments[0];
if (!el) return false;

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
    const targetTop = container.scrollTop
        + (eRect.top - cRect.top)
        - (cRect.height / 2)
        + (eRect.height / 2);
    container.scrollTo({ top: targetTop, behavior: 'auto' });
    return true;
}

el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
return true;
"""


def scroll_message_to_center(driver, msg_elem):
    if msg_elem is None:
        return False
    try:
        return bool(driver.execute_script(_SCROLL_TO_CENTER_SCRIPT, msg_elem))
    except Exception:
        return False


def click_button_safe(driver, msg_elem, btn):
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


def parse_step(text):
    m = STEP_REGEX.search(text)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None


# ============================================================
# CHỌN BUFF THEO LOẠI ƯU TIÊN (khác luanhoi_bot.py)
# ============================================================

def _strip_emoji_and_symbols(s):
    """Loại bỏ MỌI icon/emoji/ký hiệu trang trí trong toàn bộ chuỗi
    (không chỉ ở đầu), chỉ giữ chữ (có dấu), số, khoảng trắng, %, +, -."""
    return re.sub(r"[^\w%+\-\s]", "", s, flags=re.UNICODE)


def parse_buff_button(text):
    """Trả (tier, description_normalized) từ raw text của BUTTON.

    Trên Discord button chỉ hiển thị bậc (VD "🟢 Phàm"), không có mô tả.
    Hàm này vẫn cố gắng parse phòng trường hợp button có kèm mô tả - còn
    bình thường desc sẽ rỗng, và mô tả thật sẽ được lấy từ message text
    thông qua align_buffs_to_buttons()."""
    raw = text.strip()
    lower_raw = raw.lower()

    tier = None
    for t in BUFF_PRIORITY:
        pattern = r"(?<!\w)" + re.escape(t.lower()) + r"(?!\w)"
        m = re.search(pattern, lower_raw, flags=re.UNICODE)
        if m:
            tier = t
            raw = raw[:m.start()] + raw[m.end():]
            break

    cleaned = _strip_emoji_and_symbols(raw)
    cleaned = re.sub(r"\s*%\s*", "% ", cleaned)
    desc = " ".join(cleaned.split())
    return tier, desc


def _clean_desc(raw):
    """Làm sạch mô tả: bỏ emoji/ký hiệu, chuẩn hoá khoảng trắng quanh %."""
    cleaned = re.sub(r"[^\w%+\-\s.,]", "", raw, flags=re.UNICODE)
    cleaned = re.sub(r"\s*%\s*", "% ", cleaned)
    return " ".join(cleaned.split())


def extract_buff_description_line(message_text):
    """Cô lập đúng DÒNG mô tả buff (nằm ngay sau BUFF_SELECT_MARKER
    'Chọn 1 buff:'), KHÔNG dùng nguyên message_text.

    ĐÂY LÀ NGUYÊN NHÂN BUG: align_buffs_to_buttons() dùng
    `end = len(text)` cho mục CUỐI CÙNG khi không còn tier nào sau nó.
    Nếu `text` là NGUYÊN msg.text, mục cuối sẽ "nuốt" toàn bộ nội dung
    phía sau dòng mô tả thật (nhãn nút bị lặp lại trong text, "This
    interaction failed", timestamp "(edited)...", emoji reaction...).
    Cô lập đúng 1 dòng mô tả trước khi truyền vào align_buffs_to_buttons
    thì mục cuối sẽ tự nhiên dừng đúng ở cuối dòng đó."""
    idx = message_text.find(BUFF_SELECT_MARKER)
    if idx == -1:
        return message_text

    remainder = message_text[idx + len(BUFF_SELECT_MARKER):]
    remainder = remainder.lstrip(":")

    for line in remainder.split("\n"):
        line = line.strip()
        if line:
            return line
    return ""


def align_buffs_to_buttons(text, button_tiers):
    """Ghép mô tả buff vào từng button, DÙNG THỨ TỰ BẬC TRÊN BUTTON làm
    khuôn mẫu.

    Lý do: khi Selenium trả về `elem.text`, các emoji/icon phân tách giữa
    các option có thể bị nuốt mất, khiến ta không còn cách nào phân biệt
    "tier label thật" với "tier xuất hiện trong mô tả" (VD "Hấp Thu Linh
    Hồn") nếu chỉ nhìn 2 ký tự quanh tier. Nhưng vì Discord LUÔN render
    text cùng thứ tự với button, ta có thể dùng dãy bậc [Linh, Linh,
    Huyền, Huyền] làm khuôn mẫu: quét text từ trái sang phải, tìm đúng
    tier của button[0], rồi button[1], v.v.

    Trả về list [(tier, desc), ...] cùng độ dài button_tiers; mục không
    tìm được -> (None, None)."""
    if not text or not button_tiers:
        return [(None, None)] * len(button_tiers or [])

    tier_alts = "|".join(re.escape(t) for t in BUFF_PRIORITY)
    tier_re = re.compile(
        r"(?<!\w)(" + tier_alts + r")(?!\w)",
        re.IGNORECASE | re.UNICODE,
    )
    all_matches = list(tier_re.finditer(text))

    picked = []
    last_end = 0
    for tier_btn in button_tiers:
        found = None
        if tier_btn:
            for m in all_matches:
                if m.start() < last_end:
                    continue
                if m.group(1).lower() == tier_btn.lower():
                    found = m
                    break
        picked.append(found)
        if found is not None:
            last_end = found.end()

    result = []
    for i, m in enumerate(picked):
        if m is None:
            result.append((None, None))
            continue
        next_start = None
        for j in range(i + 1, len(picked)):
            if picked[j] is not None:
                next_start = picked[j].start()
                break
        end = next_start if next_start is not None else len(text)
        desc = _clean_desc(text[m.end():end])
        result.append((m.group(1), desc))
    return result


def is_banned_buff(desc):
    if "hồi" in desc.lower():
        return True
    for pattern in ANTI_PICK_PATTERNS:
        if pattern.match(desc):
            return True
    return False


def extract_number(desc):
    m = re.search(r"\d+(?:[.,]\d+)?", desc)
    if not m:
        return 0.0
    try:
        return float(m.group(0).replace(",", "."))
    except Exception:
        return 0.0


def pick_buff_by_tier(candidates):
    """candidates: list (btn, tier, desc, text). Chọn theo bậc cao nhất,
    trái->phải trong số các buff cùng bậc cao nhất đó."""
    for tier in BUFF_PRIORITY:
        for btn, t, desc, text in candidates:
            if t == tier:
                log_line(f"BUFF (rơi về chọn theo bậc) [{tier}]: {text!r}")
                return btn, text
    if candidates:
        log_line("BUFF: KHÔNG xác định được bậc cho bất kỳ nút nào (kiểm tra lại wording bậc "
                  "trong BUFF_PRIORITY) -> buộc lấy nút đầu tiên.")
        return candidates[0][0], candidates[0][3]
    return None, None


def pick_buff_button_dianguc(buttons, message_text="", debug=False):
    """Chọn buff ưu tiên theo list_uutien.txt.

    Nguyên tắc: button chỉ hiển thị BẬC ("🔵 Linh"), mô tả thật nằm ở
    body text. Dùng dãy bậc của button làm KHUÔN MẪU để trích mô tả từ
    text (xem align_buffs_to_buttons)."""

    btn_parsed = []  # (btn, tier_btn, desc_btn, raw)
    for b in buttons:
        raw = button_text(b)
        tier_btn, desc_btn = parse_buff_button(raw)
        btn_parsed.append((b, tier_btn, desc_btn, raw))

    button_tiers = [t for _, t, _, _ in btn_parsed]

    if debug:
        preview = message_text if len(message_text) <= 400 else message_text[:400] + "...<cắt>"
        print(f"   📄 msg.text = {preview!r}")
        print(f"   🔘 {len(btn_parsed)} button: bậc = {button_tiers}")

    # Trích mô tả từ text dùng khuôn mẫu bậc của button. Cô lập đúng
    # DÒNG mô tả trước (không dùng nguyên msg.text) để mục CUỐI CÙNG
    # không bị nuốt rác phía sau (nhãn nút lặp lại, timestamp, reaction...).
    if message_text and all(button_tiers):
        buff_line = extract_buff_description_line(message_text)
        text_buffs = align_buffs_to_buttons(buff_line, button_tiers)
        if debug:
            print(f"   📏 Dòng mô tả đã cô lập: {buff_line!r}")
            print(f"   📖 Trích mô tả theo khuôn mẫu bậc ({len(text_buffs)} mục):")
            for i, (t, d) in enumerate(text_buffs):
                print(f"      [{i}] bậc={t!r} mô_tả={d!r}")
    else:
        text_buffs = [(None, None)] * len(buttons)
        if debug:
            print("   ⚠️ Thiếu message_text hoặc có button không nhận diện được bậc "
                  "-> không trích được mô tả từ text.")

    # Ghép button với mô tả theo đúng thứ tự
    parsed = []
    for (b, tier_btn, desc_btn, raw), (text_tier, text_desc) in zip(btn_parsed, text_buffs):
        if text_desc:
            parsed.append((b, tier_btn or text_tier, text_desc, raw))
        else:
            parsed.append((b, tier_btn, desc_btn, raw))

    if debug:
        print("   🔍 Phân tích buff cuối cùng:")
        for _, tier, desc, raw in parsed:
            print(f"      raw={raw!r} -> bậc={tier!r} mô_tả={desc!r}")

    # Loại buff bị cấm
    candidates = [p for p in parsed if not is_banned_buff(p[2])]
    if not candidates:
        print("⚠️ Tất cả buff đều bị cấm (hồi/anti_pick) -> buộc chọn theo bậc trên toàn bộ nút.")
        candidates = parsed

    # Khớp pattern ưu tiên theo đúng thứ tự trong list_uutien.txt
    for i, pattern in enumerate(BUFF_PRIORITY_PATTERNS):
        matched = [c for c in candidates if pattern.match(c[2])]
        if matched:
            def sort_key(c):
                _, tier, desc, _ = c
                tier_rank = BUFF_PRIORITY.index(tier) if tier in BUFF_PRIORITY else len(BUFF_PRIORITY)
                return (tier_rank, -extract_number(desc))
            matched.sort(key=sort_key)
            best = matched[0]
            if debug:
                print(f"   ✅ Khớp ưu tiên #{i} ({pattern.pattern}) -> chọn: {best[3]!r} ({best[2]!r})")
            log_line(f"BUFF: khớp ưu tiên #{i} ({pattern.pattern}) -> chọn: {best[3]!r}")
            return best[0], best[3]

    if debug:
        print("   ⚠️ KHÔNG có buff nào khớp list_uutien.txt -> rơi về chọn theo bậc.")
    log_line("BUFF: không khớp list_uutien.txt -> rơi về chọn theo bậc.")
    return pick_buff_by_tier(candidates)


def pick_skill_button(buttons, skill_name):
    for btn in buttons:
        text = button_text(btn)
        if skill_name.lower() in text.lower():
            return btn, text
    return None, None


# ============================================================
# PHÂN LOẠI MÀN HÌNH
# ============================================================

def classify_phase(text, button_texts):
    lower = text.lower()

    if STAMINA_MARKER.lower() in lower:
        return "STAMINA"

    if DEATH_MARKER.lower() in lower:
        return "DEATH"

    # Sự kiện ngẫu nhiên xuất hiện THAY cho màn chọn hướng sau khi thắng
    # 1 bước - phải kiểm tra TRƯỚC BUFF_SELECT/DIRECTION vì nó có thể
    # trùng thời điểm xuất hiện với 2 màn đó (loại trừ lẫn nhau).
    if MYSTERY_EVENT_MARKER.lower() in lower and button_texts:
        return "MYSTERY_EVENT"

    if BUFF_SELECT_MARKER.lower() in lower and button_texts:
        return "BUFF_SELECT"

    if DIRECTION_MARKER.lower() in lower and button_texts:
        return "DIRECTION"

    for t in button_texts:
        for skill in DIANGUC_SKILLS:
            if skill.lower() in t.lower():
                return "BATTLE"

    return "UNKNOWN"


# ============================================================
# 1 LẦN THỬ (!dianguc -> ... -> Chết / mất dấu)
# ============================================================

def _process_dianguc_attempt_core(driver, attempt_num):
    global highest_floor_ever, highest_step_ever, excel_floor_tag

    print(f"\n{'=' * 55}")
    print(f"⏰ {datetime.now().strftime('%H:%M:%S')} | Lần thử {attempt_num}/{max_attempts}")
    print(f"{'=' * 55}")

    load_excel_data()

    before_keys = set(bc.get_message_key(m) for m in bc.get_all_messages(driver))

    if not bc.send_command(driver, DIANGUC_COMMAND):
        return "FAILED"

    time.sleep(INITIAL_WAIT_AFTER_COMMAND)

    tracked_id = None
    deadline = time.time() + DIANGUC_MESSAGE_WAIT

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
        print("⚠️ Không tìm thấy message phản hồi sau !dianguc.")
        return "FAILED"

    print(f"📌 Đang bám theo message_id: {tracked_id}")

    last_floor_seen = None
    last_step_seen = None
    lost_track_rounds = 0
    skill_index = 0
    last_skill_context = None   # (floor, step) - đổi thì reset vòng xoay skill
    pending_choice = None       # (step_num, direction) đang chờ xác nhận đúng/sai
    floor_checked_initial = False

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
                print("❌ Mất dấu message quá lâu -> dừng lần thử này.")
                save_excel_data()
                return "FAILED"
            time.sleep(CLICK_DELAY)
            continue
        lost_track_rounds = 0

        scroll_message_to_center(driver, elem)

        try:
            text = elem.text or ""
        except Exception:
            time.sleep(CLICK_DELAY)
            continue

        buttons = get_buttons(elem)
        button_texts = [button_text(b) for b in buttons]

        floor = parse_floor(text)
        step = parse_step(text)

        if floor:
            last_floor_seen = floor
            highest_floor_ever = max(highest_floor_ever, floor)
        if step:
            last_step_seen = step
            highest_step_ever = max(highest_step_ever, step)

        # --- Đồng bộ Excel với tầng thực tế ---
        if floor:
            if not floor_checked_initial:
                floor_checked_initial = True
                if excel_floor_tag and excel_floor_tag != floor:
                    clear_excel_data_for_new_floor(floor)
                elif not excel_floor_tag:
                    excel_floor_tag = floor
                    save_excel_data()
            elif floor > excel_floor_tag:
                clear_excel_data_for_new_floor(floor)

        # --- Ghi nhận kết quả hướng đã chọn trước đó (side-effect, tách
        # riêng khỏi việc quyết định hành động tiếp theo) ---
        if pending_choice is not None:
            if WRONG_DIRECTION_MARKER.lower() in text.lower():
                record_step_result(pending_choice[0], pending_choice[1], False)
                pending_choice = None
            elif CORRECT_DIRECTION_MARKER.lower() in text.lower():
                record_step_result(pending_choice[0], pending_choice[1], True)
                pending_choice = None

        context = (last_floor_seen, last_step_seen)
        if context != last_skill_context:
            skill_index = 0
            last_skill_context = context

        phase = classify_phase(text, button_texts)

        if phase == "STAMINA":
            print("⛔ Phát hiện marker hết stamina -> THOÁT CHƯƠNG TRÌNH.")
            save_excel_data()
            return "EXIT_PROGRAM"

        if phase == "DEATH":
            print(f"💀 ĐÃ CHẾT ở Tầng {last_floor_seen} - Bước {last_step_seen}.")
            save_excel_data()
            return ("DEATH", last_floor_seen, last_step_seen)

        if phase == "MYSTERY_EVENT":
            if not buttons:
                print("⚠️ Sự kiện bí ẩn nhưng không thấy nút nào.")
                time.sleep(CLICK_DELAY)
                continue
            btn = buttons[0]
            btxt = button_texts[0] if button_texts else "(nút đầu)"
            print(f"🎲 Sự kiện bí ẩn -> luôn chọn nút đầu tiên: [{btxt}]")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click sự kiện bí ẩn lỗi.")
            # Chờ đúng CLICK_DELAY (1.5s) trước khi quét lại để chọn
            # bước tiếp theo, tránh quét ngay lúc DOM chưa kịp cập nhật.
            time.sleep(CLICK_DELAY)
            continue

        if phase == "BUFF_SELECT":
            buff_line_for_log = extract_buff_description_line(text)
            btn, btxt = pick_buff_button_dianguc(buttons, message_text=text)
            if btn is None:
                print(f"⚠️ Không xác định được nút buff trong: {button_texts}")
                log_line(f"BUFF - Tầng {last_floor_seen} Bước {last_step_seen} | msg: {buff_line_for_log!r} "
                         f"-> ❌ KHÔNG xác định được nút buff (buttons: {button_texts})")
                time.sleep(CLICK_DELAY)
                continue
            print(f"✨ Tầng {last_floor_seen} Bước {last_step_seen}: chọn buff [{btxt}]")
            log_line(f"BUFF - Tầng {last_floor_seen} Bước {last_step_seen} | msg: {buff_line_for_log!r} "
                     f"-> Đã chọn: {btxt!r}")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click buff lỗi.")
                log_line("BUFF: click lỗi.")
            time.sleep(CLICK_DELAY)
            continue

        if phase == "DIRECTION":
            btn, direction = choose_direction(last_step_seen, buttons)
            if btn is None:
                print("⚠️ Không tìm thấy nút hướng khả dụng.")
                log_line(f"HƯỚNG - Bước {last_step_seen}: ❌ không tìm thấy nút hướng khả dụng "
                         f"(buttons: {button_texts})")
                time.sleep(CLICK_DELAY)
                continue
            print(f"🧭 Bước {last_step_seen}: thử hướng [{direction}]")
            if not click_button_safe(driver, elem, btn):
                print("⚠️ Click hướng lỗi.")
                log_line(f"HƯỚNG - Bước {last_step_seen}: thử [{direction}] -> click LỖI")
            else:
                pending_choice = (last_step_seen, direction)
                log_line(f"HƯỚNG - Bước {last_step_seen}: đã bấm thử [{direction}] (chờ xác nhận)")
            time.sleep(CLICK_DELAY)
            continue

        if phase == "BATTLE":
            if not DIANGUC_SKILLS:
                print("❌ Không có skill trong skill.txt để spam!")
                time.sleep(CLICK_DELAY)
                continue

            skill = DIANGUC_SKILLS[skill_index % len(DIANGUC_SKILLS)]
            btn, btxt = pick_skill_button(buttons, skill)

            if btn is not None:
                if click_button_safe(driver, elem, btn):
                    print(f"   ⚔️ Tầng {last_floor_seen} Bước {last_step_seen}: đã dùng [{btxt}]")
                else:
                    print(f"   ⚠️ Click skill lỗi: [{btxt}]")
            else:
                print(f"   ❌ Không thấy nút skill '{skill}' trong: {button_texts}")

            skill_index += 1
            time.sleep(CLICK_DELAY)
            continue

        print(f"❓ Chưa nhận diện được màn hình hiện tại. Buttons: {button_texts}")
        time.sleep(CLICK_DELAY)


def process_dianguc_attempt(driver, attempt_num):
    """Wrapper quanh _process_dianguc_attempt_core(): dọn bộ nhớ log của
    lần thử mới, chạy logic thật, rồi LUÔN ghi chi tiết ra log.txt khi
    lần thử kết thúc (dù thành công, chết, lỗi, dừng hay bị reset giữa
    chừng) - kể cả khi có exception bất ngờ, để không mất dấu vết."""
    global _attempt_log_lines, _attempt_start_dt

    _attempt_log_lines = []
    _attempt_start_dt = datetime.now()

    try:
        result = _process_dianguc_attempt_core(driver, attempt_num)
    except Exception as e:
        log_line(f"❌ LỖI NGOẠI LỆ GIỮA CHỪNG: {e}")
        flush_attempt_log(attempt_num, f"LỖI NGOẠI LỆ: {e}")
        raise

    flush_attempt_log(attempt_num, describe_result(result))
    return result


# ============================================================
# MENU / INPUT
# ============================================================

def display_menu():
    print(f"\n{'=' * 60}")
    print("🔥 DIANGUC BOT — leo Địa Ngục (độc lập)")
    print(f"{'=' * 60}")
    print("  📊 status   - Xem trạng thái")
    print("  ⏸️  pause    - Tạm dừng")
    print("  ▶️  resume   - Tiếp tục")
    print("  🔄 reset    - Nạp lại config/skill/list_uutien/anti_pick")
    print("  🛑 stop     - Dừng bot")
    print("  🧹 clear    - Xoá màn hình")
    print("  ❓ help     - Hiển thị menu")
    print(f"{'=' * 60}")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"🔁 Số lần thử tối đa: {max_attempts}")
    print(f"⚔️ Skills: {', '.join(DIANGUC_SKILLS)}")
    print(f"📊 Đã thử: {attempts_done}/{max_attempts} | 💀 Chết: {deaths_count} | ⚠️ Lỗi: {failed_count}")
    print(f"⬆️ Tầng/Bước cao nhất từng đạt: Tầng {highest_floor_ever} - Bước {highest_step_ever}")
    print(f"{'=' * 60}\n")


def input_handler():
    global should_stop, should_pause, reset_requested

    display_menu()

    while not should_stop:
        try:
            command = input("🔹 [DIANGUC] Nhập lệnh > ").strip().lower()

            if command == "stop":
                should_stop = True
                save_excel_data()
                print(f"🛑 Đã nhận lệnh dừng. (đã lưu dữ liệu vào {EXCEL_FILE} nếu có)")
                break
            elif command == "pause":
                should_pause = True
                save_excel_data()
                print(f"⏸️ Đã tạm dừng. (đã lưu dữ liệu vào {EXCEL_FILE} nếu có)")
            elif command == "resume":
                should_pause = False
                print("▶️ Đã tiếp tục.")
            elif command == "reset":
                reset_requested = True
                print("🔄 Đã nhận lệnh reset -> sẽ nạp lại config/skill/list sau lần thử hiện tại.")
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
    print("🔄 Đang nạp lại config.txt, dianguc_config.txt, skill.txt, list_uutien.txt, anti_pick.txt ...")
    bc.load_config_file()
    load_dianguc_config()
    reset_requested = False
    print(f"✅ Reset xong. Skills: {', '.join(DIANGUC_SKILLS)}")


# ============================================================
# MAIN
# ============================================================

def main():
    global should_stop, should_pause, reset_requested
    global max_attempts, attempts_done, deaths_count, failed_count

    bc.load_config_file()
    load_dianguc_config()

    print("=" * 60)
    print("🔥 DIANGUC BOT (độc lập với NPC/Boss/Luanhoi)")
    print(f"👤 Player: {bc.PLAYER_NAME}")
    print(f"⚔️ Skills: {', '.join(DIANGUC_SKILLS)}")
    print(f"📋 Ưu tiên buff ({len(BUFF_PRIORITY_PATTERNS)} mẫu): xem {PRIORITY_FILE}")
    print(f"🚫 Anti-pick ({len(ANTI_PICK_PATTERNS)} mẫu): xem {ANTI_PICK_FILE}")
    print("=" * 60)

    driver, _ = bc.attach_or_launch_game_edge("DIANGUC")
    if driver is None:
        input("\n👉 Nhấn ENTER để thoát...")
        return

    if not bc.open_discord(driver, "DIANGUC"):
        bc.close_driver_only(driver)
        return

    while True:
        raw = input("👉 Nhập SỐ LẦN THỬ tối đa (VD 5): ").strip()
        try:
            max_attempts = int(raw)
            if max_attempts <= 0:
                raise ValueError
            break
        except ValueError:
            print("❌ Vui lòng nhập số nguyên dương.")

    bc.wait_for_enter_to_start(
        "DIANGUC",
        extra_lines=[
            f"🔁 Số lần thử tối đa: {max_attempts}",
            f"⏱️ Nhịp click: {CLICK_DELAY}s (dùng chung cho spam skill/chọn buff/chọn hướng)",
            "💀 Chết sẽ reset về Bước 1 CÙNG tầng - dữ liệu Excel của tầng đó vẫn giữ nguyên.",
            "🧹 Sang tầng mới sẽ tự xoá dữ liệu Excel cũ.",
            "🎭 Gặp 'Sự Kiện Bí Ẩn' sẽ tự bấm nút đầu tiên rồi đợi 1.5s.",
            "⛔ Gặp marker hết stamina sẽ tự thoát chương trình.",
            f"📄 Chi tiết mỗi lần thử (buff/hướng, kể cả đúng-sai) được ghi vào {LOG_FILE}.",
            "⏸️/🛑 Lệnh pause/stop sẽ lưu ngay dữ liệu hiện có vào file Excel.",
        ],
    )

    input_thread = threading.Thread(target=input_handler, daemon=True)
    input_thread.start()

    exit_program = False

    try:
        while not should_stop and attempts_done < max_attempts:
            try:
                if reset_requested:
                    apply_reset()
                    continue

                if should_pause:
                    time.sleep(0.3)
                    continue

                attempt_num = attempts_done + 1
                result = process_dianguc_attempt(driver, attempt_num)

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
                    failed_count += 1
                    attempts_done += 1
                elif isinstance(result, tuple) and result[0] == "DEATH":
                    deaths_count += 1
                    attempts_done += 1

                if should_stop or attempts_done >= max_attempts:
                    break

                print(f"\n⏳ Chờ {INTER_RUN_WAIT}s trước lần thử tiếp theo...")
                waited = 0.0
                while waited < INTER_RUN_WAIT:
                    if should_stop or reset_requested:
                        break
                    time.sleep(0.2)
                    waited += 0.2

            except Exception as e:
                print(f"❌ Lỗi main loop DIANGUC: {e}")
                time.sleep(3)

    except KeyboardInterrupt:
        should_stop = True

    finally:
        should_stop = True
        if input_thread.is_alive():
            input_thread.join(timeout=2)

        print(f"\n{'=' * 50}")
        print("📊 TỔNG KẾT DIANGUC")
        print(f"⏱️ Thời gian chạy: {datetime.now() - start_time}")
        print(f"🔁 Tổng số lần đã thử: {attempts_done}/{max_attempts}")
        print(f"💀 Số lần chết: {deaths_count}")
        print(f"⚠️ Lỗi/mất dấu message: {failed_count}")
        print(f"⬆️ Tầng/Bước cao nhất từng đạt: Tầng {highest_floor_ever} - Bước {highest_step_ever}")
        if exit_program:
            print("⛔ Đã thoát do phát hiện marker hết stamina.")
        print(f"{'=' * 50}")

        bc.close_driver_only(driver)
        print("👋 DIANGUC bot đã dừng (các bot khác, nếu đang chạy, KHÔNG bị ảnh hưởng).")


if __name__ == "__main__":
    main()