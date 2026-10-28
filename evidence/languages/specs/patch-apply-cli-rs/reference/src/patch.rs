//! Parsing a unified diff in git's format and applying it, whole or not at all.

/// A set of files, each a path and its text, in their input order.
pub type Files = Vec<(String, String)>;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Reason {
    NoMatch,
    Missing,
    Exists,
}

impl Reason {
    pub fn as_str(self) -> &'static str {
        match self {
            Reason::NoMatch => "no match",
            Reason::Missing => "missing",
            Reason::Exists => "exists",
        }
    }
}

pub struct AppliedHunk {
    pub path: String,
    pub hunk: usize,
    pub offset: i64,
}

pub struct RejectedHunk {
    pub path: String,
    pub hunk: usize,
    pub reason: Reason,
}

pub enum ApplyResult {
    Applied { files: Files, hunks: Vec<AppliedHunk> },
    Rejected { files: Files, rejected: Vec<RejectedHunk> },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Context,
    Removed,
    Added,
}

#[derive(Debug)]
struct HunkLine {
    kind: Kind,
    text: String,
    /// Followed by "\ No newline at end of file".
    no_newline: bool,
}

#[derive(Debug)]
struct Hunk {
    old_start: usize,
    old_count: usize,
    lines: Vec<HunkLine>,
}

#[derive(Debug, Default)]
struct FilePatch {
    git_old: Option<String>,
    git_new: Option<String>,
    old_path: Option<String>,
    new_path: Option<String>,
    old_is_null: bool,
    new_is_null: bool,
    new_file: bool,
    deleted_file: bool,
    rename_from: Option<String>,
    rename_to: Option<String>,
    has_headers: bool,
    hunks: Vec<Hunk>,
}

impl FilePatch {
    fn is_new(&self) -> bool {
        self.old_is_null || (self.new_file && self.old_path.is_none())
    }

    fn is_deleted(&self) -> bool {
        self.new_is_null || (self.deleted_file && self.new_path.is_none())
    }

    /// The path the file is read from.
    fn source(&self) -> Option<String> {
        self.rename_from.clone().or_else(|| self.old_path.clone()).or_else(|| self.git_old.clone())
    }

    /// The path the file is written to.
    fn target(&self) -> Option<String> {
        self.rename_to.clone().or_else(|| self.new_path.clone()).or_else(|| self.git_new.clone())
    }

    /// The path its hunks are reported under: the "+++" path, or the "---" path for a deleted file.
    fn report_path(&self) -> String {
        let path = if self.is_deleted() { self.source() } else { self.target() };
        path.unwrap_or_default()
    }
}

/// Splits text into lines, each without its final "\n"; a final empty piece is not a line.
fn split_lines(text: &str) -> Vec<&str> {
    let mut lines: Vec<&str> = text.split('\n').collect();
    if lines.last() == Some(&"") {
        lines.pop();
    }
    lines
}

