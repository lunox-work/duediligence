package main

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

var statusLabels = map[string]string{
	"open":      "Open",
	"on_hold":   "On hold",
	"filled":    "Filled",
	"cancelled": "Cancelled",
}

// row is a valid requisition, ready to be written and sorted.
type row struct {
	id       string
	title    string
	status   string
	openings string
	filled   string
	created  instant
}

// validate checks one requisition and returns its row, or the 422 message.
func validate(it item) (row, string) {
	rw := row{id: it.id}

	if raw, ok := it.fields["title"]; ok && kind(raw) != 'n' {
		if kind(raw) != '"' || json.Unmarshal(raw, &rw.title) != nil {
			return rw, "title is neither a string nor null"
		}
	}

	var status string
	raw, ok := it.fields["status"]
	if !ok || kind(raw) != '"' || json.Unmarshal(raw, &status) != nil || statusLabels[status] == "" {
		return rw, "status is not one of open, on_hold, filled or cancelled"
	}
	rw.status = statusLabels[status]

	openings, ok := wholeNumber(it.fields["openings"])
	if !ok {
		return rw, "openings is not a whole number of at least 0"
	}
	filled, ok := wholeNumber(it.fields["filled"])
	if !ok {
		return rw, "filled is not a whole number of at least 0"
	}
	if filled > openings {
		return rw, "filled is greater than openings"
	}
	rw.openings = strconv.FormatFloat(openings, 'f', -1, 64)
	rw.filled = strconv.FormatFloat(filled, 'f', -1, 64)

	var created string
	raw, ok = it.fields["createdAt"]
	if !ok || kind(raw) != '"' || json.Unmarshal(raw, &created) != nil {
		return rw, "createdAt is not a time written YYYY-MM-DDTHH:MM:SS with Z or an offset"
	}
	if rw.created, ok = parseInstant(created); !ok {
		return rw, "createdAt is not a real time written YYYY-MM-DDTHH:MM:SS with Z or an offset"
	}
	return rw, ""
}

// wholeNumber reads a JSON number, as a JSON reader of doubles would, and
// reports whether it is a finite whole number of at least 0.
func wholeNumber(raw json.RawMessage) (float64, bool) {
	k := kind(raw)
	if !(k == '-' || (k >= '0' && k <= '9')) {
		return 0, false
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(string(raw)), 64)
	// Out of range is not an error here: too large is infinite, refused
	// below; too small is 0.
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return 0, false
	}
	if math.IsInf(f, 0) || math.IsNaN(f) || f < 0 || f != math.Trunc(f) {
		return 0, false
	}
	if f == 0 {
		f = 0 // no "-0"
	}
	return f, true
}

// instant is a point in time: whole seconds since the epoch and the
// fractional digits after them, trailing zeros removed, so that it is
// compared exactly whatever the precision written.
type instant struct {
	seconds  int64
	fraction string
	date     string
}

func (a instant) less(b instant) int {
	switch {
	case a.seconds < b.seconds:
		return -1
	case a.seconds > b.seconds:
		return 1
	}
	return strings.Compare(a.fraction, b.fraction)
}

// parseInstant reads "YYYY-MM-DDTHH:MM:SS[.fff…](Z|+HH:MM|-HH:MM)".
func parseInstant(s string) (instant, bool) {
	var t instant
	digits := func(from, n int) (int, bool) {
		if from+n > len(s) {
			return 0, false
		}
		v := 0
		for i := from; i < from+n; i++ {
			c := s[i]
			if c < '0' || c > '9' {
				return 0, false
			}
			v = v*10 + int(c-'0')
		}
		return v, true
	}
	at := func(i int, c byte) bool { return i < len(s) && s[i] == c }

	year, ok1 := digits(0, 4)
	month, ok2 := digits(5, 2)
	day, ok3 := digits(8, 2)
	hour, ok4 := digits(11, 2)
	minute, ok5 := digits(14, 2)
	second, ok6 := digits(17, 2)
	if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6 &&
		at(4, '-') && at(7, '-') && at(10, 'T') && at(13, ':') && at(16, ':')) {
		return t, false
	}
	i := 19
	if at(i, '.') {
		i++
		start := i
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
		}
		if i == start {
			return t, false
		}
		t.fraction = strings.TrimRight(s[start:i], "0")
	}
	offset := 0
	switch {
	case at(i, 'Z') && i+1 == len(s):
	case (at(i, '+') || at(i, '-')) && i+6 == len(s) && at(i+3, ':'):
		oh, okh := digits(i+1, 2)
		om, okm := digits(i+4, 2)
		if !okh || !okm || oh > 23 || om > 59 {
			return t, false
		}
		offset = (oh*60 + om) * 60
		if s[i] == '-' {
			offset = -offset
		}
	default:
		return t, false
	}
	if month < 1 || month > 12 || day < 1 || day > daysIn(year, month) ||
		hour > 23 || minute > 59 || second > 59 {
		return t, false
	}
	local := daysFromCivil(year, month, day)*86400 + int64(hour*3600+minute*60+second)
	t.seconds = local - int64(offset)
	y, m, d := civilFromDays(floorDiv(t.seconds, 86400))
	t.date = pad(y, 4) + "-" + pad(m, 2) + "-" + pad(d, 2)
	return t, true
}

