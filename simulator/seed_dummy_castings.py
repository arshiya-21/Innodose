"""
Pouring simulator for innodose_casting_details_v2 (schema: inodose_test).

Default: one pouring event every 30 seconds, forever.

    python seed_dummy_castings.py                     # 1 row every 30 s
    python seed_dummy_castings.py --interval 60       # 1 row every 60 s
    python seed_dummy_castings.py --interval 10       # 1 row every 10 s
    python seed_dummy_castings.py --per-tick 3        # 3 rows every tick
    python seed_dummy_castings.py --once --rows 500   # historical backfill, then exit
    python seed_dummy_castings.py --once --rows 1000 --days 30 --wipe

Behaviour:
  - Component IDs come only from `inodose_test.components` (dashboard cards
    then join cleanly).
  - A "run" is 3-25 boxes of the same component. BOX COUNT starts at 1 and
    increments inside a run; when the run ends, the simulator picks a new
    component and BOX COUNT resets to 1.
  - Pouring time per row is one of {10, 20, 30} sec. `FLOW RATE_1..40` hold
    the per-second dosage (first `pouring_time` slots filled, rest zero) and
    sum to WEIGHT OF INOCULANT +-1 g.
  - On startup in live mode, the simulator reads the latest row and resumes
    the day counters so CURRENT DAY DOSES stays continuous across restarts.

Dependencies:
    pip install pymysql python-dotenv
"""
from __future__ import annotations
import argparse
import random
import signal
import sys
import time
from datetime import datetime, timedelta

try:
    import pymysql
except ImportError:
    print("pymysql is required. Install with:  pip install pymysql python-dotenv")
    sys.exit(1)

# DB connection — edit these if your MySQL moves.
import os
HOST = os.environ.get("MYSQL_HOST", "localhost")
PORT = int(os.environ.get("MYSQL_PORT", "3306"))
USER = os.environ.get("MYSQL_USER", "root")
PASSWORD = os.environ.get("MYSQL_PASSWORD", "root")
DATA_DB = os.environ.get("MYSQL_DATA_DATABASE", "inodose_test")  # target DB for innodose_casting_details_v2
ADMIN_DB = os.environ.get("MYSQL_DATABASE", "inodose_test")      # DB that holds `components`


# ----------------------------- config -------------------------------------

parser = argparse.ArgumentParser(description="Continuous Innodose pouring simulator.")
parser.add_argument(
    "--interval",
    default="30,45,60",
    help="Seconds between ticks. A single number (e.g. 30) is a fixed interval; "
         "a comma-separated list (e.g. 30,45,60 — the default) picks one at random each tick.",
)
parser.add_argument("--per-tick", type=int, default=1, help="Rows inserted each tick (default 1).")
parser.add_argument("--once", action="store_true", help="Historical backfill mode: insert N rows and exit.")
parser.add_argument("--rows", type=int, default=500, help="Total rows for --once mode (default 500).")
parser.add_argument("--days", type=int, default=30, help="Spread for --once mode (default 30).")
parser.add_argument("--wipe", action="store_true", help="--once: DELETE existing rows first.")
parser.add_argument(
    "--component",
    default=None,
    help="Pin to one component ID (e.g. C-100). Disables auto-switching. "
         "You can still change it at runtime — type an ID at the prompt and press Enter.",
)
args = parser.parse_args()

# Parse --interval into a list of candidate seconds; pick_interval() samples one each tick.
try:
    INTERVAL_CHOICES = [float(x) for x in str(args.interval).split(",") if x.strip()]
    if not INTERVAL_CHOICES or any(v <= 0 for v in INTERVAL_CHOICES):
        raise ValueError
except ValueError:
    print(f"Invalid --interval {args.interval!r}. Use a number (30) or list (10,20,30).")
    sys.exit(1)


def pick_interval() -> float:
    return random.choice(INTERVAL_CHOICES)

PATTERNS = [f"P-{20250 + i}" for i in range(10)]
HEATS = [f"H-{2622 + i}" for i in range(20)]
LADLES = [f"L-{i + 1:02d}" for i in range(10)]
MACHINES = ["Inodose Machine 1"]