fn strip_cr(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

/// A header path with its "a/" or "b/" prefix removed, or None for "/dev/null".
fn header_path(raw: &str, prefix: &str) -> Option<String> {
    let raw = raw.split('\t').next().unwrap_or(raw).trim_end();
    if raw == "/dev/null" {
        return None;
    }
    Some(raw.strip_prefix(prefix).unwrap_or(raw).to_string())
}

/// The two paths of a "diff --git a/X b/Y" line.
fn git_paths(rest: &str) -> (Option<String>, Option<String>) {
    // Prefer the split where both sides name the same path, as git writes for an in-place change.
    if rest.len() % 2 == 1 {
        let half = rest.len() / 2;
        if rest.is_char_boundary(half) && rest.is_char_boundary(half + 1) {
            let (a, b) = (&rest[..half], &rest[half + 1..]);
            if rest.as_bytes()[half] == b' ' {
                if let (Some(a), Some(b)) = (a.strip_prefix("a/"), b.strip_prefix("b/")) {
                    if a == b {
                        return (Some(a.to_string()), Some(b.to_string()));
                    }
                }
            }
        }
    }
    match rest.rfind(" b/") {
        Some(i) => {
            let a = &rest[..i];
            let b = &rest[i + 3..];
            (Some(a.strip_prefix("a/").unwrap_or(a).to_string()), Some(b.to_string()))
        }
        None => (None, None),
    }
}

fn parse_range(text: &str, sign: char) -> Option<(usize, usize)> {
    let text = text.strip_prefix(sign)?;
    let mut parts = text.splitn(2, ',');
    let start = parts.next()?.parse().ok()?;
    let count = match parts.next() {
        Some(c) => c.parse().ok()?,
        None => 1,
    };
    Some((start, count))
}

fn parse_hunk_header(line: &str) -> Result<(usize, usize, usize, usize), String> {
    let bad = || format!("malformed hunk header: {line}");
    let rest = line.strip_prefix("@@ ").ok_or_else(bad)?;
    let end = rest.find(" @@").ok_or_else(bad)?;
    let mut ranges = rest[..end].split(' ');
    let (old_start, old_count) = ranges.next().and_then(|r| parse_range(r, '-')).ok_or_else(bad)?;
    let (new_start, new_count) = ranges.next().and_then(|r| parse_range(r, '+')).ok_or_else(bad)?;
    if ranges.next().is_some() {
        return Err(bad());
    }
    Ok((old_start, old_count, new_start, new_count))
}

fn parse(diff: &str) -> Result<Vec<FilePatch>, String> {
    let lines: Vec<&str> = split_lines(diff).into_iter().map(strip_cr).collect();
    let mut patches: Vec<FilePatch> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let (git_old, git_new) = git_paths(rest);
            patches.push(FilePatch { git_old, git_new, ..FilePatch::default() });
            i += 1;
        } else if line.starts_with("--- ") && i + 1 < lines.len() && lines[i + 1].starts_with("+++ ") {
            // A file's headers; outside a "diff --git" section, or after its hunks, they begin a new file.
            let starts_new = match patches.last() {
                None => true,
                Some(p) => p.has_headers || !p.hunks.is_empty(),
            };
            if starts_new {
                patches.push(FilePatch::default());
            }
            let patch = patches.last_mut().unwrap();
            patch.has_headers = true;
            patch.old_path = header_path(&line[4..], "a/");
            patch.old_is_null = patch.old_path.is_none();
            patch.new_path = header_path(&lines[i + 1][4..], "b/");
            patch.new_is_null = patch.new_path.is_none();
            i += 2;
        } else if line.starts_with("@@") {
            let patch = patches.last_mut().ok_or("hunk before any file header")?;
            let (old_start, old_count, _new_start, new_count) = parse_hunk_header(line)?;
            let mut hunk = Hunk { old_start, old_count, lines: Vec::new() };
            let (mut old_left, mut new_left) = (old_count, new_count);
            i += 1;
            let message = format!(
                "hunk {} of {} has fewer lines than its header counts",
                patch.hunks.len() + 1,
                patch.report_path()
            );
            let short = || message.clone();
            while old_left > 0 || new_left > 0 {
                let Some(&body) = lines.get(i) else {
                    return Err(short());
                };
                let (kind, text) = if let Some(text) = body.strip_prefix(' ') {
                    (Kind::Context, text)
                } else if body.is_empty() {
                    (Kind::Context, "")
                } else if let Some(text) = body.strip_prefix('-') {
                    (Kind::Removed, text)
                } else if let Some(text) = body.strip_prefix('+') {
                    (Kind::Added, text)
                } else if body.starts_with('\\') {
                    if let Some(last) = hunk.lines.last_mut() {
                        last.no_newline = true;
                    }
                    i += 1;
                    continue;
                } else {
                    return Err(short());
                };
                let (takes_old, takes_new) = match kind {
                    Kind::Context => (true, true),
                    Kind::Removed => (true, false),
                    Kind::Added => (false, true),
                };
                if (takes_old && old_left == 0) || (takes_new && new_left == 0) {
                    return Err(short());
                }
                if takes_old {
                    old_left -= 1;
                }
                if takes_new {
                    new_left -= 1;
                }
                hunk.lines.push(HunkLine { kind, text: text.to_string(), no_newline: false });
                i += 1;
            }
            if lines.get(i).is_some_and(|l| l.starts_with('\\')) {
                if let Some(last) = hunk.lines.last_mut() {
                    last.no_newline = true;
                }
                i += 1;
            }
            patch.hunks.push(hunk);
        } else {
            if let Some(patch) = patches.last_mut() {
                if line.starts_with("new file mode") {
                    patch.new_file = true;
                } else if line.starts_with("deleted file mode") {
                    patch.deleted_file = true;
                } else if let Some(path) = line.strip_prefix("rename from ") {
                    patch.rename_from = Some(path.to_string());
                } else if let Some(path) = line.strip_prefix("rename to ") {
                    patch.rename_to = Some(path.to_string());
                }
            }
            i += 1;
        }
    }
    Ok(patches)
}

