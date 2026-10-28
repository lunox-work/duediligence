# The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.
import json
import os
import re
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

PATH = "/requisitions.csv"
HEADER = ["Requisition ID", "Title", "Status", "Openings", "Filled", "Created"]
STATUSES = {"open": "Open", "on_hold": "On hold", "filled": "Filled", "cancelled": "Cancelled"}
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")
TIME = re.compile(
    r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|([+-])([0-9]{2}):([0-9]{2}))"
)


class BadBody(Exception):
    pass


class BadRequisition(Exception):
    def __init__(self, message, id):
        super().__init__(message)
        self.id = id


def is_leap(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def days_in_month(year, month):
    if month == 2:
        return 29 if is_leap(year) else 28
    return 30 if month in (4, 6, 9, 11) else 31


def days_from_civil(y, m, d):
    # Days since 1970-01-01 in the proleptic Gregorian calendar.
    y -= m <= 2
    era = y // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def civil_from_days(z):
    z += 719468
    era = z // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + (3 if mp < 10 else -9)
    return y + (m <= 2), m, d


def parse_time(value):
    """Returns (the instant in seconds since the epoch, exact; the UTC date as text), or None."""
    if not isinstance(value, str):
        return None
    match = TIME.fullmatch(value)
    if not match:
        return None
    year, month, day, hour, minute, second = (int(match.group(k)) for k in range(1, 7))
    if not (1 <= month <= 12 and 1 <= day <= days_in_month(year, month)):
        return None
    if hour > 23 or minute > 59 or second > 59:
        return None
    offset = 0
    if match.group(8) != "Z":
        offset_hours, offset_minutes = int(match.group(10)), int(match.group(11))
        if offset_hours > 23 or offset_minutes > 59:
            return None
        offset = (offset_hours * 60 + offset_minutes) * 60
        if match.group(9) == "-":
            offset = -offset
    seconds = days_from_civil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset
    fraction = match.group(7)
    instant = seconds + (Fraction(int(fraction), 10 ** len(fraction)) if fraction else 0)
    y, m, d = civil_from_days(seconds // 86400)
    return instant, "%04d-%02d-%02d" % (y, m, d)


def whole_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float) and value.is_integer() and value >= 0:
        return int(value)
    return None


def check(item):
    id = item["id"]
    status = item.get("status")
    if not isinstance(status, str) or status not in STATUSES:
        raise BadRequisition("unknown status", id)
    title = item.get("title")
    if title is not None and not isinstance(title, str):
        raise BadRequisition("title is neither a string nor null", id)
    openings = whole_number(item.get("openings"))
    if openings is None:
        raise BadRequisition("openings is not a whole number of at least 0", id)
    filled = whole_number(item.get("filled"))
    if filled is None:
        raise BadRequisition("filled is not a whole number of at least 0", id)
    if filled > openings:
        raise BadRequisition("filled is greater than openings", id)
    time = parse_time(item.get("createdAt"))
    if time is None:
        raise BadRequisition("createdAt is not a valid time", id)
    instant, date = time
    fields = [id, defuse(title or ""), STATUSES[status], str(openings), str(filled), date]
    # Ids compared as strings, by UTF-16 code units.
    return (instant, id.encode("utf-16-be")), fields


def defuse(text):
    return "'" + text if text.startswith(FORMULA_STARTS) else text


def quote(field):
    if any(c in field for c in ',"\r\n') or field.startswith(" ") or field.endswith(" "):
        return '"' + field.replace('"', '""') + '"'
    return field


def row(fields):
    return ",".join(quote(field) for field in fields) + "\r\n"


def reject_constant(name):
    raise ValueError("not JSON: " + name)


def parse_body(raw):
    try:
        body = json.loads(raw.decode("utf-8"), parse_constant=reject_constant)
    except ValueError:
        raise BadBody("the body is not JSON")
    if not isinstance(body, list):
        raise BadBody("the body is not an array")
    for item in body:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise BadBody("an item is not an object with a string id")
    return body


def export(raw):
    rows = [check(item) for item in parse_body(raw)]
    rows.sort(key=lambda r: r[0])
    return ("﻿" + row(HEADER) + "".join(row(fields) for _, fields in rows)).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def read_body(self):
        if "chunked" in self.headers.get("transfer-encoding", "").lower():
            data = b""
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    while self.rfile.readline() not in (b"\r\n", b"\n", b""):
                        pass
                    return data
                data += self.rfile.read(size)
                self.rfile.readline()
        length = int(self.headers.get("content-length") or 0)
        return self.rfile.read(length) if length > 0 else b""

    def send(self, status, body=b"", content_type=None, headers=()):
        self.send_response(status)
        if content_type:
            self.send_header("content-type", content_type)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status, body, headers=()):
        data = json.dumps(body).encode("utf-8")
        self.send(status, data, "application/json; charset=utf-8", headers)

    def answer(self):
        try:
            raw = self.read_body()
        except (ValueError, OSError):
            self.close_connection = True
            self.send_json(400, {"error": "the body could not be read"})
            return
        if urlsplit(self.path).path != PATH:
            self.send_json(404, {"error": "not found"})
            return
        if self.command != "POST":
            self.send_json(405, {"error": "method not allowed"}, [("allow", "POST")])
            return
        try:
            csv = export(raw)
        except BadBody as e:
            self.send_json(400, {"error": str(e)})
            return
        except BadRequisition as e:
            self.send_json(422, {"error": str(e), "id": e.id})
            return
        self.send(
            200,
            csv,
            "text/csv; charset=utf-8",
            [("content-disposition", 'attachment; filename="requisitions.csv"')],
        )

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = answer

    def log_message(self, *_):
        pass


ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ["PORT"])), Handler).serve_forever()
