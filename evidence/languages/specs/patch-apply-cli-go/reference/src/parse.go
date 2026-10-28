package main

import (
	"fmt"
	"strconv"
	"strings"
)

// lineKind is a hunk line's first character: ' ' context, '-' removed, '+' added.
type lineKind byte

type hunkLine struct {
	kind lineKind
	text string
	// noEOL is set when "\ No newline at end of file" follows the line.
	noEOL bool
}

type hunk struct {
	oldStart, oldCount int
	newStart, newCount int
	lines              []hunkLine
}

// fileDiff is one file's section of the diff.
type fileDiff struct {
	oldPath, newPath string
	created, deleted bool
	renamed          bool
	hunks            []hunk
}

// path is the path its hunks are reported under: the "+++" path, or the "---" path for a deleted file.
func (f *fileDiff) path() string {
	if f.deleted {
		return f.oldPath
	}
	return f.newPath
}

const devNull = "/dev/null"

// parseDiff splits a unified diff in git's format into its file sections.
func parseDiff(diff string) ([]*fileDiff, error) {
	lines := strings.Split(diff, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	for i, line := range lines {
		lines[i] = strings.TrimSuffix(line, "\r")
	}

	var files []*fileDiff
	var current *fileDiff
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		switch {
		case strings.HasPrefix(line, "diff --git "):
			current = &fileDiff{}
			current.oldPath, current.newPath = gitLinePaths(strings.TrimPrefix(line, "diff --git "))
			files = append(files, current)
		case current != nil && len(current.hunks) == 0 && strings.HasPrefix(line, "new file mode"):
			current.created = true
		case current != nil && len(current.hunks) == 0 && strings.HasPrefix(line, "deleted file mode"):
			current.deleted = true
		case current != nil && len(current.hunks) == 0 && strings.HasPrefix(line, "rename from "):
			current.renamed = true
			current.oldPath = unquote(strings.TrimPrefix(line, "rename from "))
		case current != nil && len(current.hunks) == 0 && strings.HasPrefix(line, "rename to "):
			current.renamed = true
			current.newPath = unquote(strings.TrimPrefix(line, "rename to "))
		case strings.HasPrefix(line, "--- ") && i+1 < len(lines) && strings.HasPrefix(lines[i+1], "+++ "):
			// Inside a git section before its hunks, the headers belong to it;
			// anywhere else they start a section of their own.
			if current == nil || len(current.hunks) > 0 {
				current = &fileDiff{}
				files = append(files, current)
			}
			oldPath := headerPath(strings.TrimPrefix(line, "--- "), "a/")
			newPath := headerPath(strings.TrimPrefix(lines[i+1], "+++ "), "b/")
			if oldPath == devNull {
				current.created = true
			} else {
				current.oldPath = oldPath
			}
			if newPath == devNull {
				current.deleted = true
			} else {
				current.newPath = newPath
			}
			i++
		case strings.HasPrefix(line, "@@"):
			if current == nil {
				return nil, fmt.Errorf("line %d: hunk before any file header", i+1)
			}
			h, next, err := parseHunk(lines, i)
			if err != nil {
				return nil, err
			}
			current.hunks = append(current.hunks, h)
			i = next - 1
		}
		// Any other line outside a hunk (index, mode, similarity lines) carries nothing to apply.
	}
	for _, f := range files {
		if f.created {
			f.oldPath = f.newPath
		}
		if f.deleted {
			f.newPath = f.oldPath
		}
	}
	return files, nil
}

