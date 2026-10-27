"""Duration strings: parse short strings such as `1h30m` or `250ms` into
whole milliseconds, and format milliseconds back into the shortest such
string."""


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
    raise NotImplementedError("not implemented")


def format_duration(ms: int) -> str:
    """Turn milliseconds back into the shortest duration string that parses
    back to `ms`: largest units first, every zero component left out, and
    zero as "0ms".

    Raises TypeError whose message contains "milliseconds" if `ms` is a
    bool, a float (even a whole one such as 5.0) or any other non-int.
    Raises ValueError whose message contains "milliseconds" if `ms` is below
    0 or above 9007199254740991.
    """
    raise NotImplementedError("not implemented")
