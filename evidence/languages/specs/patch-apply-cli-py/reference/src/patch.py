"""Apply a unified diff in git's format to a set of files, whole or not at all."""
import re

HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
DEV_NULL = "/dev/null"


class MalformedDiff(Exception):
    pass


class Hunk:
    def __init__(self, old_start, old_count, new_start, new_count):
        self.old_start = old_start
        self.old_count = old_count
        self.new_start = new_start
        self.new_count = new_count
        # Each line is [kind, text, no_newline] with kind one of " ", "-", "+".
        self.lines = []

    def old_lines(self):
        return [line for line in self.lines if line[0] != "+"]


class FileDiff:
    def __init__(self, git_old=None, git_new=None):
        self.git_old = git_old
        self.git_new = git_new
        self.old_header = None
        self.new_header = None
        self.rename_from = None
        self.rename_to = None
        self.new_file = False
        self.deleted_file = False
        self.hunks = []

    @property
    def is_new(self):
        return self.new_file or self.old_header == DEV_NULL

    @property
    def is_delete(self):
        return self.deleted_file or self.new_header == DEV_NULL

    @property
    def old_path(self):
        if self.old_header is not None and self.old_header != DEV_NULL:
            return self.old_header
        if self.rename_from is not None:
            return self.rename_from
        if self.git_old is not None:
            return self.git_old
        return self.new_header

    @property
    def new_path(self):
        if self.new_header is not None and self.new_header != DEV_NULL:
            return self.new_header
        if self.rename_to is not None:
            return self.rename_to
        if self.git_new is not None:
            return self.git_new
        return self.old_header

    @property
    def path(self):
        """The path a hunk is reported under: the "+++" path, or the "---" path for a deleted file."""
        return self.old_path if self.is_delete else self.new_path


def strip_prefix(path, prefix):
    return path[len(prefix):] if path.startswith(prefix) else path


def header_path(rest, prefix):
    if "\t" in rest:
        rest = rest.split("\t", 1)[0]
    if rest == DEV_NULL:
        return DEV_NULL
    return strip_prefix(rest, prefix)


def git_paths(rest):
    """The a/ and b/ paths of a "diff --git a/X b/Y" line."""
    if not rest.startswith("a/"):
        return None, None
    candidates = [i for i in range(len(rest)) if rest.startswith(" b/", i)]
    if not candidates:
        return None, None
    for i in candidates:
        old, new = rest[2:i], rest[i + 3:]
        if old == new:
            return old, new
    i = candidates[-1]
    return rest[2:i], rest[i + 3:]


def parse_diff(diff):
    lines = diff.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    lines = [line[:-1] if line.endswith("\r") else line for line in lines]

    files = []
    current = None
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("diff --git "):
            old, new = git_paths(line[len("diff --git "):])
            current = FileDiff(old, new)
            files.append(current)
        elif line.startswith("@@"):
            if current is None:
                raise MalformedDiff("malformed diff: a hunk comes before any file header")
            hunk, i = parse_hunk(lines, i)
            current.hunks.append(hunk)
            continue
        elif line.startswith("--- "):
            if current is None or current.hunks or current.old_header is not None:
                current = FileDiff()
                files.append(current)
            current.old_header = header_path(line[4:], "a/")
        elif line.startswith("+++ ") and current is not None and not current.hunks:
            current.new_header = header_path(line[4:], "b/")
        elif current is not None and not current.hunks:
            if line.startswith("new file mode"):
                current.new_file = True
            elif line.startswith("deleted file mode"):
                current.deleted_file = True
            elif line.startswith("rename from "):
                current.rename_from = line[len("rename from "):]
            elif line.startswith("rename to "):
                current.rename_to = line[len("rename to "):]
        i += 1
    return files


def parse_hunk(lines, i):
    match = HUNK_HEADER.match(lines[i])
    if match is None:
        raise MalformedDiff(f"malformed hunk header: {lines[i]}")
    old_start, old_count, new_start, new_count = match.groups()
    hunk = Hunk(
        int(old_start),
        1 if old_count is None else int(old_count),
        int(new_start),
        1 if new_count is None else int(new_count),
    )
    old_left, new_left = hunk.old_count, hunk.new_count
    i += 1

    def short():
        return MalformedDiff(
            f"malformed hunk \"{lines_header}\": fewer lines than its header counts"
        )

    lines_header = match.group(0)
    while old_left > 0 or new_left > 0:
        if i >= len(lines):
            raise short()
        line = lines[i]
        if line.startswith("\\"):
            if hunk.lines:
                hunk.lines[-1][2] = True
            i += 1
            continue
        kind = line[0] if line else " "
        text = line[1:]
        if kind == " ":
            if old_left == 0 or new_left == 0:
                raise short()
            old_left -= 1
            new_left -= 1
        elif kind == "-":
            if old_left == 0:
                raise short()
            old_left -= 1
        elif kind == "+":
            if new_left == 0:
                raise short()
            new_left -= 1
        else:
            raise short()
        hunk.lines.append([kind, text, False])
        i += 1
    if i < len(lines) and lines[i].startswith("\\"):
        if hunk.lines:
            hunk.lines[-1][2] = True
        i += 1
    return hunk, i