func daysIn(year, month int) int {
	switch month {
	case 2:
		if year%4 == 0 && (year%100 != 0 || year%400 == 0) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

func floorDiv(a, b int64) int64 {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}

// daysFromCivil is the number of days from 1970-01-01 to the given
// proleptic Gregorian date.
func daysFromCivil(y, m, d int) int64 {
	if m <= 2 {
		y--
	}
	era := floorDiv(int64(y), 400)
	yoe := int64(y) - era*400
	mp := int64((m + 9) % 12)
	doy := (153*mp+2)/5 + int64(d) - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

func civilFromDays(z int64) (int, int, int) {
	z += 719468
	era := floorDiv(z, 146097)
	doe := z - era*146097
	yoe := (doe - doe/1460 + doe/36524 - doe/146096) / 365
	y := yoe + era*400
	doy := doe - (365*yoe + yoe/4 - yoe/100)
	mp := (5*doy + 2) / 153
	d := doy - (153*mp+2)/5 + 1
	m := mp + 3
	if m > 12 {
		m -= 12
	}
	if m <= 2 {
		y++
	}
	return int(y), int(m), int(d)
}

func pad(v, width int) string {
	s := strconv.Itoa(v)
	if v < 0 {
		return "-" + pad(-v, width)
	}
	for len(s) < width {
		s = "0" + s
	}
	return s
}

// compareIDs compares ids as strings are compared in the TypeScript
// contract: by UTF-16 code units.
func compareIDs(a, b string) int {
	ua, ub := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			if ua[i] < ub[i] {
				return -1
			}
			return 1
		}
	}
	return len(ua) - len(ub)
}

// renderCSV writes the byte order mark, the header and the rows sorted by
// creation time and then id, each row ending "\r\n".
func renderCSV(rows []row) []byte {
	sort.SliceStable(rows, func(i, j int) bool {
		if c := rows[i].created.less(rows[j].created); c != 0 {
			return c < 0
		}
		return compareIDs(rows[i].id, rows[j].id) < 0
	})
	var b strings.Builder
	b.WriteString("\xef\xbb\xbf")
	b.WriteString("Requisition ID,Title,Status,Openings,Filled,Created\r\n")
	for _, rw := range rows {
		b.WriteString(quote(rw.id))
		b.WriteByte(',')
		b.WriteString(quote(defuse(rw.title)))
		b.WriteByte(',')
		b.WriteString(quote(rw.status))
		b.WriteByte(',')
		b.WriteString(rw.openings)
		b.WriteByte(',')
		b.WriteString(rw.filled)
		b.WriteByte(',')
		b.WriteString(rw.created.date)
		b.WriteString("\r\n")
	}
	return []byte(b.String())
}

// defuse puts a single quote before a title that starts like a formula.
func defuse(s string) string {
	if s != "" && strings.IndexByte("=+-@\t\r", s[0]) >= 0 {
		return "'" + s
	}
	return s
}

// quote wraps a field in double quotes when it holds a separator, a quote or
// a line break, or starts or ends with a space.
func quote(s string) string {
	if strings.ContainsAny(s, ",\"\r\n") || strings.HasPrefix(s, " ") || strings.HasSuffix(s, " ") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}