/// A line of a file: its text and its ending, "\n", "\r\n", or "" for a last line without one.
#[derive(Debug, Clone)]
struct Line {
    text: String,
    ending: String,
}

fn to_lines(text: &str) -> Vec<Line> {
    let mut lines = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        match rest.find('\n') {
            Some(i) => {
                let raw = &rest[..i];
                let (text, ending) = match raw.strip_suffix('\r') {
                    Some(t) => (t, "\r\n"),
                    None => (raw, "\n"),
                };
                lines.push(Line { text: text.to_string(), ending: ending.to_string() });
                rest = &rest[i + 1..];
            }
            None => {
                lines.push(Line { text: rest.to_string(), ending: String::new() });
                rest = "";
            }
        }
    }
    lines
}

fn from_lines(lines: &[Line]) -> String {
    lines.iter().map(|l| format!("{}{}", l.text, l.ending)).collect()
}

/// The ending a file's added lines take: that of its first line, or "\n" when it has none.
fn file_ending(lines: &[Line]) -> String {
    match lines.first() {
        Some(l) if !l.ending.is_empty() => l.ending.clone(),
        _ => "\n".to_string(),
    }
}

fn matches_at(lines: &[Line], old: &[&HunkLine], pos: usize) -> bool {
    old.iter().enumerate().all(|(k, h)| {
        let line = &lines[pos + k];
        line.text == h.text && (!h.no_newline || (pos + k == lines.len() - 1 && line.ending.is_empty()))
    })
}

/// Finds where a hunk's old lines match, at or after `min_pos`, nearest to `stated`, the earlier on a tie.
fn locate(lines: &[Line], hunk: &Hunk, stated: i64, min_pos: usize) -> Option<usize> {
    let old: Vec<&HunkLine> = hunk.lines.iter().filter(|h| h.kind != Kind::Added).collect();
    if old.len() > lines.len() {
        return None;
    }
    let last = lines.len() - old.len();
    let mut best: Option<usize> = None;
    for pos in min_pos..=last {
        if !matches_at(lines, &old, pos) {
            continue;
        }
        let distance = (pos as i64 - stated).abs();
        match best {
            Some(b) if (b as i64 - stated).abs() <= distance => {}
            _ => best = Some(pos),
        }
    }
    best
}

/// Replaces the hunk's old lines at `pos` with its new lines; returns the number of new lines.
fn splice(lines: &mut Vec<Line>, hunk: &Hunk, pos: usize, ending: &str) -> usize {
    let old_len = hunk.lines.iter().filter(|h| h.kind != Kind::Added).count();
    let reaches_end = pos + old_len == lines.len();
    let mut replacement: Vec<Line> = Vec::new();
    let mut cursor = pos;
    let mut last_marked = false;
    for h in &hunk.lines {
        match h.kind {
            Kind::Context => {
                replacement.push(lines[cursor].clone());
                cursor += 1;
                last_marked = h.no_newline;
            }
            Kind::Removed => cursor += 1,
            Kind::Added => {
                replacement.push(Line { text: h.text.clone(), ending: ending.to_string() });
                last_marked = h.no_newline;
            }
        }
    }
    let count = replacement.len();
    for (k, line) in replacement.iter_mut().enumerate() {
        if k + 1 < count && line.ending.is_empty() {
            line.ending = ending.to_string();
        }
    }
    if reaches_end {
        if let Some(line) = replacement.last_mut() {
            if last_marked {
                line.ending.clear();
            } else if line.ending.is_empty() {
                line.ending = ending.to_string();
            }
        }
    } else if let Some(line) = replacement.last_mut() {
        if line.ending.is_empty() {
            line.ending = ending.to_string();
        }
    }
    lines.splice(pos..pos + old_len, replacement);
    count
}