// parseHunk reads the hunk whose header is lines[at], returning it and the index of the line after it.
func parseHunk(lines []string, at int) (hunk, int, error) {
	var h hunk
	header := lines[at]
	rest, ok := strings.CutPrefix(header, "@@ -")
	if !ok {
		return h, 0, fmt.Errorf("line %d: malformed hunk header %q", at+1, header)
	}
	ranges, _, ok := strings.Cut(rest, " @@")
	if !ok {
		return h, 0, fmt.Errorf("line %d: malformed hunk header %q", at+1, header)
	}
	oldRange, newRange, ok := strings.Cut(ranges, " +")
	if !ok {
		return h, 0, fmt.Errorf("line %d: malformed hunk header %q", at+1, header)
	}
	var err1, err2 error
	h.oldStart, h.oldCount, err1 = parseRange(oldRange)
	h.newStart, h.newCount, err2 = parseRange(newRange)
	if err1 != nil || err2 != nil {
		return h, 0, fmt.Errorf("line %d: malformed hunk header %q", at+1, header)
	}

	oldSeen, newSeen := 0, 0
	i := at + 1
	for ; i < len(lines) && (oldSeen < h.oldCount || newSeen < h.newCount); i++ {
		line := lines[i]
		if line == "" {
			// An empty context line whose space was stripped.
			line = " "
		}
		kind := lineKind(line[0])
		switch kind {
		case ' ':
			oldSeen++
			newSeen++
		case '-':
			oldSeen++
		case '+':
			newSeen++
		case '\\':
			if err := markNoEOL(&h, i); err != nil {
				return h, 0, err
			}
			continue
		default:
			return h, 0, shortHunk(at, h, oldSeen, newSeen)
		}
		if oldSeen > h.oldCount || newSeen > h.newCount {
			return h, 0, fmt.Errorf("line %d: hunk has more lines than its header %q counts", i+1, header)
		}
		h.lines = append(h.lines, hunkLine{kind: kind, text: line[1:]})
	}
	if oldSeen < h.oldCount || newSeen < h.newCount {
		return h, 0, shortHunk(at, h, oldSeen, newSeen)
	}
	if i < len(lines) && strings.HasPrefix(lines[i], "\\") {
		if err := markNoEOL(&h, i); err != nil {
			return h, 0, err
		}
		i++
	}
	return h, i, nil
}

func markNoEOL(h *hunk, at int) error {
	if len(h.lines) == 0 {
		return fmt.Errorf("line %d: no-newline marker before any hunk line", at+1)
	}
	h.lines[len(h.lines)-1].noEOL = true
	return nil
}

func shortHunk(at int, h hunk, oldSeen, newSeen int) error {
	return fmt.Errorf("line %d: hunk has %d old and %d new lines, but its header counts %d and %d",
		at+1, oldSeen, newSeen, h.oldCount, h.newCount)
}

// parseRange parses "start[,count]", a missing count meaning 1.
func parseRange(s string) (start, count int, err error) {
	startText, countText, hasCount := strings.Cut(s, ",")
	if start, err = strconv.Atoi(startText); err != nil || start < 0 {
		return 0, 0, fmt.Errorf("bad range %q", s)
	}
	count = 1
	if hasCount {
		if count, err = strconv.Atoi(countText); err != nil || count < 0 {
			return 0, 0, fmt.Errorf("bad range %q", s)
		}
	}
	return start, count, nil
}

// headerPath is the path of a "---" or "+++" header, without its prefix.
func headerPath(s, prefix string) string {
	// git ends a header path containing a space with a tab.
	s, _, _ = strings.Cut(s, "\t")
	s = unquote(s)
	if s == devNull {
		return s
	}
	return strings.TrimPrefix(s, prefix)
}

// gitLinePaths splits the "a/<old> b/<new>" of a "diff --git" line.
func gitLinePaths(s string) (string, string) {
	if strings.HasPrefix(s, `"`) {
		if end := closingQuote(s); end > 0 {
			old := unquote(s[:end+1])
			newPath := unquote(strings.TrimPrefix(s[end+1:], " "))
			return strings.TrimPrefix(old, "a/"), strings.TrimPrefix(newPath, "b/")
		}
	}
	// The same path twice: "a/" + p + " b/" + p.
	if n := len(s); n >= 5 && (n-5)%2 == 0 {
		l := (n - 5) / 2
		if strings.HasPrefix(s, "a/") && s[2+l:2+l+3] == " b/" && s[2:2+l] == s[n-l:] {
			return s[2 : 2+l], s[n-l:]
		}
	}
	if old, newPath, ok := strings.Cut(s, " b/"); ok {
		return strings.TrimPrefix(old, "a/"), newPath
	}
	return strings.TrimPrefix(s, "a/"), strings.TrimPrefix(s, "a/")
}

func closingQuote(s string) int {
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
		case '"':
			return i
		}
	}
	return -1
}

// unquote undoes git's C-style quoting of a path with unusual characters.
func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		if u, err := strconv.Unquote(s); err == nil {
			return u
		}
	}
	return s
}
