"""Duration strings: parse short strings such as `1h30m` or `250ms` into
whole milliseconds, and format milliseconds back into the shortest such
string."""

MAX_MS = 9007199254740991  # 2**53 - 1

# Largest first; the order in which units must appear.
_UNITS = (
    ("d", 86_400_000),
    ("h", 3_600_000),
    ("m", 60_000),
    ("s", 1_000),
    ("ms", 1),
)
_RANK = {name: rank for rank, (name, _) in enumerate(_UNITS)}
_SIZE = dict(_UNITS)
_DIGITS = "0123456789"
_MAX_DIGITS = len(str(MAX_MS))


def parse_duration(text: str) -> int:
    """Turn a duration string into milliseconds.

    A duration is one or more components, each a decimal integer followed by
    one of the units `d`, `h`, `m`, `s` and `ms`, with units running from
    largest to smallest, each at most once. Leading and trailing whitespace
    is removed before parsing. The result is the sum of the components in
    milliseconds, as an int no larger than 9007199254740991 (2**53 - 1).

    Raises TypeError whose message contains "duration" if `text` is not a
    string. Raises ValueError whose message contains "duration" if the text
    is not a valid duration or its total exceeds 9007199254740991 ms.
    """
    if not isinstance(text, str):
        raise TypeError(
            f"duration must be a string, not {type(text).__name__}"
        )
    s = text.strip()
    if not s:
        raise ValueError("invalid duration: empty string")

    total = 0
    last_rank = -1
    i, n = 0, len(s)
    while i < n:
        start = i
        while i < n and s[i] in _DIGITS:
            i += 1
        digits = s[start:i]
        if not digits:
            raise ValueError(f"invalid duration {text!r}: expected a number")
        if len(digits) > 1 and digits[0] == "0":
            raise ValueError(
                f"invalid duration {text!r}: leading zero in {digits!r}"
            )
        if s.startswith("ms", i):
            unit = "ms"
        elif i < n and s[i] in "dhms":
            unit = s[i]
        else:
            raise ValueError(
                f"invalid duration {text!r}: expected a unit after {digits!r}"
            )
        i += len(unit)
        rank = _RANK[unit]
        if rank <= last_rank:
            raise ValueError(
                f"invalid duration {text!r}: unit {unit!r} out of order "
                "or repeated"
            )
        last_rank = rank
        if len(digits) > _MAX_DIGITS:
            raise ValueError(
                f"duration {text!r} exceeds {MAX_MS} milliseconds"
            )
        total += int(digits) * _SIZE[unit]
        if total > MAX_MS:
            raise ValueError(
                f"duration {text!r} exceeds {MAX_MS} milliseconds"
            )
    return total


def format_duration(ms: int) -> str:
    """Turn milliseconds back into the shortest duration string that parses
    back to `ms`: largest units first, every zero component left out, and
    zero as "0ms".

    Raises TypeError whose message contains "milliseconds" if `ms` is a
    bool, a float (even a whole one such as 5.0) or any other non-int.
    Raises ValueError whose message contains "milliseconds" if `ms` is below
    0 or above 9007199254740991.
    """
    if isinstance(ms, bool) or not isinstance(ms, int):
        raise TypeError(
            f"milliseconds must be an int, not {type(ms).__name__}"
        )
    if ms < 0 or ms > MAX_MS:
        raise ValueError(
            f"milliseconds must be between 0 and {MAX_MS}, got {ms}"
        )
    if ms == 0:
        return "0ms"
    parts = []
    rest = int(ms)
    for name, size in _UNITS:
        count, rest = divmod(rest, size)
        if count:
            parts.append(f"{count}{name}")
    return "".join(parts)