def split_lines(text):
    """The lines of a text, each a (content, ending) pair."""
    result = []
    parts = text.split("\n")
    for part in parts[:-1]:
        if part.endswith("\r"):
            result.append((part[:-1], "\r\n"))
        else:
            result.append((part, "\n"))
    if parts[-1] != "":
        result.append((parts[-1], ""))
    return result


def file_ending(lines):
    if lines and lines[0][1]:
        return lines[0][1]
    return "\n"


def matches_at(lines, old, position):
    if position + len(old) > len(lines):
        return False
    for k, (_, text, no_newline) in enumerate(old):
        content, ending = lines[position + k]
        if content != text:
            return False
        if no_newline and (position + k != len(lines) - 1 or ending != ""):
            return False
    return True


def locate(lines, old, stated, minimum):
    """The matching position nearest to `stated`, not before `minimum`, earlier on a tie."""
    last = len(lines) - len(old)
    if last < minimum:
        return None
    distance = 0
    limit = max(abs(stated - minimum), abs(stated - last))
    while distance <= limit:
        for position in (stated - distance, stated + distance):
            if minimum <= position <= last and matches_at(lines, old, position):
                return position
            if distance == 0:
                break
        distance += 1
    return None


def apply_hunk(lines, hunk, position, ending):
    replacement = []
    k = position
    for kind, text, no_newline in hunk.lines:
        if kind == " ":
            content, own = lines[k]
            k += 1
            replacement.append((content, "" if no_newline else (own or ending)))
        elif kind == "-":
            k += 1
        else:
            replacement.append((text, "" if no_newline else ending))
    return lines[:position] + replacement + lines[k:]


def apply_hunks(lines, file_diff, ending, path, applied, rejected):
    """Apply each hunk in order; returns the new lines."""
    delta = 0
    minimum = 0
    for number, hunk in enumerate(file_diff.hunks, start=1):
        old = hunk.old_lines()
        start = hunk.old_start if hunk.old_count == 0 else hunk.old_start - 1
        stated = max(start + delta, 0)
        position = locate(lines, old, stated, minimum)
        if position is None:
            rejected.append({"path": path, "hunk": number, "reason": "no match"})
            continue
        lines = apply_hunk(lines, hunk, position, ending)
        new_len = sum(1 for line in hunk.lines if line[0] != "-")
        delta += new_len - len(old)
        minimum = position + new_len
        applied.append({"path": path, "hunk": number, "offset": position - stated})
    return lines


def join_lines(lines):
    return "".join(content + ending for content, ending in lines)


def reject_all(file_diff, path, reason, rejected):
    count = max(len(file_diff.hunks), 1)
    for number in range(1, count + 1):
        rejected.append({"path": path, "hunk": number, "reason": reason})


def apply_patch(files, diff):
    file_diffs = parse_diff(diff)
    work = dict(files)
    applied = []
    rejected = []

    for file_diff in file_diffs:
        path = file_diff.path
        if file_diff.is_new:
            target = file_diff.new_path
            if target in work:
                reject_all(file_diff, path, "exists", rejected)
                continue
            lines = apply_hunks([], file_diff, "\n", path, applied, rejected)
            work[target] = join_lines(lines)
            continue

        source = file_diff.old_path
        if source not in work:
            reject_all(file_diff, path, "missing", rejected)
            continue
        original = split_lines(work[source])
        before = len(rejected)
        lines = apply_hunks(original, file_diff, file_ending(original), path, applied, rejected)
        if len(rejected) > before:
            continue

        if file_diff.is_delete:
            if lines:
                # The removed lines were not the file's whole text: the last hunk falls short of it.
                last = max(len(file_diff.hunks), 1)
                rejected.append({"path": path, "hunk": last, "reason": "no match"})
                continue
            del work[source]
            continue

        target = file_diff.new_path
        text = work[source] if not file_diff.hunks else join_lines(lines)
        del work[source]
        work[target] = text

    if rejected:
        return {"ok": False, "files": dict(files), "rejected": rejected}
    return {"ok": True, "files": work, "hunks": applied}