/// Applies a file's hunks in order to its lines; returns each hunk's offset or None where it did not match.
fn apply_hunks(lines: &mut Vec<Line>, hunks: &[Hunk]) -> Vec<Option<i64>> {
    let ending = file_ending(lines);
    let mut delta: i64 = 0;
    let mut min_pos = 0;
    let mut outcomes = Vec::new();
    for hunk in hunks {
        let start = if hunk.old_count == 0 { hunk.old_start } else { hunk.old_start.saturating_sub(1) };
        let stated = start as i64 + delta;
        match locate(lines, hunk, stated, min_pos) {
            Some(pos) => {
                let old_len = hunk.lines.iter().filter(|h| h.kind != Kind::Added).count();
                let new_len = splice(lines, hunk, pos, &ending);
                delta += new_len as i64 - old_len as i64;
                min_pos = pos + new_len;
                outcomes.push(Some(pos as i64 - stated));
            }
            None => outcomes.push(None),
        }
    }
    outcomes
}

fn get<'a>(files: &'a Files, path: &str) -> Option<&'a String> {
    files.iter().find(|(p, _)| p == path).map(|(_, t)| t)
}

fn remove(files: &mut Files, path: &str) {
    files.retain(|(p, _)| p != path);
}

fn insert(files: &mut Files, path: String, text: String) {
    match files.iter_mut().find(|(p, _)| *p == path) {
        Some(entry) => entry.1 = text,
        None => files.push((path, text)),
    }
}

/// Apply a unified diff in git's format to a set of files, whole or not at all.
pub fn apply_patch(files: &Files, diff: &str) -> Result<ApplyResult, String> {
    let patches = parse(diff)?;
    let mut work = files.clone();
    let mut applied = Vec::new();
    let mut rejected = Vec::new();

    for patch in &patches {
        let path = patch.report_path();
        let reject_all = |rejected: &mut Vec<RejectedHunk>, reason: Reason| {
            for n in 1..=patch.hunks.len().max(1) {
                rejected.push(RejectedHunk { path: path.clone(), hunk: n, reason });
            }
        };

        let (source_text, source) = if patch.is_new() {
            let target = patch.target().unwrap_or_default();
            if get(&work, &target).is_some() {
                reject_all(&mut rejected, Reason::Exists);
                continue;
            }
            (String::new(), None)
        } else {
            let source = patch.source().unwrap_or_default();
            match get(&work, &source) {
                Some(text) => (text.clone(), Some(source)),
                None => {
                    reject_all(&mut rejected, Reason::Missing);
                    continue;
                }
            }
        };

        let mut lines = to_lines(&source_text);
        let outcomes = apply_hunks(&mut lines, &patch.hunks);
        let mut ok = true;
        for (k, outcome) in outcomes.iter().enumerate() {
            match outcome {
                Some(offset) => applied.push(AppliedHunk { path: path.clone(), hunk: k + 1, offset: *offset }),
                None => {
                    ok = false;
                    rejected.push(RejectedHunk { path: path.clone(), hunk: k + 1, reason: Reason::NoMatch });
                }
            }
        }
        if !ok {
            continue;
        }

        if patch.is_deleted() {
            // A deletion must remove the file's whole text.
            if !lines.is_empty() {
                let hunk = patch.hunks.len().max(1);
                applied.retain(|h: &AppliedHunk| !(h.path == path && h.hunk == hunk));
                rejected.push(RejectedHunk { path: path.clone(), hunk, reason: Reason::NoMatch });
                continue;
            }
            if let Some(source) = source {
                remove(&mut work, &source);
            }
            continue;
        }

        let target = patch.target().unwrap_or_default();
        if let Some(source) = source {
            if source != target {
                remove(&mut work, &source);
            }
        }
        let text = if patch.hunks.is_empty() { source_text } else { from_lines(&lines) };
        insert(&mut work, target, text);
    }

    if rejected.is_empty() {
        Ok(ApplyResult::Applied { files: work, hunks: applied })
    } else {
        Ok(ApplyResult::Rejected { files: files.clone(), rejected })
    }
}