# ----------------------------- helpers ------------------------------------

def outcome_for() -> str:
    r = random.random()
    if r < 0.70:
        return "optimal"
    return "over" if r < 0.85 else "under"


def dosage_from_outcome(expected: float, outcome: str) -> float:
    if outcome == "optimal":
        return expected * random.uniform(0.96, 1.04)
    if outcome == "over":
        return expected * random.uniform(1.08, 1.20)
    return expected * random.uniform(0.75, 0.92)


def split_per_second(target: float, n: int) -> list[float]:
    """Split `target` grams into `n` per-second dosages that sum to target +-1 g."""
    mean = target / n
    raw = [mean * random.uniform(0.55, 1.45) for _ in range(n)]
    s = sum(raw)
    scaled = [v / s * target for v in raw]
    scaled[-1] += random.uniform(-1, 1)
    return [max(0.1, round(v, 1)) for v in scaled]


def connect():
    return pymysql.connect(
        host=HOST, port=PORT, user=USER, password=PASSWORD,
        database=DATA_DB, autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def load_components(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT component_id, name, grade,
                   pouring_time_sec, pouring_temp_min_c, pouring_temp_max_c,
                   flow_rate_gms_sec, expected_dosage_gms, bunch_weight_kg
            FROM `{ADMIN_DB}`.components
            WHERE active = 1
            """
        )
        return cur.fetchall()


# ----------------------------- row builder --------------------------------

class ComponentSwitch:
    """Queued component change requested from stdin or --component. Consumed on
    the next tick by the simulator loop, which starts a fresh run with the new
    component (BOX COUNT resets to 1, as if the operator loaded a new mould)."""
    def __init__(self, components):
        self.components = components
        self.pending_id: str | None = None

    def request(self, raw: str) -> str:
        cid = raw.strip().upper()
        if not cid:
            return ""
        match = next((c for c in self.components if c["component_id"].upper() == cid), None)
        if not match:
            names = ", ".join(c["component_id"] for c in self.components[:5])
            return f"unknown component '{raw.strip()}' (try one of: {names}, ...)"
        self.pending_id = match["component_id"]
        return f"queued: next pour will use {match['component_id']} ({match['name']})"


class State:
    """Keeps run-level bookkeeping across ticks."""
    def __init__(self, components):
        self.components = components
        self.current_component = None
        self.box_in_run = 0
        self.run_length = 0
        self.last_day = None
        self.heat = random.choice(HEATS)
        self.pattern = random.choice(PATTERNS)
        self.ladle = random.choice(LADLES)
        self.machine = random.choice(MACHINES)
        self.per_day = {}  # day -> {doses, missed, cum_boxes}

    def resume_from_db(self, conn):
        """Seed day counters from the latest row, so restarts are continuous."""
        with conn.cursor() as cur:
            cur.execute(
                "SELECT `COMPONENT ID`, `BOX COUNT`, DATE(datetime) AS d, "
                "`CURRENT DAY DOSES` AS doses, `CURRENT DAY MISSED DOSES` AS missed "
                "FROM innodose_casting_details_v2 "
                "ORDER BY id DESC LIMIT 1"
            )
            r = cur.fetchone()
            if not r:
                return
            today = datetime.now().date()
            if r["d"] == today:
                # continue the box numbering of the component that is running
                self.current_component = next((c for c in self.components if c["component_id"] == r["COMPONENT ID"]), None)
                self.box_in_run = int(r["BOX COUNT"] or 0)
                self.run_length = self.box_in_run + random.randint(3, 25)
                self.last_day = str(today)
                self.per_day[str(today)] = {
                    "doses": int(r["doses"] or 0),
                    "missed": int(r["missed"] or 0),
                    "cum_boxes": int(r["doses"] or 0),
                }

    def start_new_run(self, pinned_id: str | None = None):
        prev_id = self.current_component["component_id"] if self.current_component else None
        if pinned_id:
            match = next((c for c in self.components if c["component_id"] == pinned_id), None)
            self.current_component = match or random.choice(self.components)
        else:
            self.current_component = random.choice(self.components)
        # BOX COUNT only restarts when a DIFFERENT component starts. Picking the same component again just
        # carries on counting (B-21, B-22, ...), never a second "B-1" for the same component.
        if prev_id != self.current_component["component_id"]:
            self.box_in_run = 0
            self.run_length = 0
        self.run_length = self.box_in_run + random.randint(3, 25)
        if random.random() < 0.35: self.heat = random.choice(HEATS)
        if random.random() < 0.35: self.pattern = random.choice(PATTERNS)
        if random.random() < 0.25: self.ladle = random.choice(LADLES)
        if random.random() < 0.20: self.machine = random.choice(MACHINES)

    def next_row(self, t: datetime, pinned_id: str | None = None) -> dict:
        # Switch to a newly-requested component before starting a box
        if pinned_id and (self.current_component is None
                          or self.current_component["component_id"] != pinned_id):
            self.start_new_run(pinned_id)
        elif self.current_component is None or self.box_in_run >= self.run_length:
            self.start_new_run(pinned_id)

        day = t.strftime("%Y-%m-%d")
        if self.last_day is not None and day != self.last_day:
            self.box_in_run = 0  # a new day starts counting from B-1 again
        self.last_day = day
        self.box_in_run += 1
        ds = self.per_day.setdefault(day, {"doses": 0, "missed": 0, "cum_boxes": 0})
        ds["doses"] += 1
        ds["cum_boxes"] += 1
        if random.random() < 0.03:
            ds["missed"] += 1

        comp = self.current_component
        bunch_kg = round(float(comp["bunch_weight_kg"]) * random.uniform(0.95, 1.05))
        expected = float(comp["expected_dosage_gms"])
        outcome = outcome_for()
        actual = dosage_from_outcome(expected, outcome)
        flow = float(comp["flow_rate_gms_sec"])
        # Physically consistent: grams can't exceed flow rate x time, so the pour lasts actual / flow seconds
        # (~ the component's configured pouring time) instead of a random 10/20/30 s.
        pouring_time = max(1, round(actual / flow))
        per_sec = split_per_second(actual, pouring_time)
        content = (actual / (bunch_kg * 1000)) * 100
        spec_grav = random.uniform(7.1, 7.3)
        step_size = flow * random.uniform(0.9, 1.1)
        load_pv = actual + random.uniform(-1, 1)
        load_measured = load_pv + random.uniform(-0.5, 0.5)

        row: dict = {
            "datetime": t.strftime("%Y-%m-%d %H:%M:%S"),
            "WEIGHT OF CASTING": round(bunch_kg, 1),
            "CONTENT OF INOCULANT": round(content, 3),
            "POURING TIME": pouring_time,
            "SPECIFIC GRAVITY": round(spec_grav, 3),
            "WEIGHT OF INOCULANT": round(actual, 1),
            "FLOW OF INOCULANT": round(flow, 2),
            "STEP SIZE": round(step_size, 2),
            "HEAT NO": self.heat,
            "PATTERN ID": self.machine,      # "Machine" in the sub-table
            "COMPONENT ID": comp["component_id"],
            "BOX COUNT": self.box_in_run,    # 1 at start of each run
            "CUMMULATIVE BOX COUNT": ds["cum_boxes"],
            "CUMMULATIVE DOSES": ds["doses"],
            "LOAD PV": round(load_pv, 2),
            "LOAD MEASURED": round(load_measured, 2),
        }
        row["DOSAGE / SEC"] = ", ".join(f"{v:g}" for v in per_sec)
        row["CURRENT DAY DOSES"] = ds["doses"]
        row["CURRENT DAY MISSED DOSES"] = ds["missed"]
        row["LADLE"] = self.ladle
        # Expose the per-second array for live mode so the loop can reveal it
        # column-by-column (not persisted — popped before INSERT).
        row["__per_sec"] = per_sec
        return row


def _strip_internal(row: dict) -> dict:
    """Drop non-schema fields (those prefixed with '__') before writing."""
    return {k: v for k, v in row.items() if not k.startswith("__")}


def insert_row_live(conn, row: dict) -> int:
    """Insert the row with an empty per-second string and zero weight, and return its id.
    The caller then appends to `DOSAGE / SEC` and updates WEIGHT OF INOCULANT each second."""
    start = dict(_strip_internal(row))
    start["WEIGHT OF INOCULANT"] = 0.0
    start["DOSAGE / SEC"] = ""
    columns = list(start.keys())
    escaped = ", ".join(f"`{c}`" for c in columns)
    placeholders = "(" + ", ".join(["%s"] * len(columns)) + ")"
    values = [start[c] for c in columns]
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO innodose_casting_details_v2 ({escaped}) VALUES {placeholders}",
            values,
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        got = cur.fetchone()
    conn.commit()
    return int(got["id"] if isinstance(got, dict) else got[0])


def update_sec(conn, row_id: int, sec: int, flow_value: float, running_total: float) -> None:
    piece = f"{round(flow_value, 2):g}"
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE innodose_casting_details_v2 "
            "SET `DOSAGE / SEC` = CASE "
            "       WHEN `DOSAGE / SEC` IS NULL OR `DOSAGE / SEC` = '' THEN %s "
            "       ELSE CONCAT(`DOSAGE / SEC`, ', ', %s) "
            "     END, "
            "    `WEIGHT OF INOCULANT` = %s "
            "WHERE id = %s",
            [piece, piece, round(running_total, 1), row_id],
        )
    conn.commit()


def insert_rows(conn, rows: list[dict]):
    if not rows:
        return
    rows = [_strip_internal(r) for r in rows]
    columns = list(rows[0].keys())
    escaped = ", ".join(f"`{c}`" for c in columns)
    placeholder = "(" + ", ".join(["%s"] * len(columns)) + ")"
    placeholders = ", ".join(placeholder for _ in rows)
    values: list = []
    for r in rows:
        values.extend(r[c] for c in columns)
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO innodose_casting_details_v2 ({escaped}) VALUES {placeholders}",
            values,
        )
    conn.commit()


# ----------------------------- modes --------------------------------------

def run_backfill(conn, components):
    """--once: historical backfill, spread over --days days, then exit."""
    if args.wipe:
        print("Wiping innodose_casting_details_v2 ...")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM innodose_casting_details_v2")
        conn.commit()

    state = State(components)
    now = datetime.now()
    start = now - timedelta(days=args.days)
    timestamps = sorted(
        start + timedelta(seconds=random.randint(0, args.days * 86400))
        for _ in range(args.rows)
    )

    CHUNK = 100
    for i in range(0, len(timestamps), CHUNK):
        chunk = [state.next_row(t) for t in timestamps[i : i + CHUNK]]
        insert_rows(conn, chunk)
        print(f"  inserted {min(i + CHUNK, len(timestamps))}/{len(timestamps)}", end="\r", flush=True)
    print()
    print(f"Done. {len(timestamps)} rows added to `{DATA_DB}`.innodose_casting_details_v2")


def run_live(conn, components):
    """Default: emit --per-tick rows every --interval seconds, forever."""
    state = State(components)
    state.resume_from_db(conn)

    # Component switching: CLI --component + runtime stdin reader
    switch = ComponentSwitch(components)
    sticky = False  # true after --component or after a runtime pin
    auto_mode = False  # only random-switch components if user types 'auto'
    if args.component:
        msg = switch.request(args.component)
        if msg.startswith("unknown"):
            print(msg); sys.exit(1)
        sticky = True
        print(msg)

    import threading
    def stdin_reader():
        nonlocal sticky, auto_mode
        try:
            while not stop:
                raw = sys.stdin.readline()
                if not raw:
                    return
                cmd = raw.strip()
                if not cmd:
                    continue
                if cmd.lower() in ("?", "list", "components"):
                    print("Components: " + ", ".join(c["component_id"] for c in components))
                    continue
                if cmd.lower() in ("auto", "random", "unpin"):
                    switch.pending_id = None
                    sticky = False
                    auto_mode = True
                    print("auto mode: component changes randomly after each run.")
                    continue
                out = switch.request(cmd)
                if out:
                    print(out)
                    if not out.startswith("unknown"):
                        sticky = True
                        auto_mode = False
        except Exception:
            pass

    threading.Thread(target=stdin_reader, daemon=True).start()

    stop = False
    def handle_sigint(*_):
        nonlocal stop
        stop = True
        print("\nStopping after this tick ...")
    signal.signal(signal.SIGINT, handle_sigint)
    try:
        signal.signal(signal.SIGTERM, handle_sigint)
    except (AttributeError, ValueError):
        pass

    if len(INTERVAL_CHOICES) == 1:
        pace = f"every {INTERVAL_CHOICES[0]:g}s"
    else:
        pace = f"every random({','.join(f'{v:g}' for v in INTERVAL_CHOICES)})s"
    print(
        f"Live simulator: 1 tick = {args.per_tick} row(s) {pace}. "
        f"Ctrl+C to stop."
    )
    print("Type a component ID (e.g. C-100) and press Enter to switch. "
          "Type 'auto' to unpin, '?' to list, Ctrl+C to stop.")

    tick = 0
    while not stop:
        # Drain any queued component switch for this tick
        if switch.pending_id:
            # consume the request so it's only applied once; stays pinned if sticky
            pending = switch.pending_id
            if not sticky:
                switch.pending_id = None
        elif state.current_component is not None and not auto_mode:
            # Stay on the current component until the user types a new ID
            pending = state.current_component["component_id"]
        else:
            pending = None

        # Build the pour (one pour per tick) and INSERT with all per-sec slots
        # zeroed. The chart on the dashboard polls every ~1s; we then UPDATE
        # the row second by second so the cumulative line draws live.
        # Keep the numbering continuous no matter what: carry on from the highest box already stored today for this
        # component (survives restarts, a second run, or manual edits), so B-33 is always followed by B-34.
        cur_id = pending or (state.current_component["component_id"] if state.current_component else None)
        if cur_id and state.current_component and state.current_component["component_id"] == cur_id:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT MAX(`BOX COUNT`) AS m FROM innodose_casting_details_v2 "
                    "WHERE DATE(datetime) = CURDATE() AND `COMPONENT ID` = %s",
                    [cur_id],
                )
                got = cur.fetchone()
            conn.commit()
            top = int((got["m"] if isinstance(got, dict) else got[0]) or 0)
            if top > state.box_in_run:
                state.box_in_run = top
        row = state.next_row(datetime.now(), pending)
        per_sec = row.get("__per_sec") or []
        pouring_time = int(row["POURING TIME"])
        row_id = insert_row_live(conn, row)
        tick += 1

        print(
            f"[{datetime.now():%H:%M:%S}] tick {tick}: "
            f"start {row['COMPONENT ID']}  box {row['BOX COUNT']}  "
            f"pour {pouring_time}s  target {row['WEIGHT OF INOCULANT']}g  (row id {row_id})"
        )

        # Reveal per-second dosage over pouring_time seconds. If the user hits
        # Ctrl+C mid-pour we still exit cleanly and leave the partial row in DB.
        running = 0.0
        for sec in range(1, pouring_time + 1):
            if stop:
                break
            time.sleep(1)
            value = per_sec[sec - 1] if sec - 1 < len(per_sec) else 0.0
            running += value
            update_sec(conn, row_id, sec, value, running)

        # Handling gap: 2-5 s between pours plus any extra from --interval.
        handling_gap = random.uniform(2, 5)
        extra = max(0.0, pick_interval() - pouring_time - handling_gap)
        gap = handling_gap + extra
        print(
            f"[{datetime.now():%H:%M:%S}]   done: actual {running:.1f}g  "
            f"gap {gap:.1f}s before next pour"
        )
        remaining = gap
        while remaining > 0 and not stop:
            time.sleep(min(0.5, remaining))
            remaining -= 0.5
    print("Stopped.")


# ----------------------------- entrypoint ---------------------------------

conn = connect()
components = load_components(conn)
if not components:
    print(f"No active components in `{ADMIN_DB}`.components - start the backend once to seed them.")
    sys.exit(1)

if args.once:
    run_backfill(conn, components)
else:
    run_live(conn, components)

conn.close()
