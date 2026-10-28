package main

import "strings"

type appliedHunk struct {
	Path   string `json:"path"`
	Hunk   int    `json:"hunk"`
	Offset int    `json:"offset"`
}

type rejectedHunk struct {
	Path   string `json:"path"`
	Hunk   int    `json:"hunk"`
	Reason string `json:"reason"`
}

type applied struct {
	OK    bool              `json:"ok"`
	Files map[string]string `json:"files"`
	Hunks []appliedHunk     `json:"hunks"`
}

type rejected struct {
	OK       bool              `json:"ok"`
	Files    map[string]string `json:"files"`
	Rejected []rejectedHunk    `json:"rejected"`
}

const (
	noMatch = "no match"
	missing = "missing"
	exists  = "exists"
)

// fileLine is a line of a file: its text and the ending after it, "" for a last line without a newline.
type fileLine struct {
	text, eol string
}

func splitLines(text string) []fileLine {
	var lines []fileLine
	for text != "" {
		line, rest, found := strings.Cut(text, "\n")
		if !found {
			lines = append(lines, fileLine{text: line})
			break
		}
		if strings.HasSuffix(line, "\r") {
			lines = append(lines, fileLine{text: line[:len(line)-1], eol: "\r\n"})
		} else {
			lines = append(lines, fileLine{text: line, eol: "\n"})
		}
		text = rest
	}
	return lines
}

func joinLines(lines []fileLine) string {
	var b strings.Builder
	for _, line := range lines {
		b.WriteString(line.text)
		b.WriteString(line.eol)
	}
	return b.String()
}

// applyPatch applies diff to files whole or not at all; files is not modified.
func applyPatch(files map[string]string, diff string) (any, error) {
	sections, err := parseDiff(diff)
	if err != nil {
		return nil, err
	}
	work := make(map[string]string, len(files))
	for path, text := range files {
		work[path] = text
	}
	hunks := []appliedHunk{}
	var rejections []rejectedHunk
	for _, section := range sections {
		ok, rejects := applySection(work, section)
		rejections = append(rejections, rejects...)
		hunks = append(hunks, ok...)
	}
	if len(rejections) > 0 {
		return rejected{OK: false, Files: files, Rejected: rejections}, nil
	}
	return applied{OK: true, Files: work, Hunks: hunks}, nil
}

// applySection applies one file's section to work, unless any of its hunks is rejected.
func applySection(work map[string]string, f *fileDiff) ([]appliedHunk, []rejectedHunk) {
	path := f.path()
	rejectAll := func(reason string) []rejectedHunk {
		if len(f.hunks) == 0 {
			return []rejectedHunk{{Path: path, Hunk: 1, Reason: reason}}
		}
		list := make([]rejectedHunk, len(f.hunks))
		for i := range f.hunks {
			list[i] = rejectedHunk{Path: path, Hunk: i + 1, Reason: reason}
		}
		return list
	}

	var text string
	if f.created {
		if _, found := work[f.newPath]; found {
			return nil, rejectAll(exists)
		}
	} else {
		var found bool
		if text, found = work[f.oldPath]; !found {
			return nil, rejectAll(missing)
		}
		if f.renamed && f.newPath != f.oldPath {
			if _, found := work[f.newPath]; found {
				return nil, rejectAll(exists)
			}
		}
	}

	result, done, rejects := applyHunks(text, f.hunks, path)
	if len(rejects) > 0 {
		return nil, rejects
	}
	if f.deleted {
		if result != "" {
			return nil, rejectAll(noMatch)
		}
		delete(work, f.oldPath)
		return done, nil
	}
	if !f.created {
		delete(work, f.oldPath)
	}
	work[f.newPath] = result
	return done, nil
}

// applyHunks applies hunks in order to text, each where it matches nearest its stated line.
func applyHunks(text string, hunks []hunk, path string) (string, []appliedHunk, []rejectedHunk) {
	lines := splitLines(text)
	eol := "\n"
	if len(lines) > 0 && lines[0].eol != "" {
		eol = lines[0].eol
	}
	var done []appliedHunk
	var rejects []rejectedHunk
	delta := 0  // lines added minus lines removed by the hunks applied so far
	minPos := 0 // the end of the last hunk applied: no later hunk goes before it
	for n, h := range hunks {
		var old []hunkLine
		for _, line := range h.lines {
			if line.kind != '+' {
				old = append(old, line)
			}
		}
		stated := h.oldStart - 1
		if h.oldCount == 0 {
			// A hunk with no old lines inserts after its old start line.
			stated = h.oldStart
		}
		stated += delta
		pos, found := locate(lines, old, stated, minPos)
		if !found {
			rejects = append(rejects, rejectedHunk{Path: path, Hunk: n + 1, Reason: noMatch})
			continue
		}

		var replacement []fileLine
		at := pos
		for _, line := range h.lines {
			switch line.kind {
			case ' ':
				replacement = append(replacement, lines[at])
				at++
			case '-':
				at++
			case '+':
				ending := eol
				if line.noEOL {
					ending = ""
				}
				replacement = append(replacement, fileLine{text: line.text, eol: ending})
			}
		}
		next := make([]fileLine, 0, len(lines)-len(old)+len(replacement))
		next = append(next, lines[:pos]...)
		next = append(next, replacement...)
		next = append(next, lines[pos+len(old):]...)
		lines = next

		delta += len(replacement) - len(old)
		minPos = pos + len(replacement)
		done = append(done, appliedHunk{Path: path, Hunk: n + 1, Offset: pos - stated})
	}
	return joinLines(lines), done, rejects
}

// locate finds the position from minPos on, nearest stated and the earlier of two equally near, where old matches lines.
func locate(lines []fileLine, old []hunkLine, stated, minPos int) (int, bool) {
	lo, hi := minPos, len(lines)-len(old)
	if lo > hi {
		return 0, false
	}
	span := max(stated-lo, hi-stated)
	for d := 0; d <= span; d++ {
		for _, pos := range []int{stated - d, stated + d} {
			if pos >= lo && pos <= hi && matches(lines, old, pos) {
				return pos, true
			}
			if d == 0 {
				break
			}
		}
	}
	return 0, false
}

// matches reports whether old matches lines at pos. A line marked with no
// newline must be the file's last and lack one; any other must have one.
func matches(lines []fileLine, old []hunkLine, pos int) bool {
	for i, want := range old {
		got := lines[pos+i]
		if got.text != strings.TrimSuffix(want.text, "\r") {
			return false
		}
		if want.noEOL != (got.eol == "") {
			return false
		}
	}
	return true
}
