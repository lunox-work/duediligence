// An implementation of L0.md, written to check the spec, not to judge:
// bin/ladder/build.mjs runs it on every case and requires it to agree with
// git, so a rule L0 states wrongly or leaves out shows up as a
// disagreement before any agent runs. Follows git's dir.c and wildmatch.c.

/** The patterns of a .gitignore, in order. */
function parse(text) {
  const patterns = [];
  for (let line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    line = trimTrailingSpaces(line);
    if (line === "") continue;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith("/") && !line.endsWith("\\/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (line === "") continue;
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    patterns.push({ glob: line, negated, dirOnly, anchored });
  }
  return patterns;
}

/** Trailing spaces go unless the last one is escaped with a backslash. */
function trimTrailingSpaces(line) {
  let lastSpace = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === " ") {
      if (lastSpace < 0) lastSpace = i;
    } else if (line[i] === "\\") {
      i += 1;
      lastSpace = -1;
    } else lastSpace = -1;
  }
  return lastSpace < 0 ? line : line.slice(0, lastSpace);
}

/** wildmatch with WM_PATHNAME: `*`, `?` and brackets never match `/`; `**` between slashes spans them. */
function wildmatch(p, t, pi = 0, ti = 0) {
  while (pi < p.length) {
    const c = p[pi];
    if (c === "\\") {
      pi += 1;
      if (t[ti] !== p[pi]) return false;
      pi += 1;
      ti += 1;
      continue;
    }
    if (c === "?") {
      if (ti >= t.length || t[ti] === "/") return false;
      pi += 1;
      ti += 1;
      continue;
    }
    if (c === "*") {
      let stars = 0;
      while (p[pi] === "*") {
        stars += 1;
        pi += 1;
      }
      const before = pi - stars - 1;
      const spans =
        stars >= 2 && (before < 0 || p[before] === "/") && (pi === p.length || p[pi] === "/");
      if (spans) {
        // `**/` also matches no directory at all.
        if (p[pi] === "/" && wildmatch(p, t, pi + 1, ti)) return true;
        for (let k = ti; k <= t.length; k += 1) if (wildmatch(p, t, pi, k)) return true;
        return false;
      }
      for (let k = ti; k <= t.length; k += 1) {
        if (wildmatch(p, t, pi, k)) return true;
        if (t[k] === "/") return false;
      }
      return false;
    }
    if (c === "[") {
      const end = bracketEnd(p, pi);
      if (end < 0) {
        if (t[ti] !== "[") return false;
        pi += 1;
        ti += 1;
        continue;
      }
      if (ti >= t.length || t[ti] === "/" || !inBracket(p.slice(pi + 1, end), t[ti])) return false;
      pi = end + 1;
      ti += 1;
      continue;
    }
    if (t[ti] !== c) return false;
    pi += 1;
    ti += 1;
  }
  return ti === t.length;
}

function bracketEnd(p, start) {
  let i = start + 1;
  if (p[i] === "!" || p[i] === "^") i += 1;
  if (p[i] === "]") i += 1;
  for (; i < p.length; i += 1) {
    if (p[i] === "\\") i += 1;
    else if (p[i] === "]") return i;
  }
  return -1;
}

function inBracket(body, ch) {
  let negate = false;
  let i = 0;
  if (body[0] === "!" || body[0] === "^") {
    negate = true;
    i = 1;
  }
  let hit = false;
  let first = true;
  while (i < body.length) {
    let lo = body[i];
    if (lo === "\\") lo = body[(i += 1)];
    else if (lo === "]" && !first) break;
    first = false;
    if (body[i + 1] === "-" && i + 2 < body.length) {
      let hi = body[i + 2];
      let step = 3;
      if (hi === "\\") {
        hi = body[i + 3];
        step = 4;
      }
      if (lo <= ch && ch <= hi) hit = true;
      i += step;
    } else {
      if (lo === ch) hit = true;
      i += 1;
    }
  }
  return hit !== negate;
}

function matches(pattern, path, isDir) {
  if (pattern.dirOnly && !isDir) return false;
  if (pattern.anchored) return wildmatch(pattern.glob, path);
  return wildmatch(pattern.glob, path.slice(path.lastIndexOf("/") + 1));
}

/** The last pattern matching `path` decides; none matching means not excluded. */
function excluded(patterns, path, isDir) {
  for (let i = patterns.length - 1; i >= 0; i -= 1)
    if (matches(patterns[i], path, isDir)) return !patterns[i].negated;
  return false;
}

export function isIgnored(gitignore, path) {
  const patterns = parse(gitignore);
  const parts = path.split("/");
  for (let depth = 1; depth < parts.length; depth += 1)
    if (excluded(patterns, parts.slice(0, depth).join("/"), true)) return true;
  return excluded(patterns, path, false);
}
